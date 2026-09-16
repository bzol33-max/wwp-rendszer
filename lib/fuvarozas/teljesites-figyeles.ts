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
import { getTeljesitesJeloltek, getFrissenTeljesitettSajatFuvarok, setFuvarTeljesitve } from "./megbizasok";
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

  // Kocsi + lerakó → ebben a körben már "elhasznált" érkezések száma (lásd lent).
  const felhasznaltErkezesek = new Map<string, number>();

  // A KORÁBBI körökben lezárt fuvarok érkezése is elhasznált: élesben a
  // 13:05-ös kör lezárta a #126-ot (egy érkezés), majd a 13:20-as kör — a
  // #126 már nem lévén jelölt — ugyanazt az egy érkezést a #130-nak adta.
  // Ezért a közelmúltban Teljesítve-re jelölt (GPS vagy kézi "Kész") saját
  // fuvarokat is beszámítjuk, ha ugyanaz a kocsi, ugyanaz a lerakó, és a
  // lezárás a vizsgált fuvar érkezési ablakán belülre esik.
  const frissenLezartak = await getFrissenTeljesitettSajatFuvarok();

  for (const jelolt of jeloltek) {
    const jarmu = resolveJarmu(jelolt.jarmu);
    if (!jarmu || !jarmu.ecofleetObjectId) continue; // nincs GPS-kötés ehhez a járműhöz

    eredmeny.vizsgalt++;
    try {
      const lerakoCim = await geokodolCachelve(jelolt.lerako);
      if (!lerakoCim) continue; // nem geokódolható cím — ezt a fuvart kihagyjuk, a kézi gomb marad a megoldás

      // MIKORTÓL számít érkezésnek, ha a jármű a lerakó közelében járt?
      // Korábban a FELRAKÁS napjától — ez hamis pozitívot adott az oda-vissza
      // ingázó kocsinál: ugyanaz a jármű egy napon Pápa → Debrecen ÉS
      // Debrecen → Pápa megbízást is visz, és a második fuvar FELRAKÓJA az
      // első fuvar LERAKÓJA. A felrakáshoz odaérve az első fuvar "odaértnek"
      // számított, majd elindulva "teljesítettnek" — a lerakás előtt egy
      // nappal. Ezért az érkezést csak a lerakási időablak kezdetétől
      // (ha a megbízás megadta), különben a lerakás (ha nincs külön, a
      // felrakás) napjának kezdetétől keressük.
      const lerakasNap = jelolt.lerakas_datum ?? jelolt.datum;
      const [ev, ho, nap] = lerakasNap.split("-").map(Number);
      const kezdet = jelolt.lerakas_ablak_tol
        ? new Date(jelolt.lerakas_ablak_tol)
        : budapestFalioraToInstant(ev, ho, nap, 0, 0, 0);
      const veg = new Date();
      if (kezdet > veg) continue; // a lerakási ablak még el sem kezdődött

      const tripek = await getVehicleTrips(jarmu.ecofleetObjectId, kezdet, veg);

      // HÁNYSZOR érkezett a jármű a lerakóhoz? Nem "járt-e ott", hanem
      // számolunk: ugyanaz a kocsi egy napon KÉT azonos lerakójú fuvart is
      // vihet (élesben: két Pápa → Debrecen Duvenbeck-megbízás, NMZ-492), és
      // a puszta "odaért" mindkettőt az ELSŐ érkezéskor lezárta. Egy érkezés =
      // egy út, ami a 2 km-es körön KÍVÜLRŐL indul és BELÜL ér véget (a
      // telephelyen belüli mozgás nem érkezés). Ha az ablak kezdetekor a kocsi
      // már bent állt (az első út belülről indul), az is egy érkezés. Ugyan-
      // annak a kocsinak ugyanahhoz a lerakóhoz csak annyi fuvart zárunk le,
      // ahány érkezés volt — a listát id szerint járjuk, tehát a korábban
      // rögzített fuvar kapja az első érkezést.
      const bentVan = (lat: number, lon: number) => haversineKm(lat, lon, lerakoCim.lat, lerakoCim.lon) <= ERKEZES_SUGAR_KM;
      let erkezesek = tripek.filter(
        (t) => bentVan(t.endLatitude, t.endLongitude) && !bentVan(t.startLatitude, t.startLongitude)
      ).length;
      if (tripek.length > 0 && bentVan(tripek[0].startLatitude, tripek[0].startLongitude)) erkezesek++;
      const erkezesKulcs = `${jarmu.ecofleetObjectId}|${lerakoCim.lat.toFixed(3)},${lerakoCim.lon.toFixed(3)}`;
      let korabbanLezart = 0;
      for (const f of frissenLezartak) {
        if (new Date(f.teljesitve_at) < kezdet) continue;
        if (resolveJarmu(f.jarmu)?.ecofleetObjectId !== jarmu.ecofleetObjectId) continue;
        const fCim = f.lerako === jelolt.lerako ? lerakoCim : await geokodolCachelve(f.lerako);
        if (fCim && `${jarmu.ecofleetObjectId}|${fCim.lat.toFixed(3)},${fCim.lon.toFixed(3)}` === erkezesKulcs) korabbanLezart++;
      }
      const felhasznalt = (felhasznaltErkezesek.get(erkezesKulcs) ?? 0) + korabbanLezart;
      if (erkezesek - felhasznalt <= 0) continue; // (még) nincs erre a fuvarra jutó érkezés — korai lenne teljesítettnek venni

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
        felhasznaltErkezesek.set(erkezesKulcs, felhasznalt + 1);
      }
    } catch (err) {
      eredmeny.hibak.push(
        `Fuvar #${jelolt.id}: ${err instanceof EcofleetError ? err.message : err instanceof Error ? err.message : "ismeretlen hiba"}`
      );
    }
  }

  return eredmeny;
}
