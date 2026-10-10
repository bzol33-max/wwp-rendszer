"use server";

// Fuvarozás — Költségek fül (5. fázis, 2026-10-10): HU-GO útdíj-import,
// tankolások (a kút e-mailjeiből és kézzel), a számítás beállításai.
// Jog: megtekintés a Fuvarozás vagy az Elszámolás nézetével, írás bármelyik
// szerkesztési jogával — ugyanaz, mint a modul elrendezése (layout.tsx).

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyEditPermission, requireAnyViewPermission } from "@/lib/auth/require-permission";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { idopontHu, OPLUSZ_FT_L_IG, OPLUSZ_FT_L_TOL, szamHu } from "@/lib/fuvarozas2/koltseg-import";
import { importalHuGo, rogzitTankolast, type HuGoImportEredmeny } from "@/lib/fuvarozas2/koltsegek-core";

export type TankolasSor = {
  id: string;
  idopont: string;
  jarmuKod: string | null;
  rendszam: string | null;
  liter: number | null;
  osszegFt: number;
  ftPerLiter: number | null;
  tranzakcioSzam: string;
  forras: "oplusz_email" | "kezi" | "import";
  rogzitette: string | null;
  /** Gyanús sor oka (pl. valószínűtlen Ft/l — a liter ezért üres). */
  figyelmeztetes: string | null;
};

export type UtdijHonap = { honap: string; db: number; osszegFt: number; kocsiNelkul: number };

export type KoltsegekOldal = {
  tankolasok: TankolasSor[];
  utdijHonapok: UtdijHonap[];
  utolsoUtdijImport: string | null;
  beallitas: FuvarBeallitasok;
  /** `nev`: a választóban egyszer kiírt név — kód, és ha más, a felirat / a sofőr. */
  jarmuvek: { kod: string; label: string; rendszam: string | null; nev: string }[];
};

export async function getKoltsegekOldal(): Promise<KoltsegekOldal> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const tankolasok = await query<{
    id: string; idopont: string; jarmu_kod: string | null; rendszam_nyers: string | null; liter: number | null; osszeg_ft: number;
    tranzakcio_szam: string; forras: TankolasSor["forras"]; rogzitette: string | null; figyelmeztetes: string | null;
  }>(
    `select t.id::text, to_char(t.idopont at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as idopont,
       j.kod as jarmu_kod, t.rendszam_nyers, t.liter::float8 as liter, t.osszeg_ft::float8 as osszeg_ft,
       t.tranzakcio_szam, t.forras, t.rogzitette, t.figyelmeztetes
     from tankolas t left join fuvar_jarmuvek j on j.id = t.jarmu_id
     where t.idopont >= now() - interval '62 days'
     order by t.idopont desc limit 300`
  );
  const utdijHonapok = await query<{ honap: string; db: number; osszeg_ft: number; kocsi_nelkul: number }>(
    `select to_char(idopont at time zone 'Europe/Budapest', 'YYYY-MM') as honap, count(*)::int as db,
       sum(brutto_ft)::float8 as osszeg_ft, count(*) filter (where jarmu_id is null)::int as kocsi_nelkul
     from utdij_tranzakcio group by 1 order by 1 desc limit 12`
  );
  const [utolso] = await query<{ at: string | null }>(
    `select to_char(max(importalva_at) at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') as at from utdij_tranzakcio`
  );
  const jarmuvek = await getJarmuvek();
  return {
    tankolasok: tankolasok.map((t) => ({
      id: t.id, idopont: t.idopont, jarmuKod: t.jarmu_kod, rendszam: t.rendszam_nyers,
      liter: t.liter != null ? Number(t.liter) : null, osszegFt: Number(t.osszeg_ft),
      ftPerLiter: t.liter ? Math.round((Number(t.osszeg_ft) / Number(t.liter)) * 10) / 10 : null,
      tranzakcioSzam: t.tranzakcio_szam, forras: t.forras, rogzitette: t.rogzitette, figyelmeztetes: t.figyelmeztetes,
    })),
    utdijHonapok: utdijHonapok.map((u) => ({ honap: u.honap, db: u.db, osszegFt: Number(u.osszeg_ft), kocsiNelkul: u.kocsi_nelkul })),
    utolsoUtdijImport: utolso?.at ?? null,
    beallitas: await getFuvarBeallitasok(),
    jarmuvek: jarmuvek.filter((j) => j.kod).map((j) => {
      const kod = j.kod as string;
      // A felirat sokszor a rendszám (= kód, + pótkocsi): a sofőr kerül a kód mellé, nem kétszer ugyanaz.
      const norm = (x: string) => x.replace(/[\s-]/g, "").toUpperCase();
      const egyeb = j.sofor?.trim() || (j.label && !norm(j.label).startsWith(norm(kod)) ? j.label : null);
      return { kod, label: j.label, rendszam: j.rendszamok[0] ?? null, nev: egyeb ? `${kod} · ${egyeb}` : kod };
    }),
  };
}

const MAX_FAJL_BYTE = 7 * 1024 * 1024;

/** HU-GO export (XLSX vagy CSV) feltöltése; a kliens base64-ben küldi. */
export async function importalHuGoFajlt(fajlnev: string, base64: string): Promise<HuGoImportEredmeny> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const nev = String(fajlnev ?? "").slice(0, 200);
  if (!/\.(xlsx|csv|txt)$/i.test(nev)) throw new Error("Csak .xlsx vagy .csv fájl tölthető fel.");
  const tartalom = Buffer.from(String(base64 ?? ""), "base64");
  if (tartalom.length === 0) throw new Error("Üres fájl.");
  if (tartalom.length > MAX_FAJL_BYTE) throw new Error("A fájl túl nagy (legfeljebb 7 MB).");
  const eredmeny = await importalHuGo(nev, tartalom);
  revalidatePath("/fuvarozas2/koltsegek");
  revalidatePath("/fuvarozas2/kimutatas");
  return eredmeny;
}

export type KeziTankolas = { idopont: string; jarmuKod: string; osszeg: string; liter?: string; tranzakcioSzam?: string };

/** Kézi tankolás-rögzítés (pl. más kúton, bizonylatról). */
export async function rogzitKeziTankolast(be: KeziTankolas): Promise<{ ok: true; uj: boolean } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const idopont = idopontHu(String(be.idopont ?? "").replace("T", " "));
  if (!idopont) return { ok: false, hiba: "Érvénytelen időpont." };
  const osszeg = szamHu(be.osszeg);
  if (osszeg == null || osszeg <= 0 || osszeg > 5_000_000) return { ok: false, hiba: "Érvénytelen összeg." };
  const liter = be.liter?.trim() ? szamHu(be.liter) : null;
  if (be.liter?.trim() && (liter == null || liter <= 0 || liter > 2000)) return { ok: false, hiba: "Érvénytelen liter." };
  if (liter != null) {
    const ftL = osszeg / liter;
    if (ftL < OPLUSZ_FT_L_TOL || ftL > OPLUSZ_FT_L_IG) {
      return { ok: false, hiba: `Valószínűtlen egységár: ${Math.round(ftL)} Ft/l (${OPLUSZ_FT_L_TOL}–${OPLUSZ_FT_L_IG} Ft/l várható). Ellenőrizd az összeget és a litert.` };
    }
  }
  const jarmu = (await getJarmuvek()).find((j) => j.kod === be.jarmuKod);
  if (!jarmu) return { ok: false, hiba: "Válassz kocsit." };
  const rendszam = jarmu.rendszamok[0] ?? jarmu.kod ?? null;
  const tranz = be.tranzakcioSzam?.trim().slice(0, 80) || `kezi:${idopont}|${jarmu.kod}|${osszeg}`;
  const uj = await rogzitTankolast({
    idopont, rendszam, osszegFt: osszeg, liter, tranzakcioSzam: tranz, forras: "kezi",
    rogzitette: session.name ?? session.username,
  });
  revalidatePath("/fuvarozas2/koltsegek");
  return { ok: true, uj };
}

/** Kézzel rögzített tankolás törlése (elírás javítására). Az e-mailből jött sor nem törölhető. */
export async function torolKeziTankolast(id: string): Promise<{ ok: boolean }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const sorok = await query<{ id: string }>(`delete from tankolas where id = $1::bigint and forras = 'kezi' returning id::text`, [id]);
  revalidatePath("/fuvarozas2/koltsegek");
  return { ok: sorok.length > 0 };
}
