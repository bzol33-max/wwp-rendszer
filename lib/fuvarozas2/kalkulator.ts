"use server";

// Fuvarozás 2 — közös Kalkulátor (2026-09-30: a régi útdíjkalkulátor és a
// tervvászon D6 kalkulátora egyben). Amit számol:
//   • RAKOTT km, menetidő, útdíj: az összes megállón át (HU-GO), a térképhez
//     geometriával.
//   • ÜRES km: telephely → első megálló és utolsó megálló → telephely (ha
//     nincs visszfuvar) — ez az, ami a legtöbb kalkulációból kimarad.
//   • Üzemanyag: (rakott + üres) km × mért fogyasztás (Ecofleet, 14 nap) ×
//     NAV gázolajár a tankolási kedvezménnyel (lib/fuvarozas/gazolaj.ts).
//   • Útdíj a teljes útra; napi költség 50 000 Ft/nap (kalkulator-alap.ts).
//   • Önköltség, 500/600/700 Ft/km ajánlat-sáv és a megbízó ajánlatának minősítése.
//
// Minden külső hívás a sorosított, cache-elt úton megy (lib/fuvarozas/
// kulso-hivas.ts), ezért a lap ismételt megnyitása nem terheli a HU-GO-t.

import { requireViewPermission } from "@/lib/auth/require-permission";
import { query } from "@/lib/db";
import { calculateToll, geocodeAddress, TollCalcError, FIXED_VEHICLE, type GeocodedAddress, type TollRoute } from "@/lib/fuvarozas/utdijkalkulacio";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import {
  ALAP_FOGYASZTAS_L100, ajanlatSavok, minositsAjanlatot, napokMenetidobol, szamoljOnkoltseget,
  type Ajanlat, type Onkoltseg,
} from "@/lib/fuvarozas2/kalkulator-alap";

const TELEPHELY = SAJAT_TELEPHELYEK[0].cim;

/** Mért fogyasztás (l/100) az elmúlt 14 napból, kocsira vagy flottára. */
async function mertFogyasztas(jarmuKod?: string): Promise<{ l100: number; forras: string }> {
  try {
    const jarmuvek = await query<{ kod: string; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
      `select kod, ecofleet_object_id, vontato_rendszam from fuvar_jarmuvek where aktiv and ecofleet_object_id is not null order by id`
    );
    const cel = jarmuKod ? jarmuvek.filter((j) => j.kod === jarmuKod) : jarmuvek;
    if (cel.length === 0) return { l100: ALAP_FOGYASZTAS_L100, forras: "alapérték" };
    const ma = new Date();
    const kezdet = new Date(ma.getTime() - 13 * 86400000).toISOString().slice(0, 10);
    const sorok = await getUtvonalJelentes(cel.map((j) => j.ecofleet_object_id!), kezdet, ma.toISOString().slice(0, 10));
    const kulcsok = new Set(cel.map((j) => rendszamKulcs(j.vontato_rendszam ?? j.kod)));
    const sajat = sorok.filter((s) => kulcsok.has(s.rendszamKulcs));
    const km = sajat.reduce((a, s) => a + s.tavKm, 0);
    const liter = sajat.reduce((a, s) => a + s.uzemanyagL, 0);
    if (km > 100 && liter > 0) {
      return { l100: Math.round((liter / km) * 1000) / 10, forras: `mért, 14 nap${jarmuKod ? ` · ${jarmuKod}` : " · flotta"}` };
    }
  } catch {
    // nincs Ecofleet-kulcs vagy hiba — alapértékkel megyünk tovább
  }
  return { l100: ALAP_FOGYASZTAS_L100, forras: "alapérték (nincs mért adat)" };
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
export async function szamoljKozosKalkulaciot(bemenet: KozosBemenet): Promise<{ ok: true; eredmeny: KozosEredmeny } | { ok: false; hiba: string }> {
  await requireViewPermission("fuvarozas");
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
  let telephely: GeocodedAddress | null = null;
  try {
    telephely = await geocodeAddress(TELEPHELY);
  } catch {
    figyelmeztetesek.push("A telephely címe nem található — az üres km nélkül a kalkuláció optimista.");
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

  const { l100, forras } = await mertFogyasztas(bemenet.jarmuKod);
  const gazolaj = await gazolajArKedvezmennyel();
  if (!gazolaj.friss) figyelmeztetesek.push(`A NAV gázolajár nem érhető el — tartalék árral számoltunk (${gazolaj.cimke}).`);

  const rakottKm = route.distanceKm;
  const napok = napokMenetidobol(route.durationMin + uresPerc);
  const rakottUtdijFt = Math.round(route.tollHuf?.grossTotal ?? 0);
  const utdijFt = Math.round(rakottUtdijFt + uresUtdij);
  const onkoltseg = szamoljOnkoltseget({ rakottKm, uresKm, fogyasztasL100: l100, gazolajFt: gazolaj.ar, utdijFt, napok });
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
      jarmuKod: bemenet.jarmuKod ?? null, vanVisszfuvar: !!bemenet.vanVisszfuvar,
      figyelmeztetesek,
    },
  };
}

/** A Kalkulátor kocsi-választójához. */
export async function getKalkulatorJarmuvek(): Promise<{ kod: string; cimke: string }[]> {
  await requireViewPermission("fuvarozas");
  return query<{ kod: string; cimke: string }>(`select kod, cimke from fuvar_jarmuvek where aktiv order by id`);
}
