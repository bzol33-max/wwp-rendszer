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
};

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
