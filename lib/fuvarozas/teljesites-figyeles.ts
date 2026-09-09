// GPS-alapú automatikus "Teljesítve" figyelés a "Bér fuvarok — folyamatban"
// listához: ha az Ecofleet szerint a fuvarhoz rendelt jármű ténylegesen
// odaért a lerakó címhez, majd onnan legalább TAVOZAS_KM távolságra
// eltávolodott, a fuvart automatikusan "teljesítve"-nek jelöljük — ugyanaz a
// jelölő, amit a Bér fuvarok listán a kézi "Kész" gomb is beállít (lásd
// setFuvarTeljesitve), így a valós lerakás dátumot ez sem hamisítja meg.
//
// FONTOS: a puszta "10 km-nél messzebb van a lerakó címtől" önmagában nem
// elég — egy olyan jármű is 10+ km-re lenne, ami sosem is járt arra (más
// fuvart teljesít). Ezért két lépésben ellenőrzünk: 1) VALAHA (a fuvar
// felrakási napja óta) odaért-e a jármű a lerakó cím ERKEZES_SUGAR_KM-es
// körzetébe (Ecofleet trip-előzmény, trip végpontok), és csak ha igen,
// 2) a jelenlegi (élő, vagy ha az nem elérhető, a legutóbbi trip szerinti)
// pozíciója már TAVOZAS_KM-nél messzebb van-e onnan.

import { getFleetLastPositions, getVehicleTrips, EcofleetError, type EcofleetPosition } from "./ecofleet";
import { geocodeAddress, TollCalcError, type GeocodedAddress } from "./utdijkalkulacio";
import { resolveJarmu } from "./vehicles";
import { getTeljesitesJeloltek, setFuvarTeljesitve } from "./megbizasok";
import { budapestFalioraToInstant } from "./idozona";

/** Ha a jármű valaha ennyi km-en belülre került a lerakó címhez, "odaértnek" számít. */
const ERKEZES_SUGAR_KM = 2;
/** Ha az odaérés UTÁN a jármű ennyi km-re (vagy messzebb) távolodik a lerakó címtől, "teljesítettnek" számít. */
const TAVOZAS_KM = 10;

/** Föld sugara km-ben — a haversine távolságszámításhoz. */
const FOLD_SUGAR_KM = 6371;

/** Két koordináta légvonalbeli távolsága km-ben (haversine-képlet) — geofence-szerű közelség-ellenőrzéshez elég pontos. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return FOLD_SUGAR_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A lerakó címek geokódolása a kalkulátor külső API-ját hívja — mivel a
// fuvarok listája körönként újra lekérdeződik, de a címek maguk nem
// változnak, a folyamat élettartamáig érvényes gyorsítótár elég (nincs
// szükség adatbázisba írásra, csak a felesleges ismételt hívások elkerülésére).
const geokodCache = new Map<string, GeocodedAddress | null>();

async function geokodolCachelve(cim: string): Promise<GeocodedAddress | null> {
  if (geokodCache.has(cim)) return geokodCache.get(cim) ?? null;
  try {
    const talalat = await geocodeAddress(cim);
    geokodCache.set(cim, talalat);
    return talalat;
  } catch (err) {
    if (!(err instanceof TollCalcError)) {
      console.error("[teljesites-figyeles] geokódolási hiba:", err);
    }
    geokodCache.set(cim, null);
    return null;
  }
}

export type TeljesitesFigyelesEredmeny = {
  vizsgalt: number;
  automatikusanTeljesitve: number;
  hibak: string[];
};

/**
 * Egy teljes ellenőrzési kör: minden folyamatban lévő, jármű-hozzárendeléssel
 * rendelkező saját fuvarra megnézi, hogy a GPS szerint már ténylegesen
 * kész-e (odaért a lerakóhoz, majd eltávolodott onnan) — ha igen, a
 * meglévő "Teljesítve" jelölővel automatikusan lezárja (lásd a fájl tetején
 * a modul-megjegyzést a hamis-pozitív elleni védelemről).
 */
export async function futtatTeljesitesFigyeles(): Promise<TeljesitesFigyelesEredmeny> {
  const eredmeny: TeljesitesFigyelesEredmeny = { vizsgalt: 0, automatikusanTeljesitve: 0, hibak: [] };

  const jeloltek = await getTeljesitesJeloltek();
  if (jeloltek.length === 0) return eredmeny;

  let eloPoziciok: EcofleetPosition[];
  try {
    eloPoziciok = await getFleetLastPositions();
  } catch (err) {
    eredmeny.hibak.push(
      `Élő GPS-pozíciók lekérése sikertelen: ${err instanceof EcofleetError ? err.message : "ismeretlen hiba"}`
    );
    eloPoziciok = [];
  }

  for (const jelolt of jeloltek) {
    const jarmu = resolveJarmu(jelolt.jarmu);
    if (!jarmu || !jarmu.ecofleetObjectId) continue; // nincs GPS-kötés ehhez a járműhöz

    eredmeny.vizsgalt++;
    try {
      const lerakoCim = await geokodolCachelve(jelolt.lerako);
      if (!lerakoCim) continue; // nem geokódolható cím — ezt a fuvart kihagyjuk, a kézi gomb marad a megoldás

      const [ev, ho, nap] = jelolt.datum.split("-").map(Number);
      const kezdet = budapestFalioraToInstant(ev, ho, nap, 0, 0, 0);
      const veg = new Date();

      const tripek = await getVehicleTrips(jarmu.ecofleetObjectId, kezdet, veg);

      const odaert = tripek.some(
        (t) =>
          haversineKm(t.startLatitude, t.startLongitude, lerakoCim.lat, lerakoCim.lon) <= ERKEZES_SUGAR_KM ||
          haversineKm(t.endLatitude, t.endLongitude, lerakoCim.lat, lerakoCim.lon) <= ERKEZES_SUGAR_KM
      );
      if (!odaert) continue; // még nem járt a lerakó közelében — korai lenne teljesítettnek venni

      const eloPoz = eloPoziciok.find((p) => p.objectId === jarmu.ecofleetObjectId);
      const utolsoTrip = tripek[tripek.length - 1];
      const jelenlegiPoz = eloPoz
        ? { lat: eloPoz.latitude, lon: eloPoz.longitude }
        : utolsoTrip
          ? { lat: utolsoTrip.endLatitude, lon: utolsoTrip.endLongitude }
          : null;
      if (!jelenlegiPoz) continue; // sem élő pozíció, sem trip — nincs mihez viszonyítani

      const tavolsag = haversineKm(jelenlegiPoz.lat, jelenlegiPoz.lon, lerakoCim.lat, lerakoCim.lon);
      if (tavolsag >= TAVOZAS_KM) {
        await setFuvarTeljesitve(jelolt.id, true);
        eredmeny.automatikusanTeljesitve++;
      }
    } catch (err) {
      eredmeny.hibak.push(
        `Fuvar #${jelolt.id}: ${err instanceof EcofleetError ? err.message : err instanceof Error ? err.message : "ismeretlen hiba"}`
      );
    }
  }

  return eredmeny;
}
