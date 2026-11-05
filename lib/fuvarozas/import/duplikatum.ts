// Ugyanaz a megbízás másodszor, de nem betűre azonos szöveggel.
//
// A szó szerinti egyezést az azonosSzoveguIsmertIrat (naplo.ts) fogja meg; ha a
// megbízó újraküldi az iratot (más nyomtatás, módosított sor), az átcsúszott, és
// új sor lett belőle. Élesben: RBT poz 3542 (2026-11-05) — a #342 már kész volt,
// a #362 a régi felrakási nappal jött létre, így a sofőr listáján az élre állt,
// és csak úgy tudott továbblépni, hogy lezárta.
//
// A felrakási nap is a kulcs része, mert van, aki ugyanazt a hivatkozást
// használja az ismétlődő fuvarjaihoz: más napon az már valódi új fuvar.

import { ceglNevKanonikusan, normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";

export type MegbizasAzonosito = {
  megrendelo: string | null | undefined;
  pozicioszam: string | null | undefined;
  /** A felrakás napja, YYYY-MM-DD. */
  datum: string | null | undefined;
};

function hivatkozasKulcs(szam: string | null | undefined): string {
  return (szam ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function megrendeloKulcs(nev: string | null | undefined): string {
  return nev?.trim() ? normalizaltCegKulcs(ceglNevKanonikusan(nev)) : "";
}

/** Hiányzó megbízónál, hivatkozásnál vagy napnál nem dönthető el, ezért hamis: inkább új sor, mint elveszett fuvar. */
export function ugyanazAMegbizas(a: MegbizasAzonosito, b: MegbizasAzonosito): boolean {
  const hivatkozas = hivatkozasKulcs(a.pozicioszam);
  const megrendelo = megrendeloKulcs(a.megrendelo);
  if (!hivatkozas || !megrendelo || !a.datum) return false;
  return a.datum === b.datum && hivatkozas === hivatkozasKulcs(b.pozicioszam) && megrendelo === megrendeloKulcs(b.megrendelo);
}
