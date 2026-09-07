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
import { epitsIdovonal, kiegesziteloAllapottal, parseIdopontSzoveg, type EloPozicio, type IdovonalSzakasz, type TervezettFuvarSzakasz } from "./idovonal";
import { ellenorizAetr, type AetrFigyelmezetes } from "./aetr";
import { SAJAT_JARMUVEK, resolveJarmu, type SajatJarmu } from "./vehicles";
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
  szin: "blue" | "yellow" | "green";
  /** null, ha a jármű nincs (még) Ecofleet-be kötve. */
  szakaszok: IdovonalSzakasz[] | null;
  figyelmezetesek: AetrFigyelmezetes[];
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

  let utvonalPercek = ALAPERTELMEZETT_UTVONAL_PERC;
  let utvonalBizonytalan = true;
  if (row.felrako && row.lerako) {
    try {
      const [honnan, hova] = await Promise.all([geocodeAddress(row.felrako), geocodeAddress(row.lerako)]);
      const route = await calculateToll({
        points: [
          { lon: honnan.lon, lat: honnan.lat },
          { lon: hova.lon, lat: hova.lat },
        ],
        ...FIXED_VEHICLE,
      });
      utvonalPercek = route.durationMin;
      utvonalBizonytalan = false;
    } catch {
      // marad az alapértelmezett átalány-menetidő
    }
  }

  const felrakasVeg = new Date(kezdet.getTime() + RAKODAS_PUFFER_PERC * 60000);
  const erkezes = new Date(felrakasVeg.getTime() + utvonalPercek * 60000);
  const veg = new Date(erkezes.getTime() + LERAKODAS_PUFFER_PERC * 60000);

  return {
    id: row.id,
    megrendelo: row.megrendelo,
    pozicioszam: row.pozicioszam,
    honnan: row.felrako,
    hova: row.lerako,
    kezdet,
    veg,
    idoBizonytalan,
    utvonalBizonytalan,
  };
}

/**
 * Minden saját jármű mai (vagy megadott napi) idővonala valós Ecofleet
 * trip-előzményből, AETR-figyelmeztetésekkel, PLUSZ az adott napra
 * ütemezett saját megbízások becsült időpontokkal az idővonalra helyezve
 * (felrakó/lerakó cím + útvonal-menetidő + rakodási/lerakodási puffer
 * alapján — ha nincs megadva pontos időpont vagy nem sikerül a
 * geokódolás/útvonalszámítás, a szakasz "bizonytalan" jelölést kap).
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
        return { sofor: jarmu.sofor, szin: jarmu.szin, szakaszok: null, figyelmezetesek: [], hiba: null, tervezettFuvarok };
      }
      try {
        const trips = await getVehicleTrips(jarmu.ecofleetObjectId, kezdet, veg);
        let szakaszok = epitsIdovonal(trips);

        if (maiNap) {
          const livePos = eloPoziciok.find((p) => p.objectId === jarmu.ecofleetObjectId);
          if (livePos) {
            const parsedTs = parseEcofleetTimestamp(livePos.timestamp);
            if (parsedTs) {
              const elo: EloPozicio = {
                lat: livePos.latitude,
                lon: livePos.longitude,
                cim: null,
                mozog: livePos.engineOn || livePos.speed > 0,
                idobelyeg: parsedTs,
              };
              szakaszok = kiegesziteloAllapottal(szakaszok, elo, veg);
            }
          }
        }

        const figyelmezetesek = ellenorizAetr(szakaszok);
        return { sofor: jarmu.sofor, szin: jarmu.szin, szakaszok, figyelmezetesek, hiba: null, tervezettFuvarok };
      } catch (err) {
        const message = err instanceof EcofleetError ? err.message : "Nem sikerült lekérni az idővonalat.";
        return { sofor: jarmu.sofor, szin: jarmu.szin, szakaszok: null, figyelmezetesek: [], hiba: message, tervezettFuvarok };
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
  | { ok: true; stopLabels: string[]; route: TollRoute }
  | { ok: false; error: string };

async function runTollCalc(stops: GeocodedAddress[]): Promise<TollCalcResult> {
  try {
    const route = await calculateToll({
      points: stops.map((s) => ({ lon: s.lon, lat: s.lat })),
      ...FIXED_VEHICLE,
    });
    return { ok: true, stopLabels: stops.map((s) => s.label), route };
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}

/** Amikor a felhasználó minden állomásnál egy javasolt címre kattintott — koordináták már ismertek. */
export async function calculateTollForPoints(
  stops: GeocodedAddress[]
): Promise<TollCalcResult> {
  return runTollCalc(stops);
}

/** Amikor a felhasználó (legalább egy állomásnál) szabadon beírt szöveggel indította a számítást. */
export async function calculateTollForAddresses(
  queries: string[]
): Promise<TollCalcResult> {
  try {
    const stops = await Promise.all(queries.map((q) => geocodeAddress(q)));
    return runTollCalc(stops);
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}
