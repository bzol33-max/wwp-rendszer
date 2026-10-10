import "server-only";

// A közös kalkulátor számoló magja (a "use server" burok nélkül): a
// Kalkulátor oldal (lib/fuvarozas2/kalkulator.ts, jogosultsággal) és a
// Tervezés háttérszámolása (lib/fuvarozas2/kalkulacio-tar.ts, rendszerként)
// is ezt hívja. Leírás: lib/fuvarozas2/kalkulator.ts fejléce.

import { query } from "@/lib/db";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { calculateToll, geocodeAddress, TollCalcError, FIXED_VEHICLE, type GeocodedAddress, type TollRoute } from "@/lib/fuvarozas/utdijkalkulacio";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import {
  ajanlatSavok, minositsAjanlatot, napokMenetidobol, szamoljOnkoltseget, valasszFogyasztast,
  type Ajanlat, type Onkoltseg,
} from "@/lib/fuvarozas2/kalkulator-alap";

/**
 * Mért fogyasztás (l/100) az elmúlt 14 napból, kocsira vagy flottára. Az
 * alapérték a jármű saját fogyasztas_l_100km-e (ha kocsira kérdezünk és ki
 * van töltve), különben a beállítás (fogyasztas_alap_l_100km, 28); a mért
 * érték csak a beállított küszöb (meres_min_km, 300 km) FÖLÖTT írja felül.
 */
export async function mertFogyasztas(jarmuKod: string | undefined, beallitas: FuvarBeallitasok): Promise<{ l100: number; forras: string }> {
  let alapL100 = beallitas.fogyasztas_alap_l_100km;
  try {
    const jarmuvek = await query<{ kod: string; ecofleet_object_id: string | null; vontato_rendszam: string | null; fogyasztas_l_100km: number | null }>(
      `select kod, ecofleet_object_id, vontato_rendszam, fogyasztas_l_100km from fuvar_jarmuvek where aktiv order by id`
    );
    const sajatAlap = jarmuKod ? jarmuvek.find((j) => j.kod === jarmuKod)?.fogyasztas_l_100km : null;
    if (sajatAlap != null && Number(sajatAlap) > 0) alapL100 = Number(sajatAlap);
    const cel = (jarmuKod ? jarmuvek.filter((j) => j.kod === jarmuKod) : jarmuvek).filter((j) => j.ecofleet_object_id !== null);
    if (cel.length === 0) return { l100: alapL100, forras: "alapérték" };
    const ma = new Date();
    // Budapesti nap (a konténer UTC-ben fut — éjfél és 2 óra között a
    // toISOString még a tegnapot adta; audit BIZ-10).
    const kezdet = budapestNapISO(new Date(ma.getTime() - 13 * 86400000));
    const sorok = await getUtvonalJelentes(cel.map((j) => j.ecofleet_object_id!), kezdet, budapestNapISO(ma));
    const kulcsok = new Set(cel.map((j) => rendszamKulcs(j.vontato_rendszam ?? j.kod)));
    const sajat = sorok.filter((s) => kulcsok.has(s.rendszamKulcs));
    const km = sajat.reduce((a, s) => a + s.tavKm, 0);
    const liter = sajat.reduce((a, s) => a + s.uzemanyagL, 0);
    const v = valasszFogyasztast({ mertKm: km, mertLiter: liter, alapL100, minKm: beallitas.meres_min_km });
    if (v.mert) {
      return { l100: v.l100, forras: `mért, 14 nap${jarmuKod ? ` · ${jarmuKod}` : " · flotta"}` };
    }
  } catch {
    // nincs Ecofleet-kulcs vagy hiba — alapértékkel megyünk tovább
  }
  return { l100: alapL100, forras: "alapérték (nincs elég mért adat)" };
}

export type KozosBemenet = {
  /** A megállók sorrendben (≥ 2): kiválasztott javaslat (koordinátával) vagy szabad szöveg. */
  megallok: (GeocodedAddress | string)[];
  /** Jármű kód — a mért fogyasztáshoz. Üres: flotta-átlag. */
  jarmuKod?: string;
  /** A megbízó ajánlata Ft-ban, ha van. */
  ajanlatFt?: number;
  /** Van-e visszfuvar: ha igen, a hazaút üres km-jét nem erre a fuvarra terheljük. */
  vanVisszfuvar?: boolean;
  /**
   * Számoljon-e telephelyi üres km-t (telephely → első megálló, utolsó → telephely).
   * Alapból igen (Tervezés); a Kalkulátor oldalon alapból ki van kapcsolva
   * (Zoltán, 2026-10-06: „csak a beírt út távolságával számoljon”).
   */
  telephelyrol?: boolean;
};

export type KozosEredmeny = {
  stops: GeocodedAddress[];
  /** A rakott út (az összes megállón át), a térképhez geometriával. */
  route: TollRoute;
  rakottKm: number;
  uresKm: number;
  uresReszletek: string;
  menetidoPerc: number;
  napok: number;
  /** Útdíj a rakott útra (HU-GO) — a régi kalkulátor ezt mutatta. */
  rakottUtdijFt: number;
  /** Útdíj a teljes útra (rakott + üres) — ez megy az önköltségbe. */
  utdijFt: number;
  fogyasztasL100: number;
  fogyasztasForras: string;
  literek: number;
  gazolaj: { ar: number; navAr: number; kedvezmeny: number; cimke: string; friss: boolean };
  onkoltseg: Onkoltseg;
  savok: Ajanlat[];
  megbizoiAjanlat: (Ajanlat & { sajat: true }) | null;
  jarmuKod: string | null;
  vanVisszfuvar: boolean;
  /** Beszámolta-e a telephelyi üres km-t. (Régi, tárolt eredményekben hiányzik — azokban igen.) */
  telephelyrol?: boolean;
  figyelmeztetesek: string[];
};

async function pontbolPontba(a: { lon: number; lat: number }, b: { lon: number; lat: number }): Promise<{ km: number; perc: number; utdij: number }> {
  const r = await calculateToll({ points: [a, b], ...FIXED_VEHICLE });
  return { km: r.distanceKm, perc: r.durationMin, utdij: r.tollHuf?.grossTotal ?? 0 };
}

/**
 * A közös kalkulátor (2026-09-30, a régi és az új egyesítése): több megálló,
 * térkép-geometria, üres km, mért fogyasztás, NAV-ár a tankolási
 * kedvezménnyel, önköltség, ajánlat-sávok és a megbízó ajánlatának minősítése.
 */
export async function kozosKalkulacio(bemenet: KozosBemenet): Promise<{ ok: true; eredmeny: KozosEredmeny } | { ok: false; hiba: string }> {
  const figyelmeztetesek: string[] = [];
  let stops: GeocodedAddress[];
  let route: TollRoute;
  try {
    stops = await Promise.all(bemenet.megallok.map((m) => (typeof m === "string" ? geocodeAddress(m) : Promise.resolve(m))));
    if (stops.length < 2) return { ok: false, hiba: "Legalább két megálló kell." };
    route = await calculateToll({ points: stops.map((s) => ({ lon: s.lon, lat: s.lat })), ...FIXED_VEHICLE, withGeometry: true });
  } catch (err) {
    return { ok: false, hiba: err instanceof TollCalcError ? err.message : "Nem sikerült kiszámítani az útvonalat." };
  }

  // Üres szakaszok: telephely → első megálló, és (ha nincs visszfuvar) utolsó megálló → telephely.
  let uresKm = 0, uresUtdij = 0, uresPerc = 0;
  const uresReszek: string[] = [];
  const telephelyrol = bemenet.telephelyrol !== false;
  let telephely: GeocodedAddress | null = null;
  if (!telephelyrol) {
    uresReszek.push("telephelyi üres km nincs beszámítva — csak a beírt út");
  } else {
    try {
      const pont = await getJarmuIndulasiTelephely(bemenet.jarmuKod);
      telephely = pont.lat != null && pont.lon != null
        ? { label: pont.cim, lat: pont.lat, lon: pont.lon }
        : await geocodeAddress(pont.cim);
    } catch {
      figyelmeztetesek.push("A telephely címe nem található — az üres km nélkül a kalkuláció optimista.");
    }
  }
  if (telephely) {
    try {
      const oda = await pontbolPontba(telephely, stops[0]);
      uresKm += oda.km; uresUtdij += oda.utdij; uresPerc += oda.perc;
      uresReszek.push(`telephely → első megálló ${Math.round(oda.km)} km`);
    } catch {
      figyelmeztetesek.push("A telephely → első megálló üres szakasz nem számolható — nélküle a kalkuláció optimista.");
    }
    if (!bemenet.vanVisszfuvar) {
      try {
        const vissza = await pontbolPontba(stops[stops.length - 1], telephely);
        uresKm += vissza.km; uresUtdij += vissza.utdij; uresPerc += vissza.perc;
        uresReszek.push(`utolsó megálló → telephely ${Math.round(vissza.km)} km`);
      } catch {
        figyelmeztetesek.push("Az utolsó megálló → telephely hazaút nem számolható — nélküle a kalkuláció optimista.");
      }
    } else {
      uresReszek.push("hazaút nincs beszámítva (visszfuvarral számolsz)");
    }
  }

  const beallitas = await getFuvarBeallitasok();
  const { l100, forras } = await mertFogyasztas(bemenet.jarmuKod, beallitas);
  const gazolaj = await gazolajArKedvezmennyel();
  if (!gazolaj.friss) figyelmeztetesek.push(`A NAV gázolajár nem érhető el — tartalék árral számoltunk (${gazolaj.cimke}).`);

  const rakottKm = route.distanceKm;
  const napok = napokMenetidobol(route.durationMin + uresPerc, beallitas.sofor_napi_vezetes_max_perc);
  const rakottUtdijFt = Math.round(route.tollHuf?.grossTotal ?? 0);
  const utdijFt = Math.round(rakottUtdijFt + uresUtdij);
  const onkoltseg = szamoljOnkoltseget({ rakottKm, uresKm, fogyasztasL100: l100, gazolajFt: gazolaj.ar, utdijFt, napok, napiKoltsegFt: beallitas.napi_koltseg_ft });
  const savok = ajanlatSavok(rakottKm, onkoltseg.osszesenFt);
  const megbizoiAjanlat = bemenet.ajanlatFt
    ? {
        ftKm: rakottKm > 0 ? Math.round(bemenet.ajanlatFt / rakottKm) : 0,
        dijFt: bemenet.ajanlatFt,
        ...minositsAjanlatot(bemenet.ajanlatFt, onkoltseg.osszesenFt),
        sajat: true as const,
      }
    : null;
  if (onkoltseg.ftPerRakottKm == null) figyelmeztetesek.push("Nulla rakott km — ellenőrizd a címeket.");

  return {
    ok: true,
    eredmeny: {
      stops, route,
      rakottKm: Math.round(rakottKm), uresKm: Math.round(uresKm), uresReszletek: uresReszek.join(" · "),
      menetidoPerc: Math.round(route.durationMin), napok, rakottUtdijFt, utdijFt,
      fogyasztasL100: l100, fogyasztasForras: forras,
      literek: Math.round(((rakottKm + uresKm) * l100) / 100),
      gazolaj,
      onkoltseg, savok, megbizoiAjanlat,
      jarmuKod: bemenet.jarmuKod ?? null, vanVisszfuvar: !!bemenet.vanVisszfuvar, telephelyrol,
      figyelmeztetesek,
    },
  };
}
