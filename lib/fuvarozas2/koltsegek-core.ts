import "server-only";
import { query } from "@/lib/db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { opluszFeladoPontos, parseHuGoTabla, parseOpluszErtesites, type HuGoBeolvasas } from "@/lib/fuvarozas2/koltseg-import";
import { tablazatSorai } from "@/lib/fuvarozas2/koltseg-xlsx";

export { tablazatSorai };

// Költség-importok — az ÍRÓ rész (DB, fájl-beolvasás). NEM "use server"
// fájl: a Gmail-végpont (levelek-core.ts) és a Költségek oldal szerver-akciói
// (lib/fuvarozas2/koltsegek.ts) hívják; a jogosultságot a hívó ellenőrzi.

export type TankolasRogzites = {
  /** "YYYY-MM-DD HH:MM[:SS]" budapesti idő. */
  idopont: string;
  rendszam: string | null;
  osszegFt: number;
  liter: number | null;
  tranzakcioSzam: string;
  forras: "oplusz_email" | "kezi" | "import";
  levelId?: string | null;
  rogzitette?: string | null;
  /** Gyanús sor oka (pl. valószínűtlen Ft/l, ezért a liter üres). */
  figyelmeztetes?: string | null;
};

/** Egy tankolás mentése; idempotens a tranzakciószámra. true, ha új sor lett. */
export async function rogzitTankolast(t: TankolasRogzites): Promise<boolean> {
  const jarmuvek = await getJarmuvek();
  const jarmu = t.rendszam ? findJarmuByPlate(t.rendszam, jarmuvek) : null;
  const sorok = await query<{ id: string }>(
    `insert into tankolas (jarmu_id, rendszam_nyers, idopont, liter, osszeg_ft, tranzakcio_szam, forras, level_id, rogzitette, figyelmeztetes)
     values ($1::bigint, $2, ($3::timestamp at time zone 'Europe/Budapest'), $4, $5, $6, $7, $8, $9, $10)
     on conflict (tranzakcio_szam) do nothing
     returning id::text`,
    [jarmu?.id ?? null, t.rendszam, t.idopont, t.liter, t.osszegFt, t.tranzakcioSzam, t.forras, t.levelId ?? null, t.rogzitette ?? null, t.figyelmeztetes ?? null]
  );
  return sorok.length > 0;
}

/**
 * Egy 'tankolas' osztályú levél (Oplusz bizonylat-értesítő) feldolgozása —
 * a levelek-core hívja minden ilyen levélre (idempotens). A havi számla-
 * értesítőből nem lesz tankolás (nincs benne vásárlás). CSAK a kút pontos
 * feladócíméről jött levélből ír (opluszFeladoPontos) — a továbbított vagy
 * hasonmás levél osztályozva marad, de tankolás-sort nem hoz létre.
 */
export async function tankolasLevelbol(l: { gmailMessageId: string; felado: string; targy: string | null; snippet: string | null }): Promise<"uj" | "ismert" | "nem_bizonylat" | "nem_kut_felado"> {
  if (!opluszFeladoPontos(l.felado)) return "nem_kut_felado";
  const t = parseOpluszErtesites(`${l.targy ?? ""}\n${l.snippet ?? ""}`);
  if (!t) return "nem_bizonylat";
  const uj = await rogzitTankolast({
    idopont: t.idopont, rendszam: t.rendszam, osszegFt: t.osszegFt, liter: t.liter,
    tranzakcioSzam: t.tranzakcioSzam, forras: "oplusz_email", levelId: l.gmailMessageId, rogzitette: "gmail-figyelo",
    figyelmeztetes: t.figyelmeztetes,
  });
  return uj ? "uj" : "ismert";
}

export type HuGoImportEredmeny = {
  beolvasva: number;
  uj: number;
  marVolt: number;
  kocsiNelkul: number;
  hibak: string[];
  kihagyott: number;
  oszlopok: Record<string, string>;
  osszegFt: number;
  idoszak: { tol: string; ig: string } | null;
};

/** HU-GO export beolvasása és mentése az utdij_tranzakcio táblába (idempotens a kulso_azonosito-ra). */
export async function importalHuGo(fajlnev: string, tartalom: Buffer): Promise<HuGoImportEredmeny> {
  const sorok = await tablazatSorai(fajlnev, tartalom);
  const b: HuGoBeolvasas = parseHuGoTabla(sorok, await getJarmuvek());
  let uj = 0;
  for (const t of b.tranzakciok) {
    const r = await query<{ id: string }>(
      `insert into utdij_tranzakcio (jarmu_id, rendszam, rendszam_nyers, idopont, szakasz, kategoria, brutto_ft, netto_ft, tav_km, kulso_azonosito, forras_fajl)
       select $1::bigint, $2, $3, ($4::timestamp at time zone 'Europe/Budapest'), $5, $6, $7, $8, $9, $10, $11
       -- a 2026-10-10-i első importok még az összetett kulccsal mentettek: azokat is ismertnek vesszük
       where $12::text = $10::text or not exists (select 1 from utdij_tranzakcio where kulso_azonosito = $12::text)
       on conflict (kulso_azonosito) do nothing returning id::text`,
      [t.jarmuId, t.rendszam, t.rendszam, t.idopont, t.szakasz, t.kategoria, t.bruttoFt, t.nettoFt, t.tavKm, t.kulsoAzonosito, fajlnev.slice(0, 200), t.regiKulcs]
    );
    if (r.length > 0) uj++;
  }
  const idok = b.tranzakciok.map((t) => t.idopont).sort();
  return {
    beolvasva: b.tranzakciok.length,
    uj,
    marVolt: b.tranzakciok.length - uj,
    kocsiNelkul: b.tranzakciok.filter((t) => !t.jarmuId).length,
    hibak: b.hibak.slice(0, 30),
    kihagyott: b.kihagyott,
    oszlopok: b.oszlopok,
    osszegFt: b.tranzakciok.reduce((a, t) => a + t.bruttoFt, 0),
    idoszak: idok.length ? { tol: idok[0], ig: idok[idok.length - 1] } : null,
  };
}
