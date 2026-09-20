"use server";

// Fuvarozás 2 — Kimutatás (terv 8. fejezet): mennyi km ment egy kocsival
// nap/hét/hó alatt, mennyi pénzt hozott, és mennyit spóroltunk azzal, hogy a
// saját raklapot a saját kocsink vitte.
//
// MIT MÉRÜNK ÉS MIT BECSLÜNK — ez a nézet csak akkor ér valamit, ha ez
// világos:
//   • km és liter: Ecofleet Útvonal-jelentés — TÉNY (ha a kulcs nincs
//     beállítva, a nézet a megbízás-adatokat akkor is mutatja, a km helyén
//     hibaüzenettel).
//   • bevétel: a bér megbízások számlázott/megbízási díja — TÉNY.
//     Az EUR-os díjakat NEM váltjuk át (nincs árfolyam-tábla feltöltve),
//     külön soron jelennek meg.
//   • rakott/üres bontás: v1-ben NAPI szinten — egy nap km-je ahhoz a
//     jelleghez tartozik, amilyen megbízás aznap futott (ha bér és saját is,
//     felezve; ha semmi, üres). A megállónkénti GPS-alapú pontos bontás
//     akkor jön, amikor a megállók GPS-adatai minden soron megvannak.
//   • saját fuvar megtakarítás: saját km × bér Ft/km — BECSLÉS, a felület
//     így is írja.
//   • útdíj: csak akkor szerepel, ha van importált HU-GO tranzakció az
//     időszakra (utdij_tranzakcio); nem becsüljük.

import { query } from "@/lib/db";
import { requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getUtvonalJelentes, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { fetchGazolajAr } from "@/lib/fuvarozas/uzemanyagar";

export type KimutatasIdoszak = "nap" | "het" | "ho";

export type KimutatasJarmu = {
  kod: string;
  cimke: string;
  sofor: string | null;
  km: number;
  berKm: number;
  sajatKm: number;
  uresKm: number;
  liter: number;
  berDb: number;
  sajatDb: number;
  bevetelFt: number;
  bevetelEur: number;
  megtakaritasFt: number;
  uzemanyagFt: number;
  utdijFt: number | null;
  ftKm: number | null;
};

export type KimutatasNap = { nap: string; km: number; berKm: number; sajatKm: number; uresKm: number; bevetelFt: number };

export type KimutatasEredmeny = {
  idoszak: KimutatasIdoszak;
  kezdet: string;
  veg: string;
  jarmuvek: KimutatasJarmu[];
  napok: KimutatasNap[];
  ossz: {
    km: number; berKm: number; sajatKm: number; uresKm: number; liter: number;
    bevetelFt: number; bevetelEur: number; megtakaritasFt: number; uzemanyagFt: number; utdijFt: number | null;
    berFtKm: number | null; eredmenyFt: number | null;
  };
  gazolajAr: number | null;
  gazolajCimke: string | null;
  gpsHiba: string | null;
  /** Hány megbízás esett az időszakra kocsi nélkül — ezek km-je sehol nem szerepel. */
  kocsiNelkul: number;
};

async function idoszakHatarok(idoszak: KimutatasIdoszak, nap?: string): Promise<{ kezdet: string; veg: string }> {
  const [r] = await query<{ kezdet: string; veg: string }>(
    `with n as (select coalesce($2::date, (now() at time zone 'Europe/Budapest')::date) as d)
     select case $1
              when 'nap' then (select d from n)
              when 'het' then (select date_trunc('week', d)::date from n)
              else (select date_trunc('month', d)::date from n)
            end::text as kezdet,
            case $1
              when 'nap' then (select d from n)
              when 'het' then (select (date_trunc('week', d) + interval '6 days')::date from n)
              else (select (date_trunc('month', d) + interval '1 month' - interval '1 day')::date from n)
            end::text as veg`,
    [idoszak, nap ?? null]
  );
  return r;
}

export async function getKimutatas(idoszak: KimutatasIdoszak = "het", nap?: string): Promise<KimutatasEredmeny> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const { kezdet, veg } = await idoszakHatarok(idoszak, nap);

  const jarmuvek = await query<{ id: string; kod: string; cimke: string; sofor: string | null; ecofleet_object_id: string | null; vontato_rendszam: string | null }>(
    `select j.id::text, j.kod, j.cimke, a.name as sofor, j.ecofleet_object_id, j.vontato_rendszam
     from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  );

  // Megbízások az időszakban, naponta és kocsinként.
  const megbizasok = await query<{ jarmu_id: string | null; nap: string; jelleg: "ber" | "sajat"; fuvardij: number | null; penznem: string }>(
    `select m.jarmu_id::text, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as nap, m.jelleg,
       m.fuvardij, m.fuvardij_penznem as penznem
     from fuvar_megbizasok m
     where m.torolt_at is null and m.allapot is not null
       and coalesce(m.lerakas_datum, m.datum) between $1::date and $2::date`,
    [kezdet, veg]
  );
  const kocsiNelkul = megbizasok.filter((m) => !m.jarmu_id).length;

  // GPS km és liter — tény.
  let utak: { rendszamKulcs: string; nap: string; km: number; liter: number }[] = [];
  let gpsHiba: string | null = null;
  try {
    const sorok = await getUtvonalJelentes(
      jarmuvek.map((j) => j.ecofleet_object_id!).filter(Boolean),
      kezdet,
      veg
    );
    utak = sorok.map((s) => ({ rendszamKulcs: s.rendszamKulcs, nap: s.indulas.slice(0, 10), km: s.tavKm, liter: s.uzemanyagL }));
  } catch (err) {
    gpsHiba = err instanceof Error ? err.message : "Ecofleet hiba";
  }

  let gazolajAr: number | null = null;
  let gazolajCimke: string | null = null;
  try {
    const ar = await fetchGazolajAr();
    gazolajAr = ar.ar;
    gazolajCimke = ar.cimke;
  } catch {
    gazolajAr = null;
  }

  // Útdíj — csak ha van importált tranzakció.
  const utdijSorok = await query<{ jarmu_id: string | null; osszeg: number }>(
    `select jarmu_id::text, sum(brutto_ft)::int as osszeg from utdij_tranzakcio
     where (idopont at time zone 'Europe/Budapest')::date between $1::date and $2::date group by jarmu_id`,
    [kezdet, veg]
  );
  const vanUtdij = utdijSorok.length > 0;

  const napok = new Map<string, KimutatasNap>();
  const ki: KimutatasJarmu[] = [];

  for (const j of jarmuvek) {
    const kulcs = j.vontato_rendszam ? rendszamKulcs(j.vontato_rendszam) : rendszamKulcs(j.kod);
    const sajatUtak = utak.filter((u) => u.rendszamKulcs === kulcs);
    const sajatMegb = megbizasok.filter((m) => m.jarmu_id === j.id);
    let km = 0, berKm = 0, sajatKm = 0, uresKm = 0, liter = 0;

    // Napi bontás: a nap km-je a napon futó megbízás jellegéhez tartozik.
    const napiKm = new Map<string, { km: number; liter: number }>();
    for (const u of sajatUtak) {
      const x = napiKm.get(u.nap) ?? { km: 0, liter: 0 };
      x.km += u.km; x.liter += u.liter;
      napiKm.set(u.nap, x);
    }
    for (const [nap, x] of napiKm) {
      km += x.km; liter += x.liter;
      const aznap = sajatMegb.filter((m) => m.nap === nap);
      const ber = aznap.some((m) => m.jelleg === "ber");
      const saj = aznap.some((m) => m.jelleg === "sajat");
      let b = 0, s = 0, u2 = 0;
      if (ber && saj) { b = x.km / 2; s = x.km / 2; }
      else if (ber) b = x.km;
      else if (saj) s = x.km;
      else u2 = x.km;
      berKm += b; sajatKm += s; uresKm += u2;
      const n = napok.get(nap) ?? { nap, km: 0, berKm: 0, sajatKm: 0, uresKm: 0, bevetelFt: 0 };
      n.km += x.km; n.berKm += b; n.sajatKm += s; n.uresKm += u2;
      napok.set(nap, n);
    }

    const berSorok = sajatMegb.filter((m) => m.jelleg === "ber");
    const bevetelFt = berSorok.filter((m) => m.penznem === "Ft").reduce((a, m) => a + (m.fuvardij ?? 0), 0);
    const bevetelEur = berSorok.filter((m) => m.penznem === "EUR").reduce((a, m) => a + (m.fuvardij ?? 0), 0);
    for (const m of berSorok) {
      if (m.penznem !== "Ft") continue;
      const n = napok.get(m.nap) ?? { nap: m.nap, km: 0, berKm: 0, sajatKm: 0, uresKm: 0, bevetelFt: 0 };
      n.bevetelFt += m.fuvardij ?? 0;
      napok.set(m.nap, n);
    }

    ki.push({
      kod: j.kod, cimke: j.cimke, sofor: j.sofor,
      km: Math.round(km), berKm: Math.round(berKm), sajatKm: Math.round(sajatKm), uresKm: Math.round(uresKm),
      liter: Math.round(liter),
      berDb: berSorok.length,
      sajatDb: sajatMegb.filter((m) => m.jelleg === "sajat").length,
      bevetelFt, bevetelEur,
      megtakaritasFt: 0, // lent, a flotta Ft/km ismeretében
      uzemanyagFt: gazolajAr ? Math.round(liter * gazolajAr) : 0,
      utdijFt: vanUtdij ? (utdijSorok.find((u) => u.jarmu_id === j.id)?.osszeg ?? 0) : null,
      ftKm: berKm > 0 && bevetelFt > 0 ? Math.round(bevetelFt / berKm) : null,
    });
  }

  const berKmOssz = ki.reduce((a, j) => a + j.berKm, 0);
  const bevetelFtOssz = ki.reduce((a, j) => a + j.bevetelFt, 0);
  const berFtKm = berKmOssz > 0 && bevetelFtOssz > 0 ? Math.round(bevetelFtOssz / berKmOssz) : null;
  for (const j of ki) j.megtakaritasFt = berFtKm ? Math.round(j.sajatKm * berFtKm) : 0;

  const uzemanyagOssz = ki.reduce((a, j) => a + j.uzemanyagFt, 0);
  const utdijOssz = vanUtdij ? ki.reduce((a, j) => a + (j.utdijFt ?? 0), 0) : null;
  const megtakaritasOssz = ki.reduce((a, j) => a + j.megtakaritasFt, 0);

  return {
    idoszak, kezdet, veg,
    jarmuvek: ki,
    napok: [...napok.values()].sort((a, b) => a.nap.localeCompare(b.nap)),
    ossz: {
      km: ki.reduce((a, j) => a + j.km, 0),
      berKm: berKmOssz,
      sajatKm: ki.reduce((a, j) => a + j.sajatKm, 0),
      uresKm: ki.reduce((a, j) => a + j.uresKm, 0),
      liter: ki.reduce((a, j) => a + j.liter, 0),
      bevetelFt: bevetelFtOssz,
      bevetelEur: ki.reduce((a, j) => a + j.bevetelEur, 0),
      megtakaritasFt: megtakaritasOssz,
      uzemanyagFt: uzemanyagOssz,
      utdijFt: utdijOssz,
      berFtKm,
      eredmenyFt: bevetelFtOssz > 0 ? bevetelFtOssz + megtakaritasOssz - uzemanyagOssz - (utdijOssz ?? 0) : null,
    },
    gazolajAr, gazolajCimke, gpsHiba, kocsiNelkul,
  };
}
