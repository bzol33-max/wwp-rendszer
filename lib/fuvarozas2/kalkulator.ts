"use server";

// Fuvarozás 2 — Kalkulátor (tervvászon D6): HU-GO útdíj + saját önköltség,
// és abból három ajánlat-sáv.
//
// Amit számol:
//   • RAKOTT km: felrakó → lerakó (HU-GO útvonaltervező).
//   • ÜRES km: telephely → felrakó és lerakó → telephely — ez az, ami a
//     legtöbb kalkulációból kimarad, pedig ezt is meg kell keresni.
//   • Üzemanyag: (rakott + üres) km × mért fogyasztás × NAV gázolajár.
//   • Útdíj: a HU-GO tarifa a teljes útra (rakott + üres).
//   • Napi költség: sofőr + kocsi együtt, 50 000 Ft/nap (lásd
//     kalkulator-alap.ts), annyi napra, amennyit a menetidő lefoglal.
//
// Minden külső hívás a sorosított, cache-elt úton megy (lib/fuvarozas/
// kulso-hivas.ts), ezért a lap ismételt megnyitása nem terheli a HU-GO-t.

import { requireViewPermission } from "@/lib/auth/require-permission";
import { query } from "@/lib/db";
import { calculateToll, geocodeAddress, TollCalcError } from "@/lib/fuvarozas/utdijkalkulacio";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { fetchGazolajAr } from "@/lib/fuvarozas/uzemanyagar";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import {
  ALAP_FOGYASZTAS_L100, NAPI_KOLTSEG_FT, ajanlatSavok, minositsAjanlatot, napokMenetidobol, szamoljOnkoltseget,
  type Ajanlat, type Onkoltseg,
} from "@/lib/fuvarozas2/kalkulator-alap";

export type KalkulacioBemenet = {
  honnan: string;
  hova: string;
  /** Jármű kód — a mért fogyasztáshoz. Üres: flotta-átlag. */
  jarmuKod?: string;
  /** A megbízó ajánlata Ft-ban, ha van. */
  ajanlatFt?: number;
  /** Van-e visszfuvar: ha igen, a hazaút üres km-jét nem erre a fuvarra terheljük. */
  vanVisszfuvar?: boolean;
};

export type KalkulacioEredmeny = {
  honnan: string;
  hova: string;
  rakottKm: number;
  uresKm: number;
  uresReszletek: string;
  menetidoPerc: number;
  napok: number;
  utdijFt: number;
  fogyasztasL100: number;
  fogyasztasForras: string;
  gazolajFt: number;
  gazolajCimke: string;
  onkoltseg: Onkoltseg;
  savok: Ajanlat[];
  megbizoiAjanlat: (Ajanlat & { sajat: true }) | null;
  figyelmeztetesek: string[];
};

const TELEPHELY = SAJAT_TELEPHELYEK[0].cim;

async function utvonal(honnan: string, hova: string): Promise<{ km: number; perc: number; utdij: number }> {
  const a = await geocodeAddress(honnan);
  const b = await geocodeAddress(hova);
  const r = await calculateToll({
    points: [{ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat }],
    vehicleCategory: "J5",
    euroCategory: "EURO6",
    weight: 40,
  });
  return { km: r.distanceKm, perc: r.durationMin, utdij: r.tollHuf?.grossTotal ?? 0 };
}

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

export async function szamoljKalkulaciot(bemenet: KalkulacioBemenet): Promise<KalkulacioEredmeny> {
  await requireViewPermission("fuvarozas");
  const figyelmeztetesek: string[] = [];

  const rakott = await utvonal(bemenet.honnan, bemenet.hova);

  // Üres szakaszok: telephely → felrakó, és (ha nincs visszfuvar) lerakó → telephely.
  let uresKm = 0, uresUtdij = 0, uresPerc = 0;
  const uresReszek: string[] = [];
  try {
    const oda = await utvonal(TELEPHELY, bemenet.honnan);
    uresKm += oda.km; uresUtdij += oda.utdij; uresPerc += oda.perc;
    uresReszek.push(`telephely → felrakó ${Math.round(oda.km)} km`);
  } catch {
    figyelmeztetesek.push("A telephely → felrakó üres szakasz nem számolható (cím?) — nélküle a kalkuláció optimista.");
  }
  if (!bemenet.vanVisszfuvar) {
    try {
      const vissza = await utvonal(bemenet.hova, TELEPHELY);
      uresKm += vissza.km; uresUtdij += vissza.utdij; uresPerc += vissza.perc;
      uresReszek.push(`lerakó → telephely ${Math.round(vissza.km)} km`);
    } catch {
      figyelmeztetesek.push("A lerakó → telephely hazaút nem számolható — nélküle a kalkuláció optimista.");
    }
  } else {
    uresReszek.push("hazaút nincs beszámítva (visszfuvarral számolsz)");
  }

  const { l100, forras } = await mertFogyasztas(bemenet.jarmuKod);
  let gazolajFt = 0, gazolajCimke = "nincs ár";
  try {
    const ar = await fetchGazolajAr();
    gazolajFt = ar.ar; gazolajCimke = ar.cimke;
  } catch {
    gazolajFt = 650;
    gazolajCimke = "becsült 650 Ft/l (a NAV-ár nem érhető el)";
    figyelmeztetesek.push("A NAV gázolajár nem érhető el, 650 Ft/l-rel számoltunk.");
  }

  const napok = napokMenetidobol(rakott.perc + uresPerc);
  const utdijFt = Math.round(rakott.utdij + uresUtdij);
  const onkoltseg = szamoljOnkoltseget({
    rakottKm: rakott.km, uresKm, fogyasztasL100: l100, gazolajFt, utdijFt, napok,
  });

  const savok = ajanlatSavok(rakott.km, onkoltseg.osszesenFt);
  const megbizoiAjanlat = bemenet.ajanlatFt
    ? {
        ftKm: rakott.km > 0 ? Math.round(bemenet.ajanlatFt / rakott.km) : 0,
        dijFt: bemenet.ajanlatFt,
        ...minositsAjanlatot(bemenet.ajanlatFt, onkoltseg.osszesenFt),
        sajat: true as const,
      }
    : null;

  if (onkoltseg.ftPerRakottKm == null) figyelmeztetesek.push("Nulla rakott km — ellenőrizd a címeket.");
  figyelmeztetesek.push(`A napi költség ${new Intl.NumberFormat("hu-HU").format(NAPI_KOLTSEG_FT)} Ft/nap (sofőr + kocsi együtt), ${napok} napra számolva.`);

  return {
    honnan: bemenet.honnan, hova: bemenet.hova,
    rakottKm: Math.round(rakott.km), uresKm: Math.round(uresKm),
    uresReszletek: uresReszek.join(" · "),
    menetidoPerc: Math.round(rakott.perc), napok, utdijFt,
    fogyasztasL100: l100, fogyasztasForras: forras, gazolajFt, gazolajCimke,
    onkoltseg, savok, megbizoiAjanlat, figyelmeztetesek,
  };
}

/** A Kalkulátor kocsi-választójához. */
export async function getKalkulatorJarmuvek(): Promise<{ kod: string; cimke: string }[]> {
  await requireViewPermission("fuvarozas");
  return query<{ kod: string; cimke: string }>(`select kod, cimke from fuvar_jarmuvek where aktiv order by id`);
}

export async function kalkulatorHiba(err: unknown): Promise<string> {
  return err instanceof TollCalcError ? err.message : err instanceof Error ? err.message : "Ismeretlen hiba";
}
