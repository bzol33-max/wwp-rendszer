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
import { ellenorizAetr, ellenorizHetiVezetes, szamitsAetrKoltsegvetes, type AetrFigyelmezetes, type AetrKoltsegvetes } from "./aetr";
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
  /** Heti (hétfőtől a megjelenített napig) összesített vezetési idő AETR-ellenőrzése — lásd getHetiVezetesOsszesites. */
  hetiFigyelmezetesek: AetrFigyelmezetes[];
  /** Csak a mai napra, éppen vezetés közben: meddig kötelező/lehet még menni. Lásd szamitsAetrKoltsegvetes. */
  koltsegvetes: AetrKoltsegvetes | null;
  /** Élő GPS-pozícióból becsült érkezés a legközelebbi (még hátralévő) tervezett fuvar célcíméhez — csak a mai napra. */
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

/** Az adott naptári napot tartalmazó hét hétfője ("YYYY-MM-DD"). */
function hetElejeIso(napISO: string): string {
  const [ev, ho, napSzam] = napISO.split("-").map(Number);
  const dow = new Date(Date.UTC(ev, ho - 1, napSzam, 12)).getUTCDay(); // 0=vas .. 6=szo
  const napokHetfoig = (dow + 6) % 7;
  return napIsoEltolva(napISO, -napokHetfoig);
}

export type HetiVezetesEredmeny = {
  /** Napi vezetési összesek másodpercben, hétfőtől a megadott napig (azt is beleértve), időrendben. */
  napiOsszesekSec: number[];
  figyelmezetesek: AetrFigyelmezetes[];
  /** Hány, a megadott napot MEGELŐZŐ napon volt 9 óránál több a napi vezetés a héten — ez dönti el, hogy a megadott nap még lehet-e hosszabbított (10 órás) vezetési nap. */
  kiterjesztettNapokElotte: number;
};

/**
 * Egy jármű heti (a napISO-t tartalmazó hét hétfőjétől napISO-ig)
 * összesített napi vezetési idejét adja vissza, ÉS lefuttatja rá a
 * meglévő, eddig sehol nem hívott ellenorizHetiVezetes()-t (56/90 órás heti
 * korlátok). Egyetlen getVehicleTrips-hívással (a hét egészére) dolgozik,
 * a trip-eket a kezdésük budapesti naptári napja szerint csoportosítva —
 * nem kell naponta külön lekérdezni.
 */
export async function getHetiVezetesOsszesites(objectId: string, napISO: string): Promise<HetiVezetesEredmeny> {
  const hetfo = hetElejeIso(napISO);
  const { kezdet } = budapestNapHatarok(hetfo);
  const { veg } = budapestNapHatarok(napISO);

  const trips = await getVehicleTrips(objectId, kezdet, veg);
  const napiOsszesekTerkep = new Map<string, number>();
  for (const t of trips) {
    const start = parseEcofleetTimestamp(t.startTimestamp);
    if (!start) continue;
    const nap = budapestNapISO(start);
    napiOsszesekTerkep.set(nap, (napiOsszesekTerkep.get(nap) ?? 0) + t.duration);
  }

  const [hEv, hHo, hNap] = hetfo.split("-").map(Number);
  const [cEv, cHo, cNap] = napISO.split("-").map(Number);
  const napokSzama =
    Math.round(
      (Date.UTC(cEv, cHo - 1, cNap, 12) - Date.UTC(hEv, hHo - 1, hNap, 12)) / 86400000
    ) + 1;

  const napiOsszesekSec: number[] = [];
  for (let i = 0; i < napokSzama; i++) {
    napiOsszesekSec.push(napiOsszesekTerkep.get(napIsoEltolva(hetfo, i)) ?? 0);
  }

  const KILENC_ORA_SEC = 9 * 3600;
  const kiterjesztettNapokElotte = napiOsszesekSec.slice(0, -1).filter((s) => s > KILENC_ORA_SEC).length;

  return {
    napiOsszesekSec,
    figyelmezetesek: ellenorizHetiVezetes(napiOsszesekSec),
    kiterjesztettNapokElotte,
  };
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
  let honnanLat: number | null = null;
  let honnanLon: number | null = null;
  let hovaLat: number | null = null;
  let hovaLon: number | null = null;
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
      honnanLat = honnan.lat;
      honnanLon = honnan.lon;
      hovaLat = hova.lat;
      hovaLon = hova.lon;
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
    honnan: row.felrako,
    hova: row.lerako,
    honnanLat,
    honnanLon,
    hovaLat,
    hovaLon,
    kezdet,
    veg,
    idoBizonytalan,
    utvonalBizonytalan,
    tullepiAKeretet: false,
  };
}

/**
 * Egy már kiszámolt tervezett-fuvar szakaszt összevet a sofőr aznapi élő
 * vezetési-idő költségvetésével (lásd szamitsAetrKoltsegvetes) — ha a
 * becsült befejezés túlnyúlik a napi vezetés legkésőbbi végén, a szakasz
 * `tullepiAKeretet` jelölést kap. Csak jelölés, semmilyen hálózati hívást
 * nem igényel (a geokódolás/útvonalszámítás már megtörtént
 * becsulFuvarSzakasz-ban) — a napi kötelező szünet (4,5 órás korlát)
 * önmagában nem tiltja a fuvart, csak útközbeni megállást igényelne, ezért
 * azt itt nem vesszük figyelembe, csak a kőkemény napi vezetési keretet.
 */
function illesztKoltsegvetesbe(
  szakasz: TervezettFuvarSzakasz,
  koltsegvetes: AetrKoltsegvetes | null
): TervezettFuvarSzakasz {
  if (!koltsegvetes?.napiVezetesVegeIdo) return szakasz;
  return { ...szakasz, tullepiAKeretet: szakasz.veg.getTime() > koltsegvetes.napiVezetesVegeIdo.getTime() };
}

/**
 * Élő GPS-pozícióból (nem a tervezett indulásból!) becsüli meg, mikor ér
 * oda a jármű egy adott célcímre — ugyanazzal a geokódolás+útvonaltervezés
 * lépéssel, mint amit becsulFuvarSzakasz a tervezéskor használ, csak a
 * kezdőpont most a jelenlegi valós pozíció.
 */
async function becsulEloEta(
  eloPoz: { lat: number; lon: number },
  celCim: string,
  most: Date
): Promise<{ cel: string; erkezes: Date } | null> {
  try {
    const cel = await geocodeAddress(celCim);
    const route = await calculateToll({
      points: [
        { lon: eloPoz.lon, lat: eloPoz.lat },
        { lon: cel.lon, lat: cel.lat },
      ],
      ...FIXED_VEHICLE,
    });
    return { cel: celCim, erkezes: new Date(most.getTime() + route.durationMin * 60000) };
  } catch {
    return null;
  }
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
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok: null,
          figyelmezetesek: [],
          hetiFigyelmezetesek: [],
          koltsegvetes: null,
          eloEta: null,
          hiba: null,
          tervezettFuvarok,
        };
      }
      try {
        const [trips, heti] = await Promise.all([
          getVehicleTrips(jarmu.ecofleetObjectId, kezdet, veg),
          getHetiVezetesOsszesites(jarmu.ecofleetObjectId, napISO).catch(
            (): HetiVezetesEredmeny => ({ napiOsszesekSec: [], figyelmezetesek: [], kiterjesztettNapokElotte: 0 })
          ),
        ]);
        // A nap tervezett fuvarjainak geokódolt fel-/lerakó koordinátái — a
        // GPS-idővonal állás-szakaszainak helyalapú kategorizálásához
        // (allasKategoria): ha egy állás egy ilyen cím közelében van,
        // biztosan rakodás/ügyintézés, függetlenül az időtartamtól.
        const tervezettCimek = tervezettFuvarok.flatMap((f) => {
          const pontok: { lat: number; lon: number }[] = [];
          if (f.honnanLat != null && f.honnanLon != null) pontok.push({ lat: f.honnanLat, lon: f.honnanLon });
          if (f.hovaLat != null && f.hovaLon != null) pontok.push({ lat: f.hovaLat, lon: f.hovaLon });
          return pontok;
        });
        let szakaszok = epitsIdovonal(trips, tervezettCimek);

        const livePos = maiNap ? eloPoziciok.find((p) => p.objectId === jarmu.ecofleetObjectId) : undefined;
        if (livePos) {
          const parsedTs = parseEcofleetTimestamp(livePos.timestamp);
          if (parsedTs) {
            const elo: EloPozicio = {
              lat: livePos.latitude,
              lon: livePos.longitude,
              // A cím csak megjelenítéshez kell (tooltip) — ha a fordított
              // geokódolás elakadna, ne akassza meg emiatt az idővonal
              // felépítését, csak maradjon "ismeretlen hely".
              cim: await reverseGeocodeCoords(livePos.latitude, livePos.longitude).catch(() => null),
              mozog: livePos.engineOn || livePos.speed > 0,
              idobelyeg: parsedTs,
            };
            szakaszok = kiegesziteloAllapottal(szakaszok, elo, veg, tervezettCimek);
          }
        }

        const figyelmezetesek = ellenorizAetr(szakaszok);
        const koltsegvetes = maiNap
          ? szamitsAetrKoltsegvetes(szakaszok, veg, heti.kiterjesztettNapokElotte)
          : null;
        const illesztettFuvarok = tervezettFuvarok.map((f) => illesztKoltsegvetesbe(f, koltsegvetes));

        // Élő ETA: a legközelebbi még hátralévő (be nem fejeződött) tervezett
        // fuvar célcíméhez, a jelenlegi élő pozícióból számolva — csak akkor,
        // ha ténylegesen van élő pozíciónk és van még hátralévő fuvar mára.
        let eloEta: { cel: string; erkezes: Date } | null = null;
        if (livePos) {
          const kovetkezo = illesztettFuvarok
            .filter((f) => f.veg.getTime() > veg.getTime())
            .sort((a, b) => a.kezdet.getTime() - b.kezdet.getTime())[0];
          if (kovetkezo) {
            eloEta = await becsulEloEta({ lat: livePos.latitude, lon: livePos.longitude }, kovetkezo.hova, veg);
          }
        }

        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok,
          figyelmezetesek,
          hetiFigyelmezetesek: heti.figyelmezetesek,
          koltsegvetes,
          eloEta,
          hiba: null,
          tervezettFuvarok: illesztettFuvarok,
        };
      } catch (err) {
        const message = err instanceof EcofleetError ? err.message : "Nem sikerült lekérni az idővonalat.";
        return {
          sofor: jarmu.sofor,
          szin: jarmu.szin,
          szakaszok: null,
          figyelmezetesek: [],
          hetiFigyelmezetesek: [],
          koltsegvetes: null,
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
