"use server";

import { getFleetLastPositions, getVehicleTrips, parseEcofleetTimestamp, EcofleetError, type EcofleetPosition, type EcofleetTrip } from "./ecofleet";
import {
  calculateToll,
  FIXED_VEHICLE,
  geocodeAddress,
  reverseGeocodeCoords,
  suggestAddresses,
  TollCalcError,
  type GeocodedAddress,
  type TollRoute,
} from "./utdijkalkulacio";
import { fetchGazolajAr, GazolajArError } from "./uzemanyagar";
import {
  epitsIdovonal,
  haversineKm,
  idovonalPontjai,
  jelolMegallokElhagyottkent,
  kiegesziteloAllapottal,
  parseIdopontSzoveg,
  type EloPozicio,
  type TervezettFuvarSzakasz,
  type TervezettMegallo,
} from "./idovonal";
import { SAJAT_JARMUVEK, resolveJarmu, type JarmuSzin, type SajatJarmu } from "./vehicles";
import { bontsMegallokra, varosNev } from "./varos";
import { getFuvarokIdoszakban, getMaiSajatFuvarok, getMaiValodiSajatFuvarok } from "./megbizasok";
import type { FuvarTipus, MaiFuvarSor } from "./fuvar-constants";
import { budapestFalioraToInstant, budapestHetNapja, budapestNapISO, budapestOra } from "./idozona";
import { SAJAT_TELEPHELYEK } from "./telephelyek";

// Ha a NAV oldala nem érhető el (átmeneti hiba, oldalszerkezet-változás),
// ez a tartalék érték jelenik meg — utoljára kézzel ellenőrizve 2026.
// szeptemberében. Csak akkor használódik, ha az automatikus lekérés hibázik.
const GAZOLAJ_AR_TARTALEK = { ar: 667, cimke: "2026. szeptember (tartalék érték)" };

// A flotta mindig ugyanott tankol, ahol literenként 50 Ft kedvezményt kap a
// NAV hivatalos árához képest — ezt a kalkulátor a NAV-áron automatikusan
// levonja.
const TANKOLASI_KEDVEZMENY_FT_PER_LITER = 50;

export type GazolajArResult = {
  /** A ténylegesen alkalmazandó ár (NAV ár - kedvezmény) — ezzel kell számolni. */
  ar: number;
  /** A NAV hivatalos, kedvezmény nélküli ára — csak tájékoztatásul. */
  navAr: number;
  kedvezmeny: number;
  cimke: string;
  /** false, ha a NAV oldaláról nem sikerült frissen lekérni, és a tartalék érték jelenik meg. */
  friss: boolean;
};

/**
 * A NAV hivatalos, aktuális havi gázolajárának automatikus lekérése (napi
 * cache-eléssel), a flotta állandó tankolási kedvezményével csökkentve.
 */
export async function getGazolajAr(): Promise<GazolajArResult> {
  const kedvezmeny = TANKOLASI_KEDVEZMENY_FT_PER_LITER;
  try {
    const { ar, cimke } = await fetchGazolajAr();
    return { ar: ar - kedvezmeny, navAr: ar, kedvezmeny, cimke, friss: true };
  } catch (err) {
    if (!(err instanceof GazolajArError)) {
      console.error("[uzemanyagar] váratlan hiba:", err);
    }
    return {
      ar: GAZOLAJ_AR_TARTALEK.ar - kedvezmeny,
      navAr: GAZOLAJ_AR_TARTALEK.ar,
      kedvezmeny,
      cimke: GAZOLAJ_AR_TARTALEK.cimke,
      friss: false,
    };
  }
}

export type EcofleetPositionWithCim = EcofleetPosition & {
  /** A pozíció koordinátájából visszafejtett, olvasható cím — a GPS-kártyán
   *  ez jelenik meg a kocsi neve mellett, a sebesség/egyéb adatok előtt.
   *  `null`, ha a fordított geokódolás nem sikerült. */
  cim: string | null;
};

export type FleetPositionResult =
  | { ok: true; positions: EcofleetPositionWithCim[] }
  | { ok: false; error: string };

export async function getFleetPositions(): Promise<FleetPositionResult> {
  try {
    const positions = await getFleetLastPositions();
    // Rendszám szerint, hogy a felület mindig ugyanabban a sorrendben mutassa.
    positions.sort((a, b) => a.plate.localeCompare(b.plate));
    // Csak néhány (2-3) saját jármű van, ezért a fordított geokódolás
    // párhuzamosan, korlátozás nélkül elfér — nem kell a toll-kalkulátor
    // címkeresésénél alkalmazott párhuzamosság-korlátozás.
    const withCim = await Promise.all(
      positions.map(async (p) => ({
        ...p,
        cim: await reverseGeocodeCoords(p.latitude, p.longitude),
      }))
    );
    return { ok: true, positions: withCim };
  } catch (err) {
    const message =
      err instanceof EcofleetError
        ? err.message
        : "Nem sikerült lekérni a jármű-pozíciókat.";
    return { ok: false, error: message };
  }
}

/** Egy tervezett fuvar egyetlen fel-/lerakó pontja, a napi megbízás-listán egy sorral — a megjelenített napra vagy a rákövetkezőre eső időponttal (lásd JarmuIdovonalEredmeny.holnapiMegallok). */
export type MegalloBejegyzes = {
  fuvarId: string;
  /** FIGYELEM: fordított UI-címkézés, lásd TervezettFuvarSzakasz.fuvarTipus. */
  fuvarTipus: FuvarTipus;
  megrendelo: string | null;
  pozicioszam: string | null;
  tipus: "felrako" | "lerako";
  cim: string;
  /** Elhagyott pontnál a tényleges (GPS szerinti) időpont, egyébként a tervezett/becsült. */
  idopont: Date;
  elhagyva: boolean;
};

export type JarmuIdovonalEredmeny = {
  sofor: string;
  szin: JarmuSzin;
  /** Élő GPS-pozíció a jármű-csempe infó-dobozához (cím, sebesség, utolsó adat ideje, óraállás) — csak a mai napra. */
  eloPozicio: {
    cim: string | null;
    sebesseg: number;
    utolsoAdat: Date;
    oraallasKm: number | null;
  } | null;
  /** Élő GPS-pozícióból becsült érkezés a legközelebbi, még el nem hagyott fel-/lerakó ponthoz — csak a mai napra. */
  eloEta: { cel: string; erkezes: Date } | null;
  hiba: string | null;
  /** A megjelenített napra eső fel-/lerakó pontok, időrendben (a fuvar-szintű adatok is elérhetők belőlük: megrendelo/pozicioszam/fuvarTipus). */
  maiMegallok: MegalloBejegyzes[];
  /** Azok a fel-/lerakó pontok, amik a becsült/tényleges időpontjuk szerint a következő naptári napra csúsztak át (pl. hosszú út miatt éjfél után érne oda). */
  holnapiMegallok: MegalloBejegyzes[];
};

/**
 * "Europe/Budapest" szerinti naptári nap határai — a szerver tényleges
 * (jellemzően UTC) időzónájától FÜGGETLENÜL számolva (lásb idozona.ts),
 * mert egy sima `new Date("YYYY-MM-DDT00:00:00")` a szerver helyi
 * időzónáját venné alapul, ami akár 1-2 órás eltolódást okozna a valós
 * budapesti naphatárhoz képest.
 */
function budapestNapHatarok(nap?: string): { kezdet: Date; veg: Date; napISO: string; maiNap: boolean } {
  const maiNapISO = budapestNapISO();
  const celNap = nap ?? maiNapISO;
  const [ev, ho, napSzam] = celNap.split("-").map(Number);
  const kezdet = budapestFalioraToInstant(ev, ho, napSzam, 0, 0, 0);
  const maiNap = celNap === maiNapISO;
  const veg = maiNap ? new Date() : budapestFalioraToInstant(ev, ho, napSzam, 23, 59, 59);
  return { kezdet, veg, napISO: celNap, maiNap };
}

/**
 * Egy "YYYY-MM-DD" naptári naphoz `delta` nappal odébbi naptári nap
 * ("YYYY-MM-DD") — dél (UTC 12:00) horgonnyal számolva, hogy a naptári nap
 * a nyári/téli időszámítás-váltás körül se csúszhasson el.
 */
function napIsoEltolva(napISO: string, delta: number): string {
  const [ev, ho, napSzam] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, napSzam + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const RAKODAS_PUFFER_PERC = 30;
const LERAKODAS_PUFFER_PERC = 45;
/** Ha egy megbízáson nincs megadva időpont, ezt tekintjük becsült felrakás-kezdésnek. */
const ALAPERTELMEZETT_FELRAKAS_ORA = 7;
/** Ha a cím nem geokódolható / az útvonal nem számolható, ennyi menetidőt feltételezünk. */
const ALAPERTELMEZETT_UTVONAL_PERC = 120;
/** Ha a lerakás a felrakástól eltérő napra esik (row.lerakas_datum), ezt tekintjük durva alapértelmezett lerakási órának azon a napon — élő GPS-pozíció esetén a lancoltEloBecsles felülírja. */
const ALAPERTELMEZETT_LERAKAS_ORA = 8;

/**
 * Egy megbízás sora AKKOR és CSAK AKKOR tartozik egy adott saját járműhöz,
 * ha a "jarmu" mező (a "Kocsi" választó, az elsődleges, hiteles jelölő)
 * arra a járműre mutat. A "sofor" (szabad szöveg) mezőt csak akkor vonjuk
 * be, ha a "jarmu" mező teljesen üres — SOHA nem a kettőt egymástól
 * függetlenül, "vagy" kapcsolattal, mert az korábban valódi hibát okozott:
 * ha egy megbízáson a két mező (adatbeviteli hiba miatt) egymásnak
 * ellentmond — pl. a "Kocsi" Gergő rendszámára van állítva, de a "Sofőr"
 * szabad szöveg mezőbe tévedésből "Micó" került —, a régi "vagy" logika a
 * sort MINDKÉT jármű idővonalára belistázta, így Micónál olyan
 * fel-/lerakók is megjelentek, amik valójában nem az ő fuvarjai voltak.
 */
function driverMatchesRow(jarmu: SajatJarmu, row: MaiFuvarSor): boolean {
  if (row.jarmu) {
    return resolveJarmu(row.jarmu) === jarmu;
  }
  return !!row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase();
}

/** Ennél közelebb (km) egy saját telephelyhez/parkolóhoz a pozíciót "ott vagyunk"-nak tekintjük. */
const TELEPHELY_TAVOLSAG_KM = 0.6;

type TelephelyPont = { nev: string; lat: number; lon: number };

// SAJAT_TELEPHELYEK címei csak egyszer, a szerver-folyamat élettartama alatt
// gyorsítótárazva geokódolódnak (ugyanazzal a HU-GO címkereséssel, amit a
// megbízások fel-/lerakó címeinél is használunk) — nem kell minden
// getIdovonalak-híváskor újra lekérni, mert ezek a címek nem változnak.
let telephelyPontokCache: Promise<TelephelyPont[]> | null = null;

function getTelephelyPontok(): Promise<TelephelyPont[]> {
  if (!telephelyPontokCache) {
    telephelyPontokCache = Promise.all(
      SAJAT_TELEPHELYEK.map(async (t) => {
        try {
          const g = await geocodeAddress(t.cim);
          return { nev: t.nev, lat: g.lat, lon: g.lon };
        } catch {
          return null;
        }
      })
    ).then((pontok) => pontok.filter((p): p is TelephelyPont => p !== null));
  }
  return telephelyPontokCache;
}

/** Ha a megadott koordináta egy saját telephely/parkoló közelében van, annak olvasható neve — egyébként null. */
function talalSajatTelephelyet(lat: number, lon: number, telephelyek: TelephelyPont[]): string | null {
  return telephelyek.find((t) => haversineKm(lat, lon, t.lat, t.lon) < TELEPHELY_TAVOLSAG_KM)?.nev ?? null;
}

// --- Önmagát kalibráló menetidő-becslés, napszak/nap-típus szerint ---
//
// A HU-GO route-planner (calculateToll) egy statikus úthálózat-modell
// alapján számol (lásd utdijkalkulacio.ts) — nincs benne élő forgalom,
// ezért a valóságban (torlódás, rakodóhelyi keresgélés, pihenő stb. miatt)
// rendszerint tovább tart egy út, mint amit mond. Élő forgalmi API (Waze,
// Google Maps stb.) nincs bevonva — nincs rá se hivatalos, ingyenes elérés
// (Waze), se ingyenes út (Google Maps Routes API fizetős). Ehelyett a
// MEGLÉVŐ Ecofleet GPS-előzményből tanulunk: a torlódás nagy része nem
// véletlenszerű, hanem visszatérő mintázat (reggeli/délutáni csúcsforgalom,
// hétvégi vs. hétköznapi forgalom) — ezt a saját trip-előzményünkből,
// napszakonként/nap-típusonként külön korrekciós szorzóval közelítjük,
// nem egyetlen globális átlaggal. Ez nem helyettesíti a valódi élő
// (baleset/útlezárás-szintű) forgalmi adatot, de a tervezéshez releváns
// "mikor szokott lassabb lenni" mintázatot new API/költség nélkül megadja.

/** Ennél rövidebb (km) trip-eket kihagyjuk a kalibrációs mintából (telephelyi/portai mozgás, túl zajos). */
const KALIBRACIO_MIN_TAV_KM = 25;
/** Ennyi napra visszamenőleg gyűjtünk trip-eket a mintához. */
const KALIBRACIO_MINTA_NAP = 21;
/** Legfeljebb ennyi trip-et vetünk össze a HU-GO-val (korlátozza a hálózati hívások számát). */
const KALIBRACIO_MAX_MINTA = 40;
/** Ennél kevesebb sikeres összevetés esetén nem bízunk a (globális vagy napszaki) mintában, marad az 1.0 / a globális szorzó. */
const KALIBRACIO_MIN_MINTASZAM = 5;
const KALIBRACIO_MIN_MINTASZAM_IDOSAV = 3;
/** Ennyi óránként frissítjük legfeljebb a kalibrációt — nem kell minden getIdovonalak-híváskor újraszámolni. */
const KALIBRACIO_ERVENYESSEG_ORA = 24;

/** Napszak/nap-típus sáv, aminek külön korrekciós szorzót tanulunk — a hétvége azért külön, mert a fuvarozási forgalom ott jellemzően egészen más képet mutat, mint hétköznap. */
type Idosav = "hetvege" | "csucs_reggel" | "napkozben" | "csucs_delutan" | "esti_ejszakai";

function idosavja(d: Date): Idosav {
  const hetNapja = budapestHetNapja(d);
  if (hetNapja === 0 || hetNapja === 6) return "hetvege";
  const ora = budapestOra(d);
  if (ora >= 6 && ora < 9) return "csucs_reggel";
  if (ora >= 9 && ora < 15) return "napkozben";
  if (ora >= 15 && ora < 19) return "csucs_delutan";
  return "esti_ejszakai";
}

type KalibraciosEredmeny = {
  globalisSzorzo: number;
  idosavSzorzok: Partial<Record<Idosav, number>>;
  mintaSzam: number;
  szamitva: Date;
};

let kalibraciosCache: KalibraciosEredmeny | null = null;

/** [valós mp, HU-GO mp] összegekből 1.0-2.0 közé szorított arányt számol, vagy null-t, ha nincs elég minta. */
function aranySzamitasa(valosSzumSec: number, hugoSzumSec: number, mintaSzam: number, minMintaszam: number): number | null {
  if (mintaSzam < minMintaszam || hugoSzumSec <= 0) return null;
  // 1 alá sosem visz (a HU-GO becslésnél gyorsabb valós menetidőt nem
  // valószínűsítünk), és 2x-nél jobban sem torzítja — kiugró minták ne
  // vigyék el a becslést irreális irányba.
  return Math.min(2, Math.max(1, valosSzumSec / hugoSzumSec));
}

/**
 * A saját flotta legutóbbi (KALIBRACIO_MINTA_NAP napnyi) trip-jeiből egy
 * véletlenszerű mintát vet össze a HU-GO ugyanarra az útvonalra adott
 * elméleti becslésével — egyszerre egy globális arányt (minden mintából),
 * és napszakonkénti/nap-típusonkénti arányokat (lásd Idosav) is számol,
 * hogy egy adott indulási időponthoz a hozzá illő korrekció legyen
 * alkalmazható. Gyorsítótárazva, hogy ne kelljen minden hívásnál
 * újraszámolni (ez mintánként egy calculateToll hálózati hívással jár).
 */
async function szamitsKalibraciot(): Promise<KalibraciosEredmeny> {
  const most = new Date();
  if (kalibraciosCache && most.getTime() - kalibraciosCache.szamitva.getTime() < KALIBRACIO_ERVENYESSEG_ORA * 3600000) {
    return kalibraciosCache;
  }

  const veg = most;
  const kezdet = new Date(most.getTime() - KALIBRACIO_MINTA_NAP * 86400000);
  const jarmuvek = SAJAT_JARMUVEK.filter((j) => j.ecofleetObjectId !== null);

  const mindenTrip = (
    await Promise.all(jarmuvek.map((j) => getVehicleTrips(j.ecofleetObjectId!, kezdet, veg).catch(() => [] as EcofleetTrip[])))
  ).flat();

  const jelentosTripek = mindenTrip
    .filter((t) => t.distance >= KALIBRACIO_MIN_TAV_KM && parseEcofleetTimestamp(t.startTimestamp))
    .sort(() => Math.random() - 0.5)
    .slice(0, KALIBRACIO_MAX_MINTA);

  let globalisValosSec = 0;
  let globalisHugoSec = 0;
  let globalisMinta = 0;
  const idosavOsszesek: Record<Idosav, { valosSec: number; hugoSec: number; minta: number }> = {
    hetvege: { valosSec: 0, hugoSec: 0, minta: 0 },
    csucs_reggel: { valosSec: 0, hugoSec: 0, minta: 0 },
    napkozben: { valosSec: 0, hugoSec: 0, minta: 0 },
    csucs_delutan: { valosSec: 0, hugoSec: 0, minta: 0 },
    esti_ejszakai: { valosSec: 0, hugoSec: 0, minta: 0 },
  };

  for (const t of jelentosTripek) {
    try {
      const route = await calculateToll({
        points: [
          { lon: t.startLongitude, lat: t.startLatitude },
          { lon: t.endLongitude, lat: t.endLatitude },
        ],
        ...FIXED_VEHICLE,
      });
      const hugoSec = route.durationMin * 60;
      globalisValosSec += t.duration;
      globalisHugoSec += hugoSec;
      globalisMinta++;

      const sav = idosavja(parseEcofleetTimestamp(t.startTimestamp)!);
      idosavOsszesek[sav].valosSec += t.duration;
      idosavOsszesek[sav].hugoSec += hugoSec;
      idosavOsszesek[sav].minta++;
    } catch {
      // egy sikertelen összevetés nem számít bele — a többi mintából még lehet becsülni
    }
  }

  const globalisSzorzo = aranySzamitasa(globalisValosSec, globalisHugoSec, globalisMinta, KALIBRACIO_MIN_MINTASZAM) ?? 1;

  const idosavSzorzok: Partial<Record<Idosav, number>> = {};
  for (const [sav, osszeg] of Object.entries(idosavOsszesek) as [Idosav, { valosSec: number; hugoSec: number; minta: number }][]) {
    const szorzo = aranySzamitasa(osszeg.valosSec, osszeg.hugoSec, osszeg.minta, KALIBRACIO_MIN_MINTASZAM_IDOSAV);
    if (szorzo !== null) idosavSzorzok[sav] = szorzo;
  }

  kalibraciosCache = { globalisSzorzo, idosavSzorzok, mintaSzam: globalisMinta, szamitva: most };
  return kalibraciosCache;
}

/** A megadott (várható indulási) időponthoz illő korrekciós szorzó: a napszak/nap-típus szerinti, ha van rá elég minta, egyébként a globális. */
function valasszKalibraciosSzorzot(kalibracio: KalibraciosEredmeny, idopont: Date): number {
  return kalibracio.idosavSzorzok[idosavja(idopont)] ?? kalibracio.globalisSzorzo;
}

/** Egy jövőbeli nap egyetlen fel-/lerakó pontja a "következő napok" előnézetben — csak városnévvel, geokódolás/útvonalszámítás nélkül. */
export type KovetkezoNapMegallo = {
  fuvarId: string;
  fuvarTipus: FuvarTipus;
  megrendelo: string | null;
  tipus: "felrako" | "lerako";
  cim: string;
};

export type KovetkezoNap = {
  napISO: string;
  megallok: KovetkezoNapMegallo[];
};

/**
 * A mai napot követő `napokSzama` naptári nap tervezett fuvarjainak gyors
 * előnézete, saját járművenként, napi bontásban — csak városnévvel (nincs
 * geokódolás/útvonalszámítás, hogy a nézet gyors maradjon; a pontos
 * időbecslés úgyis csak akkor lenne értelmes, ha az adott nap ténylegesen
 * elérkezett és van élő GPS-pozíció, lásd getIdovonalak).
 */
export async function getKovetkezoNapokElonezet(napokSzama = 3): Promise<Record<string, KovetkezoNap[]>> {
  const maiNapISO = budapestNapISO();
  const elsoNap = napIsoEltolva(maiNapISO, 1);
  const utolsoNap = napIsoEltolva(maiNapISO, napokSzama);
  const sorok = await getFuvarokIdoszakban(elsoNap, utolsoNap).catch(() => []);

  const eredmeny: Record<string, KovetkezoNap[]> = {};
  for (const jarmu of SAJAT_JARMUVEK) {
    const napok: KovetkezoNap[] = [];
    for (let i = 1; i <= napokSzama; i++) napok.push({ napISO: napIsoEltolva(maiNapISO, i), megallok: [] });
    eredmeny[jarmu.sofor] = napok;
  }

  for (const row of sorok) {
    const jarmu = SAJAT_JARMUVEK.find((j) => driverMatchesRow(j, row));
    if (!jarmu) continue;
    // A felrakás és a lerakás külön napra eshet (row.lerakas_datum) — pl.
    // ha a fuvar egy éjszakai (saját telephelyi) megállással jár, a
    // felrakás és a lerakás más-más napi bontásba kerül, nem mindkettő a
    // felrakás napjára.
    const felrakoNap = eredmeny[jarmu.sofor].find((n) => n.napISO === row.datum);
    if (row.felrako && felrakoNap) {
      felrakoNap.megallok.push({ fuvarId: row.id, fuvarTipus: row.tipus, megrendelo: row.megrendelo, tipus: "felrako", cim: varosNev(row.felrako) });
    }
    const lerakoNap = eredmeny[jarmu.sofor].find((n) => n.napISO === (row.lerakas_datum ?? row.datum));
    if (lerakoNap) {
      lerakoNap.megallok.push({ fuvarId: row.id, fuvarTipus: row.tipus, megrendelo: row.megrendelo, tipus: "lerako", cim: varosNev(row.lerako) });
    }
  }

  return eredmeny;
}

async function becsulFuvarSzakasz(row: MaiFuvarSor, fuvarTipus: FuvarTipus, kalibracio: KalibraciosEredmeny): Promise<TervezettFuvarSzakasz> {
  const parsedIdo = parseIdopontSzoveg(row.idopont);
  const idoBizonytalan = !parsedIdo;
  const [ev, ho, napSzam] = row.datum.split("-").map(Number);
  // budapestFalioraToInstant (NEM a nyers new Date(...) konstruktor) kell
  // ide — a szerver (Railway, UTC) helyi ideje eltér Budapesttől, a nyers
  // konstruktor a megadott órát tévesen szerver-időként értelmezné.
  const kezdet = budapestFalioraToInstant(ev, ho, napSzam, parsedIdo?.ora ?? ALAPERTELMEZETT_FELRAKAS_ORA, parsedIdo?.perc ?? 0, 0);

  // A felrakó/lerakó mező néha több állomást tartalmaz egyetlen szövegben
  // összefűzve (pl. két lerakóhely egy körjáraton) — bontsMegallokra ezt
  // ismeri fel, és állomásonként (a teljes, geokódolható szöveggel) adja
  // vissza, hogy se a geokódolás (egy összefűzött szövegen próbálva
  // megbízhatatlan), se a megjelenítés (varosNev, lásd cim lentebb) ne
  // törjön el rajta.
  const megallokSzovegei = [
    ...bontsMegallokra(row.felrako).map((szoveg) => ({ tipus: "felrako" as const, szoveg })),
    ...bontsMegallokra(row.lerako).map((szoveg) => ({ tipus: "lerako" as const, szoveg })),
  ];

  let utvonalPercek = ALAPERTELMEZETT_UTVONAL_PERC;
  let utvonalBizonytalan = true;
  let megallokKoordinatak: (GeocodedAddress | null)[] = megallokSzovegei.map(() => null);

  if (megallokSzovegei.length >= 2) {
    try {
      const geokodolt = await Promise.all(megallokSzovegei.map((m) => geocodeAddress(m.szoveg).catch(() => null)));
      megallokKoordinatak = geokodolt;
      const ervenyesPontok = geokodolt.filter((g): g is GeocodedAddress => g !== null);
      if (ervenyesPontok.length >= 2) {
        const route = await calculateToll({
          points: ervenyesPontok.map((p) => ({ lon: p.lon, lat: p.lat })),
          ...FIXED_VEHICLE,
        });
        // A HU-GO elméleti menetidejét a valós GPS-előzményből tanult,
        // a felrakás időpontjához illő napszaki korrekciós szorzóval
        // igazítjuk (lásd szamitsKalibraciot) — a statikus úthálózat-modell
        // magában rendszerint optimistább, mint a tényleges menetidő.
        utvonalPercek = route.durationMin * valasszKalibraciosSzorzot(kalibracio, kezdet);
        // Ha egy állomást nem sikerült geokódolni, a menetidő hiányos (kimaradt egy szakasz) — ezt jelezzük bizonytalannak.
        utvonalBizonytalan = ervenyesPontok.length < geokodolt.length;
      }
    } catch {
      // marad az alapértelmezett átalány-menetidő, koordináták nélkül
    }
  }

  // Ha a megbízás külön lerakási dátumot ad meg (row.lerakas_datum), és az
  // eltér a felrakás napjától, a fuvar TÖBBNAPOS (pl. késő este megérkezik
  // egy saját telephelyre, és csak másnap/később adja le az árut) — ilyenkor
  // a lerakás időpontját NEM a felrakástól folyamatosan számolt
  // menetidővel/pufferekkel kapjuk (az napon belülre esne), hanem a
  // lerakás napjára horgonyozzuk, egy durva alapértelmezett órával. Ez csak
  // kiinduló becslés: ha ez a nap ténylegesen elérkezik és van élő
  // GPS-pozíció, a lancoltEloBecsles (getIdovonalak) felülírja a valós
  // haladás szerint.
  const tobbNaposFuvar = !!row.lerakas_datum && row.lerakas_datum !== row.datum;

  let veg: Date;
  if (tobbNaposFuvar) {
    const [lev, lho, lnap] = row.lerakas_datum!.split("-").map(Number);
    veg = budapestFalioraToInstant(lev, lho, lnap, ALAPERTELMEZETT_LERAKAS_ORA, 0, 0);
    // A lerakás napi órája itt csak durva alapértelmezés — jelöljük bizonytalannak, amíg élő pozícióból nem pontosodik.
    utvonalBizonytalan = true;
  } else {
    const felrakasVeg = new Date(kezdet.getTime() + RAKODAS_PUFFER_PERC * 60000);
    const erkezes = new Date(felrakasVeg.getTime() + utvonalPercek * 60000);
    veg = new Date(erkezes.getTime() + LERAKODAS_PUFFER_PERC * 60000);
  }

  const megallok: TervezettMegallo[] = megallokSzovegei.map((m, i) => ({
    tipus: m.tipus,
    cim: varosNev(m.szoveg),
    lat: megallokKoordinatak[i]?.lat ?? null,
    lon: megallokKoordinatak[i]?.lon ?? null,
    // Kezdeti, statikus becslés — ha van élő pozíció, actions.ts a mai
    // napra láncba fűzve (lásd chainEloEta) ezt felülírja.
    idopont: m.tipus === "felrako" ? kezdet : veg,
    elhagyva: false,
    tenylegesIdo: null,
  }));

  return {
    id: row.id,
    fuvarTipus,
    megrendelo: row.megrendelo,
    pozicioszam: row.pozicioszam,
    honnan: row.felrako ? varosNev(row.felrako) : null,
    hova: varosNev(row.lerako) || row.lerako,
    megallok,
    kezdet,
    veg,
    idoBizonytalan,
    utvonalBizonytalan,
  };
}

/**
 * Élő GPS-pozícióból indulva, láncba fűzve frissíti a mai nap még el nem
 * hagyott fel-/lerakó pontjainak becsült idejét: az elsőt az élő
 * pozícióból számolja, utána minden további pontot az előzőtől (annak
 * várható indulási idejétől) — így minden hátralévő becslés a jármű
 * TÉNYLEGES mai haladását tükrözi, nem csak a megbízásban rögzített (csak
 * irányadó) statikus menetrendet. A már elhagyott pontok (tenylegesIdo
 * alapján) és a geokódolatlan (lat/lon nélküli) pontok időpontja
 * változatlan marad — egy geokódolatlan vagy hálózati hibát adó pontnál a
 * lánc megszakad, az onnantól hátralévők a statikus becslésüket tartják.
 *
 * FONTOS: csak a MAI napra (most napja) horgonyzott pontokat láncoljuk —
 * egy többnapos fuvar (lásd becsulFuvarSzakasz tobbNaposFuvar ága) lerakó
 * pontja szándékosan egy KÉSŐBBI napra van horgonyozva (pl. hétfő reggel,
 * mert a jármű éjszakára a saját telephelyre áll be). Ha ezt is bevonnánk a
 * folyamatos menetidő-láncba, a lánc pusztán az aktuális pozíciótól számolt
 * útvonal-idővel "ma, X perc múlva" időpontra tolná — felülírva a helyes,
 * jövőbeli napi horgonyt, és a pont hamisan a mai listán jelenne meg.
 */
async function lancoltEloBecsles(
  fuvarok: TervezettFuvarSzakasz[],
  eloPoz: { lat: number; lon: number },
  most: Date,
  kalibracio: KalibraciosEredmeny
): Promise<TervezettFuvarSzakasz[]> {
  const maiNapISO = budapestNapISO(most);
  const sorrend = fuvarok
    .flatMap((f, fi) => f.megallok.map((m, mi) => ({ fi, mi, m })))
    .filter(({ m }) => !m.elhagyva && budapestNapISO(m.idopont) === maiNapISO)
    .sort((a, b) => a.m.idopont.getTime() - b.m.idopont.getTime());

  const eredmeny = fuvarok.map((f) => ({ ...f, megallok: [...f.megallok] }));

  let pozicio = eloPoz;
  let idoPont = most;

  for (const { fi, mi, m } of sorrend) {
    if (m.lat == null || m.lon == null) break;
    try {
      const route = await calculateToll({
        points: [
          { lon: pozicio.lon, lat: pozicio.lat },
          { lon: m.lon, lat: m.lat },
        ],
        ...FIXED_VEHICLE,
      });
      // A szorzót az induláshoz (idoPont, ez a jelenlegi szakasz elindulási
      // ideje, nem a mai "most") illő napszak alapján választjuk — egy
      // láncban a nap előrehaladtával más-más napszaki szorzó léphet érvénybe.
      const erkezes = new Date(idoPont.getTime() + route.durationMin * valasszKalibraciosSzorzot(kalibracio, idoPont) * 60000);
      const puffer = m.tipus === "felrako" ? RAKODAS_PUFFER_PERC : LERAKODAS_PUFFER_PERC;
      eredmeny[fi].megallok[mi] = { ...m, idopont: erkezes };
      pozicio = { lat: m.lat, lon: m.lon };
      idoPont = new Date(erkezes.getTime() + puffer * 60000);
    } catch {
      break;
    }
  }

  return eredmeny;
}

/**
 * Egy sofőrhöz tartozó tervezett fuvarok fel-/lerakó pontjait sima,
 * időrendbe rendezett listává lapítja (a fuvar-szintű adatok — megrendelő,
 * pozíciószám, fuvarTipus — minden ponton elérhetők) — ez kerül a
 * jármű-csempe megbízás-listájára a régi, fuvaronkénti sávok helyett.
 */
function laposMegallok(tervezettFuvarok: TervezettFuvarSzakasz[]): MegalloBejegyzes[] {
  return tervezettFuvarok
    .flatMap((f) =>
      f.megallok.map(
        (m): MegalloBejegyzes => ({
          fuvarId: f.id,
          fuvarTipus: f.fuvarTipus,
          megrendelo: f.megrendelo,
          pozicioszam: f.pozicioszam,
          tipus: m.tipus,
          cim: m.cim,
          idopont: m.elhagyva && m.tenylegesIdo ? m.tenylegesIdo : m.idopont,
          elhagyva: m.elhagyva,
        })
      )
    )
    .sort((a, b) => a.idopont.getTime() - b.idopont.getTime());
}

/** A megjelenített napra eső és a rákövetkező naptári napra átcsúszott pontok szétválasztása. */
/**
 * A megjelenített napra eső, a rákövetkező napokra átcsúszott, ÉS (a
 * getMaiSajatFuvarok/getMaiValodiSajatFuvarok tartomány-illesztése miatt)
 * egy KORÁBBI napról áthúzódó pont is előfordulhat itt — egy többnapos
 * fuvar már lezajlott felrakója, miközben a lerakó napja még hátravan.
 * Az ilyen, a megjelenített napnál KORÁBBI pontot egyszerűen kihagyjuk:
 * már megtörtént, a "Későbbi napra átcsúszva" doboz (ami kifejezetten a
 * JÖVŐBELI napra eső pontoknak szól) félrevezető helye lenne neki.
 */
function szetvalasztNapSzerint(bejegyzesek: MegalloBejegyzes[], napISO: string): { maiMegallok: MegalloBejegyzes[]; holnapiMegallok: MegalloBejegyzes[] } {
  const maiMegallok: MegalloBejegyzes[] = [];
  const holnapiMegallok: MegalloBejegyzes[] = [];
  for (const b of bejegyzesek) {
    const napja = budapestNapISO(b.idopont);
    if (napja === napISO) {
      maiMegallok.push(b);
    } else if (napja > napISO) {
      holnapiMegallok.push(b);
    }
  }
  return { maiMegallok, holnapiMegallok };
}

/**
 * Minden saját jármű mai (vagy megadott napi) idővonala: az adott napra
 * ütemezett fuvarok (Bér fuvarok ÉS Saját fuvarok fül, lásd
 * TervezettFuvarSzakasz.fuvarTipus) fel-/lerakó pontjai időrendbe lapítva,
 * becsült időponttal (felrakó/lerakó cím + útvonal-menetidő + rakodási/
 * lerakodási puffer alapján — ha nincs megadva pontos időpont vagy nem
 * sikerül a geokódolás/útvonalszámítás, a fuvar "bizonytalan" jelölést
 * kap). A pontokat a valós Ecofleet GPS-nyomvonal alapján "elhagyva"
 * (kész) jelöli, ha a jármű már ott járt és azóta tovább is ment — lásd
 * jelolMegallokElhagyottkent.
 */
export async function getIdovonalak(nap?: string): Promise<JarmuIdovonalEredmeny[]> {
  const { kezdet, veg, napISO, maiNap } = budapestNapHatarok(nap);
  const [berFuvarok, sajatFuvarok] = await Promise.all([
    getMaiSajatFuvarok(napISO).catch(() => [] as MaiFuvarSor[]),
    getMaiValodiSajatFuvarok(napISO).catch(() => [] as MaiFuvarSor[]),
  ]);
  // FIGYELEM: a DB tipus='sajat' sorok a "Bér fuvarok" fülön jelennek meg,
  // tipus='ber' pedig a "Saját fuvarok" fülön — lásd megbizasok.ts.
  const maiFuvarok: { row: MaiFuvarSor; tipus: FuvarTipus }[] = [
    ...berFuvarok.map((row) => ({ row, tipus: "sajat" as const })),
    ...sajatFuvarok.map((row) => ({ row, tipus: "ber" as const })),
  ];
  // Az élő GPS-pozíciót csak a mai napra vonatkozó idővonalhoz kell (egy
  // korábbi nap lezárt idővonalát nem kell/nem szabad "élő" adattal
  // kiegészíteni) — feleslegesen sem hívjuk, ha nem kell.
  const eloPoziciok = maiNap ? await getFleetLastPositions().catch(() => []) : [];
  const telephelyPontok = maiNap ? await getTelephelyPontok().catch(() => [] as TelephelyPont[]) : [];
  // A valós GPS-előzményből tanult korrekciós szorzó (lásd szamitsKalibraciot)
  // csak a mai napi becslésekhez kell — múltbeli napoknál a tényleges
  // (lezárult) szakaszok már úgyis a valós időt mutatják.
  const NINCS_KOREKCIO: KalibraciosEredmeny = { globalisSzorzo: 1, idosavSzorzok: {}, mintaSzam: 0, szamitva: veg };
  const kalibracio = maiNap ? await szamitsKalibraciot().catch(() => NINCS_KOREKCIO) : NINCS_KOREKCIO;

  return Promise.all(
    SAJAT_JARMUVEK.map(async (jarmu): Promise<JarmuIdovonalEredmeny> => {
      const sajatSorok = maiFuvarok.filter(({ row }) => driverMatchesRow(jarmu, row));
      const tervezettFuvarok = await Promise.all(
        sajatSorok.map(({ row, tipus }) => becsulFuvarSzakasz(row, tipus, kalibracio))
      );

      if (!jarmu.ecofleetObjectId) {
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          eloPozicio: null,
          eloEta: null,
          hiba: null,
          ...szetvalasztNapSzerint(laposMegallok(tervezettFuvarok), napISO),
        };
      }
      try {
        const trips = await getVehicleTrips(jarmu.ecofleetObjectId, kezdet, veg);
        // A nap tervezett fuvarjainak geokódolt fel-/lerakó koordinátái — a
        // GPS-idővonal állás-szakaszainak helyalapú kategorizálásához
        // (allasKategoria): ha egy állás egy ilyen cím közelében van,
        // biztosan rakodás/ügyintézés, függetlenül az időtartamtól.
        const tervezettCimek = tervezettFuvarok.flatMap((f) =>
          f.megallok
            .filter((m) => m.lat != null && m.lon != null)
            .map((m) => ({ lat: m.lat as number, lon: m.lon as number }))
        );
        let szakaszok = epitsIdovonal(trips, tervezettCimek);

        const livePos = maiNap ? eloPoziciok.find((p) => p.objectId === jarmu.ecofleetObjectId) : undefined;
        let eloPozicioEredmeny: JarmuIdovonalEredmeny["eloPozicio"] = null;
        if (livePos) {
          const parsedTs = parseEcofleetTimestamp(livePos.timestamp);
          if (parsedTs) {
            // Ha a jármű éppen egy saját telephelyen/parkolóban áll, azt
            // olvashatóbb névvel mutatjuk (pl. "Szakoly (parkoló)"), mint a
            // nyers, visszafordított utca-cím — a cím egyébként csak
            // megjelenítéshez kell, ha a fordított geokódolás elakadna, ne
            // akassza meg emiatt az idővonal felépítését, csak maradjon
            // "ismeretlen hely".
            const sajatTelephely = talalSajatTelephelyet(livePos.latitude, livePos.longitude, telephelyPontok);
            const cim = sajatTelephely ?? (await reverseGeocodeCoords(livePos.latitude, livePos.longitude).catch(() => null));
            const elo: EloPozicio = {
              lat: livePos.latitude,
              lon: livePos.longitude,
              cim,
              mozog: livePos.engineOn || livePos.speed > 0,
              idobelyeg: parsedTs,
            };
            szakaszok = kiegesziteloAllapottal(szakaszok, elo, veg, tervezettCimek);
            eloPozicioEredmeny = {
              cim,
              sebesseg: livePos.speed,
              utolsoAdat: parsedTs,
              oraallasKm: livePos.odometerKm,
            };
          }
        }

        // A tervezett fel-/lerakó pontok "elhagyva" (kész) jelölése a valós GPS-nyomvonal alapján.
        const pontok = idovonalPontjai(szakaszok);
        const jeloltFuvarok = tervezettFuvarok.map((f) => ({ ...f, megallok: jelolMegallokElhagyottkent(f.megallok, pontok) }));

        // A hátralévő pontok becsült idejét élő pozícióból láncba fűzve
        // frissítjük, hogy a jármű tényleges mai haladását tükrözzék, ne
        // csak a megbízásban rögzített (csak irányadó) statikus menetrendet.
        const lancoltFuvarok = livePos
          ? await lancoltEloBecsles(jeloltFuvarok, { lat: livePos.latitude, lon: livePos.longitude }, veg, kalibracio)
          : jeloltFuvarok;
        const bejegyzesek = laposMegallok(lancoltFuvarok);

        // Élő ETA: a legközelebbi, még el nem hagyott fel-/lerakó pont
        // frissen láncolt becsült ideje — ez adja a jármű-csempén a
        // kamion-ikon melletti becsült időt.
        let eloEta: { cel: string; erkezes: Date } | null = null;
        if (livePos) {
          const kovetkezoMegallo = lancoltFuvarok.flatMap((f) => f.megallok).find((m) => !m.elhagyva);
          if (kovetkezoMegallo) {
            eloEta = { cel: kovetkezoMegallo.cim, erkezes: kovetkezoMegallo.idopont };
          }
        }

        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          eloPozicio: eloPozicioEredmeny,
          eloEta,
          hiba: null,
          ...szetvalasztNapSzerint(bejegyzesek, napISO),
        };
      } catch (err) {
        const message = err instanceof EcofleetError ? err.message : "Nem sikerült lekérni az idővonalat.";
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          eloPozicio: null,
          eloEta: null,
          hiba: message,
          ...szetvalasztNapSzerint(laposMegallok(tervezettFuvarok), napISO),
        };
      }
    })
  );
}

export async function searchAddressSuggestions(query: string): Promise<GeocodedAddress[]> {
  try {
    return await suggestAddresses(query);
  } catch {
    return [];
  }
}

export type TollCalcResult =
  | { ok: true; stops: GeocodedAddress[]; route: TollRoute }
  | { ok: false; error: string };

async function runTollCalc(stops: GeocodedAddress[], withGeometry?: boolean): Promise<TollCalcResult> {
  try {
    const route = await calculateToll({
      points: stops.map((s) => ({ lon: s.lon, lat: s.lat })),
      ...FIXED_VEHICLE,
      withGeometry,
    });
    return { ok: true, stops, route };
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}

/**
 * Amikor a felhasználó minden állomásnál egy javasolt címre kattintott —
 * koordináták már ismertek. `withGeometry` csak a Kalkulátor fül térképéhez
 * kell — a megbízáslista automatikus költségbecslése (sok, gyakori hívás)
 * ezt nem kéri, hogy ne érintse a guidance-kapcsoló esetleges hatása.
 */
export async function calculateTollForPoints(
  stops: GeocodedAddress[],
  withGeometry?: boolean
): Promise<TollCalcResult> {
  return runTollCalc(stops, withGeometry);
}

/** Amikor a felhasználó (legalább egy állomásnál) szabadon beírt szöveggel indította a számítást. */
export async function calculateTollForAddresses(
  queries: string[],
  withGeometry?: boolean
): Promise<TollCalcResult> {
  try {
    const stops = await Promise.all(queries.map((q) => geocodeAddress(q)));
    return runTollCalc(stops, withGeometry);
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}
