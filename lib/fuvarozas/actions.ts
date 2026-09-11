"use server";

import { getFleetLastPositions, getVehicleTrips, parseEcofleetTimestamp, EcofleetError, type EcofleetPosition } from "./ecofleet";
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
  idovonalPontjai,
  jelolMegallokElhagyottkent,
  kiegesziteloAllapottal,
  parseIdopontSzoveg,
  type EloPozicio,
  type IdovonalSzakasz,
  type TervezettFuvarSzakasz,
  type TervezettMegallo,
} from "./idovonal";
import { SAJAT_JARMUVEK, resolveJarmu, type JarmuSzin, type SajatJarmu } from "./vehicles";
import { bontsMegallokra, varosNev } from "./varos";
import { getMaiSajatFuvarok } from "./megbizasok";
import type { MaiFuvarSor } from "./fuvar-constants";
import { budapestFalioraToInstant, budapestNapISO } from "./idozona";

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

export type JarmuIdovonalEredmeny = {
  sofor: string;
  szin: JarmuSzin;
  /** null, ha a jármű nincs (még) Ecofleet-be kötve, vagy ma még nem indult el. */
  szakaszok: IdovonalSzakasz[] | null;
  /** Élő GPS-pozíció a jármű-csempe infó-dobozához (cím, sebesség, utolsó adat ideje, óraállás) — csak a mai napra. */
  eloPozicio: {
    cim: string | null;
    sebesseg: number;
    utolsoAdat: Date;
    oraallasKm: number | null;
  } | null;
  /** Az első tényleges indulás (motor be + mozgás) időpontja ma — ez az idővonal 0 pontja. Null, ha a jármű ma még nem indult el. */
  napKezdete: Date | null;
  /** Élő GPS-pozícióból becsült érkezés a legközelebbi, még el nem hagyott fel-/lerakó ponthoz — csak a mai napra. */
  eloEta: { cel: string; erkezes: Date } | null;
  hiba: string | null;
  /** Az adott napra ehhez a sofőrhöz rendelt saját fuvarok, becsült időponttal az idővonalra helyezve. */
  tervezettFuvarok: TervezettFuvarSzakasz[];
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

const RAKODAS_PUFFER_PERC = 30;
const LERAKODAS_PUFFER_PERC = 45;
/** Ha egy megbízáson nincs megadva időpont, ezt tekintjük becsült felrakás-kezdésnek. */
const ALAPERTELMEZETT_FELRAKAS_ORA = 7;
/** Ha a cím nem geokódolható / az útvonal nem számolható, ennyi menetidőt feltételezünk. */
const ALAPERTELMEZETT_UTVONAL_PERC = 120;

function driverMatchesRow(jarmu: SajatJarmu, row: MaiFuvarSor): boolean {
  if (row.jarmu && resolveJarmu(row.jarmu) === jarmu) return true;
  if (row.sofor && row.sofor.trim().toLowerCase() === jarmu.sofor.toLowerCase()) return true;
  return false;
}

async function becsulFuvarSzakasz(row: MaiFuvarSor): Promise<TervezettFuvarSzakasz> {
  const parsedIdo = parseIdopontSzoveg(row.idopont);
  const idoBizonytalan = !parsedIdo;
  const [ev, ho, napSzam] = row.datum.split("-").map(Number);
  const kezdet = new Date(ev, ho - 1, napSzam, parsedIdo?.ora ?? ALAPERTELMEZETT_FELRAKAS_ORA, parsedIdo?.perc ?? 0, 0);

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
  let megallok: TervezettMegallo[] = megallokSzovegei.map((m) => ({
    tipus: m.tipus,
    cim: varosNev(m.szoveg),
    lat: null,
    lon: null,
    elhagyva: false,
    tenylegesIdo: null,
  }));

  if (megallokSzovegei.length >= 2) {
    try {
      const geokodolt = await Promise.all(megallokSzovegei.map((m) => geocodeAddress(m.szoveg).catch(() => null)));
      megallok = megallok.map((m, i) => (geokodolt[i] ? { ...m, lat: geokodolt[i]!.lat, lon: geokodolt[i]!.lon } : m));
      const ervenyesPontok = geokodolt.filter((g): g is GeocodedAddress => g !== null);
      if (ervenyesPontok.length >= 2) {
        const route = await calculateToll({
          points: ervenyesPontok.map((p) => ({ lon: p.lon, lat: p.lat })),
          ...FIXED_VEHICLE,
        });
        utvonalPercek = route.durationMin;
        // Ha egy állomást nem sikerült geokódolni, a menetidő hiányos (kimaradt egy szakasz) — ezt jelezzük bizonytalannak.
        utvonalBizonytalan = ervenyesPontok.length < geokodolt.length;
      }
    } catch {
      // marad az alapértelmezett átalány-menetidő, koordináták nélkül
    }
  }

  const felrakasVeg = new Date(kezdet.getTime() + RAKODAS_PUFFER_PERC * 60000);
  const erkezes = new Date(felrakasVeg.getTime() + utvonalPercek * 60000);
  const veg = new Date(erkezes.getTime() + LERAKODAS_PUFFER_PERC * 60000);

  return {
    id: row.id,
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
 * Élő GPS-pozícióból (nem a tervezett indulásból!) becsüli meg, mikor ér
 * oda a jármű egy adott fel-/lerakó ponthoz — a célkoordinátát a hívó adja
 * át (a becsulFuvarSzakasz-ban már úgyis megtörtént geokódolás eredménye),
 * nincs szükség újabb geokódolásra.
 */
async function becsulEloEta(
  eloPoz: { lat: number; lon: number },
  cel: { lat: number; lon: number },
  celLabel: string,
  most: Date
): Promise<{ cel: string; erkezes: Date } | null> {
  try {
    const route = await calculateToll({
      points: [
        { lon: eloPoz.lon, lat: eloPoz.lat },
        { lon: cel.lon, lat: cel.lat },
      ],
      ...FIXED_VEHICLE,
    });
    return { cel: celLabel, erkezes: new Date(most.getTime() + route.durationMin * 60000) };
  } catch {
    return null;
  }
}

/**
 * Minden saját jármű mai (vagy megadott napi) idővonala valós Ecofleet
 * trip-előzményből, PLUSZ az adott napra ütemezett saját megbízások becsült
 * időpontokkal az idővonalra helyezve (felrakó/lerakó cím + útvonal-
 * menetidő + rakodási/lerakodási puffer alapján — ha nincs megadva pontos
 * időpont vagy nem sikerül a geokódolás/útvonalszámítás, a szakasz
 * "bizonytalan" jelölést kap). A fel-/lerakó pontokat a valós GPS-nyomvonal
 * alapján "elhagyva" (kész) jelöli, ha a jármű már ott járt és azóta
 * tovább is ment — lásd jelolMegallokElhagyottkent.
 */
export async function getIdovonalak(nap?: string): Promise<JarmuIdovonalEredmeny[]> {
  const { kezdet, veg, napISO, maiNap } = budapestNapHatarok(nap);
  const maiFuvarok = await getMaiSajatFuvarok(napISO).catch(() => [] as MaiFuvarSor[]);
  // Az élő GPS-pozíciót csak a mai napra vonatkozó idővonalhoz kell (egy
  // korábbi nap lezárt idővonalát nem kell/nem szabad "élő" adattal
  // kiegészíteni) — feleslegesen sem hívjuk, ha nem kell.
  const eloPoziciok = maiNap ? await getFleetLastPositions().catch(() => []) : [];

  return Promise.all(
    SAJAT_JARMUVEK.map(async (jarmu): Promise<JarmuIdovonalEredmeny> => {
      const sajatSorok = maiFuvarok.filter((row) => driverMatchesRow(jarmu, row));
      const tervezettFuvarok = await Promise.all(sajatSorok.map(becsulFuvarSzakasz));

      if (!jarmu.ecofleetObjectId) {
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok: null,
          eloPozicio: null,
          napKezdete: null,
          eloEta: null,
          hiba: null,
          tervezettFuvarok,
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
            // A cím csak megjelenítéshez kell — ha a fordított geokódolás
            // elakadna, ne akassza meg emiatt az idővonal felépítését, csak
            // maradjon "ismeretlen hely".
            const cim = await reverseGeocodeCoords(livePos.latitude, livePos.longitude).catch(() => null);
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

        // A nap kezdete: a tényleges első indulás (motor be + mozgás)
        // időpontja — ez az idővonal 0 pontja, NEM éjfél.
        const napKezdete = szakaszok[0]?.tipus === "indulas" ? szakaszok[0].idopont : null;

        // A tervezett fel-/lerakó pontok "elhagyva" (kész) jelölése a valós
        // GPS-nyomvonal alapján, időrendben rendezve, hogy a "következő,
        // még el nem hagyott pont" keresése (lentebb) helyes sorrendben történjen.
        const pontok = idovonalPontjai(szakaszok);
        const jeloltFuvarok = [...tervezettFuvarok]
          .sort((a, b) => a.kezdet.getTime() - b.kezdet.getTime())
          .map((f) => ({ ...f, megallok: jelolMegallokElhagyottkent(f.megallok, pontok) }));

        // Élő ETA: a legközelebbi, még el nem hagyott fel-/lerakó ponthoz,
        // élő GPS-pozícióból számolva.
        let eloEta: { cel: string; erkezes: Date } | null = null;
        if (livePos) {
          const kovetkezoMegallo = jeloltFuvarok
            .flatMap((f) => f.megallok)
            .find((m) => !m.elhagyva && m.lat != null && m.lon != null);
          if (kovetkezoMegallo) {
            eloEta = await becsulEloEta(
              { lat: livePos.latitude, lon: livePos.longitude },
              { lat: kovetkezoMegallo.lat!, lon: kovetkezoMegallo.lon! },
              kovetkezoMegallo.cim,
              veg
            );
          }
        }

        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok,
          eloPozicio: eloPozicioEredmeny,
          napKezdete,
          eloEta,
          hiba: null,
          tervezettFuvarok: jeloltFuvarok,
        };
      } catch (err) {
        const message = err instanceof EcofleetError ? err.message : "Nem sikerült lekérni az idővonalat.";
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok: null,
          eloPozicio: null,
          napKezdete: null,
          eloEta: null,
          hiba: message,
          tervezettFuvarok,
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
