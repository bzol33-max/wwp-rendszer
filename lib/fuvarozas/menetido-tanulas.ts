import "server-only";

// A GPS-előzményből tanult menetidő-adatok: helyenkénti rakodási medián és a
// HU-GO menetidő kalibrációs szorzója. 2026-10-17-én kiemelve a
// lib/fuvarozas/actions.ts-ből (viselkedés-változás nélkül), hogy a Hét
// nézet ütemterve (lib/fuvarozas2/heti-utemterv.ts) is használhassa.
// NEM "use server": az exportok szerveroldali segédek, nem kliens-akciók.

import { query } from "@/lib/db";
import { getVehicleTrips, parseEcofleetTimestamp, type EcofleetTrip } from "./ecofleet";
import { kalibracioGyorsitotarazhato } from "./kalibracio-dontes";
import { calculateToll, FIXED_VEHICLE } from "./utdijkalkulacio";
import { getJarmuvek } from "./jarmuvek-db";
import { budapestHetNapja, budapestOra } from "./idozona";
import { rakodasMedian, type TanultRakodasIdo } from "./eta-lanc";

/**
 * Tanult rakodási idő helyenként: a GPS-sel mért érkezés→távozás medián
 * (fuvar_megallok.gps_erkezes/gps_tavozas, min. 3 mérés). Óránként frissül;
 * hiba esetén üres (a lánc a beállított pufferrel számol). (2026-10-11)
 */
let tanultCache: { at: number; lista: TanultRakodasIdo[] } | null = null;
export async function tanultRakodasIdok(): Promise<TanultRakodasIdo[]> {
  if (tanultCache && Date.now() - tanultCache.at < 3600000) return tanultCache.lista;
  try {
    const sorok = await query<{ hely: string; percek: number[] }>(
      `select coalesce(telepules, cim_nyers) as hely,
         array_agg(extract(epoch from (gps_tavozas - gps_erkezes)) / 60) as percek
       from fuvar_megallok
       where gps_erkezes is not null and gps_tavozas is not null and gps_tavozas > gps_erkezes
         and gps_erkezes > now() - interval '120 days'
       group by 1 having count(*) >= 3`
    );
    const lista = sorok.map((r) => ({ hely: r.hely, ...rakodasMedian(r.percek ?? []) })).filter((t) => t.minta >= 3);
    tanultCache = { at: Date.now(), lista };
    return lista;
  } catch {
    return tanultCache?.lista ?? [];
  }
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
/** Ha az Ecofleet-hívás hibázott vagy 0 minta jött, a tartalék-eredmény csak ennyi percig él (nem 24 óráig) — lásd kalibracioGyorsitotarazhato. */
const KALIBRACIO_TARTALEK_ERVENYESSEG_PERC = 15;

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

export type KalibraciosEredmeny = {
  globalisSzorzo: number;
  idosavSzorzok: Partial<Record<Idosav, number>>;
  mintaSzam: number;
  szamitva: Date;
};

let kalibraciosCache: KalibraciosEredmeny | null = null;
/** A kalibraciosCache érvényességi ideje (ms): 24 óra jó mintánál, 5 perc hibás/üres mintánál. */
let kalibraciosCacheErvenyesMs = 0;

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
export async function szamitsKalibraciot(): Promise<KalibraciosEredmeny> {
  const most = new Date();
  if (kalibraciosCache && most.getTime() - kalibraciosCache.szamitva.getTime() < kalibraciosCacheErvenyesMs) {
    return kalibraciosCache;
  }

  const veg = most;
  const kezdet = new Date(most.getTime() - KALIBRACIO_MINTA_NAP * 86400000);
  const jarmuvek = (await getJarmuvek()).filter((j) => j.ecofleetObjectId !== null);

  // Járművenként külön elkapjuk a hibát (a többi kocsi mintája még használható),
  // de jegyezzük, hogy volt-e — hibás Ecofleet-válasz mellett az eredmény nem
  // kerülhet a 24 órás gyorsítótárba.
  let voltEcofleetHiba = false;
  const mindenTrip = (
    await Promise.all(
      jarmuvek.map((j) =>
        getVehicleTrips(j.ecofleetObjectId!, kezdet, veg).catch(() => {
          voltEcofleetHiba = true;
          return [] as EcofleetTrip[];
        })
      )
    )
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
  kalibraciosCacheErvenyesMs = kalibracioGyorsitotarazhato(globalisMinta, voltEcofleetHiba)
    ? KALIBRACIO_ERVENYESSEG_ORA * 3600000
    : KALIBRACIO_TARTALEK_ERVENYESSEG_PERC * 60000;
  return kalibraciosCache;
}

/** A megadott (várható indulási) időponthoz illő korrekciós szorzó: a napszak/nap-típus szerinti, ha van rá elég minta, egyébként a globális. */
export function valasszKalibraciosSzorzot(kalibracio: KalibraciosEredmeny, idopont: Date): number {
  return kalibracio.idosavSzorzok[idosavja(idopont)] ?? kalibracio.globalisSzorzo;
}
