// Napi jármű-idővonal felépítése valós Ecofleet GPS trip-előzményből.
//
// Az Ecofleet Vehicles/getTrips végpontja a napot már "trip"-ekre bontva adja
// vissza (indulás/érkezés cím+koordináta, táv, időtartam), és minden trip
// után megkapjuk, hogy utána mennyi ideig ("stoppedAfter") állt a jármű a
// következő indulásig. Ez a modul ebből építi fel a megjelenítendő
// idővonalat: VEZETÉS és ÁLLÁS szakaszokra bontva, és — mivel egy telephelyi
// megállás gyakran több apró, néhány száz méteres mozgásra esik szét
// (portai bejelentkezés, belső/külső parkoló, rámpához állás, majd újra
// parkoló) — az egymáshoz közeli (< OSSZEVONAS_KM) apró mozgásokat egyetlen
// összevont állás-szakasszá vonja össze, hogy a valós rakodási/lerakodási
// idő ne aprózódjon szét several kis blokkra.
//
// NEM "use server" fájl — tiszta, szinkron függvények, bárhonnan hívhatók.

import type { EcofleetTrip } from "./ecofleet";
import { parseEcofleetTimestamp } from "./ecofleet";

/** Két koordináta közti távolság km-ben (haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ennél közelebbi (km) apró mozgásokat egy állás-szakaszként kezelünk (porta, parkoló, rámpa). */
const OSSZEVONAS_KM = 1.5;

export type AllasKategoria = "rovid" | "rakodas" | "piheno";

/** Egyszerű, időtartam alapú becslés arra, hogy egy állás inkább rövid megállás, rakodás/ügyintézés, vagy (napi/heti) pihenő volt-e. Tájékoztató jellegű. */
function allasKategoria(durationSec: number): AllasKategoria {
  if (durationSec >= 6 * 3600) return "piheno";
  if (durationSec >= 15 * 60) return "rakodas";
  return "rovid";
}

export type IdovonalSzakasz =
  | {
      tipus: "indulas";
      idopont: Date;
      cim: string | null;
      lat: number;
      lon: number;
    }
  | {
      tipus: "vezetes";
      kezdet: Date;
      veg: Date;
      tavKm: number;
      idotartamSec: number;
      atlagSebesseg: number;
      honnan: string | null;
      hova: string | null;
      hovaLat: number;
      hovaLon: number;
      /** Igaz, ha ez egy még folyamatban lévő, az Ecofleet által még le nem zárt (ezért csak élő GPS-pozícióból becsült) szakasz. */
      elo?: boolean;
    }
  | {
      tipus: "allas";
      kezdet: Date;
      veg: Date;
      idotartamSec: number;
      cim: string | null;
      lat: number;
      lon: number;
      kategoria: AllasKategoria;
      /** Hány trip-nyi apró mozgás lett összevonva ebbe az egy állás-blokkba. */
      osszevontLepesek: number;
      /** Igaz, ha ez a szakasz az élő GPS-pozíció alapján lett a jelen pillanatig meghosszabbítva (az Ecofleet trip-adata még nem tart eddig). */
      elo?: boolean;
    };

/**
 * Egy jármű egy napi (vagy tetszőleges) trip-listájából felépíti a
 * megjelenítendő idővonal-szakaszokat, időrendben.
 */
export function epitsIdovonal(trips: EcofleetTrip[]): IdovonalSzakasz[] {
  const rendezett = [...trips]
    .filter((t) => parseEcofleetTimestamp(t.startTimestamp) && parseEcofleetTimestamp(t.endTimestamp))
    .sort((a, b) => parseEcofleetTimestamp(a.startTimestamp)!.getTime() - parseEcofleetTimestamp(b.startTimestamp)!.getTime());

  if (rendezett.length === 0) return [];

  const szakaszok: IdovonalSzakasz[] = [];
  const elso = rendezett[0];
  szakaszok.push({
    tipus: "indulas",
    idopont: parseEcofleetTimestamp(elso.startTimestamp)!,
    cim: elso.startLocation,
    lat: elso.startLatitude,
    lon: elso.startLongitude,
  });

  let i = 0;
  while (i < rendezett.length) {
    const trip = rendezett[i];
    const kezdet = parseEcofleetTimestamp(trip.startTimestamp)!;
    const veg = parseEcofleetTimestamp(trip.endTimestamp)!;
    szakaszok.push({
      tipus: "vezetes",
      kezdet,
      veg,
      tavKm: trip.distance,
      idotartamSec: trip.duration,
      atlagSebesseg: trip.avgSpeed,
      honnan: trip.startLocation,
      hova: trip.endLocation,
      hovaLat: trip.endLatitude,
      hovaLon: trip.endLongitude,
    });

    // Állás e trip után — és amíg a következő trip(ek) csak apró, helyben
    // maradó mozgások, összevonjuk egyetlen állás-blokká.
    let stopSzek = trip.stoppedAfter;
    let stopKezdet = veg;
    let stopLat = trip.endLatitude;
    let stopLon = trip.endLongitude;
    let stopCim = trip.endLocation;
    let osszevontLepesek = 0;
    let j = i + 1;

    while (
      j < rendezett.length &&
      haversineKm(stopLat, stopLon, rendezett[j].endLatitude, rendezett[j].endLongitude) < OSSZEVONAS_KM &&
      rendezett[j].distance < OSSZEVONAS_KM
    ) {
      stopSzek += rendezett[j].duration + rendezett[j].stoppedAfter;
      stopLat = rendezett[j].endLatitude;
      stopLon = rendezett[j].endLongitude;
      stopCim = rendezett[j].endLocation ?? stopCim;
      osszevontLepesek++;
      j++;
    }

    if (stopSzek > 0) {
      const stopVeg = new Date(stopKezdet.getTime() + stopSzek * 1000);
      szakaszok.push({
        tipus: "allas",
        kezdet: stopKezdet,
        veg: stopVeg,
        idotartamSec: stopSzek,
        cim: stopCim,
        lat: stopLat,
        lon: stopLon,
        kategoria: allasKategoria(stopSzek),
        osszevontLepesek,
      });
    }

    i = j;
  }

  return szakaszok;
}

/** Egy nap teljes vezetési ideje másodpercben. */
export function napiVezetettIdoSec(szakaszok: IdovonalSzakasz[]): number {
  return szakaszok
    .filter((sz): sz is Extract<IdovonalSzakasz, { tipus: "vezetes" }> => sz.tipus === "vezetes")
    .reduce((sum, sz) => sum + sz.idotartamSec, 0);
}

/** Egy nap teljes megtett távja km-ben. */
export function napiTavKm(szakaszok: IdovonalSzakasz[]): number {
  return szakaszok
    .filter((sz): sz is Extract<IdovonalSzakasz, { tipus: "vezetes" }> => sz.tipus === "vezetes")
    .reduce((sum, sz) => sum + sz.tavKm, 0);
}

/**
 * Egy saját fuvar (megbízás) becsült elhelyezése az idővonalon — a valós
 * GPS-adattól függetlenül, a megbízás adataiból (időpont, felrakó/lerakó
 * cím, becsült menetidő + rakodási/lerakodási puffer) számolva. A
 * `lib/fuvarozas/actions.ts`-ben épül fel, mert a menetidő-becsléshez
 * hálózati hívás (geokódolás + útvonaltervezés) kell.
 */
export type TervezettFuvarSzakasz = {
  id: string;
  megrendelo: string | null;
  pozicioszam: string | null;
  honnan: string | null;
  hova: string;
  /** Becsült felrakás-kezdés időpontja. */
  kezdet: Date;
  /** Becsült lerakás-befejezés időpontja. */
  veg: Date;
  /** Igaz, ha a megbízáson nem volt megadva időpont, ezért a kezdés csak durva alapértelmezés (reggel 7). */
  idoBizonytalan: boolean;
  /** Igaz, ha a menetidőt nem sikerült kiszámolni (cím hiányzik/nem geokódolható), ezért egy átalány (2 óra) szerepel. */
  utvonalBizonytalan: boolean;
  /**
   * Igaz, ha a becsült befejezés (`veg`) a jelenlegi tempó mellett túlnyúlik
   * a sofőr aznapi megengedett vezetési idejének végén (lásd
   * szamitsAetrKoltsegvetes az aetr.ts-ben) — csak a mai napra, éppen
   * vezető járműnél számolható, egyébként mindig false.
   */
  tullepiAKeretet: boolean;
};

export type EloPozicio = {
  lat: number;
  lon: number;
  cim: string | null;
  /** Igaz, ha a jármű az utolsó ismert adat szerint jár a motorja vagy mozog. */
  mozog: boolean;
  idobelyeg: Date;
};

/**
 * Az Ecofleet Vehicles/getTrips csak a MÁR LEZÁRULT trip-eket adja vissza —
 * egy éppen folyamatban lévő fuvar (vagy egy még véget nem ért állás) tehát
 * nem jelenik meg benne, amíg be nem fejeződik. Emiatt egy ténylegesen most
 * úton lévő kamion idővonalán üres/hiányzó rész látszódna a nap végéig. Ez a
 * függvény az élő GPS-pozíció (Vehicles/getLastData) alapján egészíti ki a
 * lezárt szakaszokat a jelen pillanatig: ha a jármű mozog (vagy már messze
 * jár az utolsó ismert megállási helytől), egy "élő" vezetés-szakaszt told
 * hozzá; ha áll és közel van, az utolsó állás-szakaszt hosszabbítja meg a
 * jelenig.
 */
export function kiegesziteloAllapottal(szakaszok: IdovonalSzakasz[], elo: EloPozicio | null, most: Date): IdovonalSzakasz[] {
  if (!elo || szakaszok.length === 0) return szakaszok;

  const utolso = szakaszok[szakaszok.length - 1];
  const utolsoVeg = utolso.tipus === "indulas" ? utolso.idopont : utolso.veg;

  // Ha az élő pozíció adata régebbi, mint az utolsó lezárt szakasz vége, nincs mit kiegészíteni.
  if (elo.idobelyeg.getTime() <= utolsoVeg.getTime()) return szakaszok;

  const utolsoHely =
    utolso.tipus === "vezetes"
      ? { lat: utolso.hovaLat, lon: utolso.hovaLon, cim: utolso.hova }
      : { lat: utolso.lat, lon: utolso.lon, cim: utolso.cim };

  const tavolsagKm = haversineKm(utolsoHely.lat, utolsoHely.lon, elo.lat, elo.lon);
  const folyamatbanVezet = elo.mozog || tavolsagKm >= OSSZEVONAS_KM;

  if (folyamatbanVezet) {
    const uj: IdovonalSzakasz = {
      tipus: "vezetes",
      kezdet: utolsoVeg,
      veg: most,
      tavKm: tavolsagKm,
      idotartamSec: Math.max(0, (most.getTime() - utolsoVeg.getTime()) / 1000),
      atlagSebesseg: 0,
      honnan: utolsoHely.cim,
      hova: elo.cim,
      hovaLat: elo.lat,
      hovaLon: elo.lon,
      elo: true,
    };
    return [...szakaszok, uj];
  }

  if (utolso.tipus === "allas") {
    const kiegeszitett = [...szakaszok];
    kiegeszitett[kiegeszitett.length - 1] = {
      ...utolso,
      veg: most,
      idotartamSec: Math.max(0, (most.getTime() - utolso.kezdet.getTime()) / 1000),
      elo: true,
    };
    return kiegeszitett;
  }

  // Az utolsó lezárt szakasz vezetés volt, a jármű azóta (még le nem zárt
  // trip formájában) megállt a végpontján — ezt egy új, élő állás-szakasszal jelezzük.
  const idotartamSec = Math.max(0, (most.getTime() - utolsoVeg.getTime()) / 1000);
  const ujAllas: IdovonalSzakasz = {
    tipus: "allas",
    kezdet: utolsoVeg,
    veg: most,
    idotartamSec,
    cim: utolsoHely.cim,
    lat: utolsoHely.lat,
    lon: utolsoHely.lon,
    kategoria: allasKategoria(idotartamSec),
    osszevontLepesek: 0,
    elo: true,
  };
  return [...szakaszok, ujAllas];
}

/** Szabad szöveges időpont-mezőből ("06:00", "de. 6", stb.) kiolvasott óra:perc, ha felismerhető. */
export function parseIdopontSzoveg(text: string | null): { ora: number; perc: number } | null {
  if (!text) return null;
  const m = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const ora = Number(m[1]);
  const perc = Number(m[2]);
  if (ora > 23 || perc > 59) return null;
  return { ora, perc };
}
