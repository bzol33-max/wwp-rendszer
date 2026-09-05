// Fuvar-típusú konstansok és típusok — NEM "use server" fájl.
//
// A lib/fuvarozas/megbizasok.ts egy "use server" fájl, ami Next.js-ben
// KIZÁRÓLAG async függvényeket exportálhat. A FUVAR_STATUSZ_LABEL objektum
// és a FUVAR_STATUSZOK tömb (nem-függvény érték) ezért ide került ki — ezek
// hiánya futásidőben "A "use server" file can only export async functions,
// found object." hibát okozott, ami az egész Fuvarozás oldalt eldöntötte.

export type FuvarTipus = "sajat" | "ber";

export type FuvarStatusz =
  | "uj"
  | "tervezett"
  | "uton"
  | "lezarva"
  | "szamlazva"
  | "problemas"
  | "torolt";

export const FUVAR_STATUSZ_LABEL: Record<FuvarStatusz, string> = {
  uj: "Új",
  tervezett: "Tervezett",
  uton: "Úton",
  lezarva: "Lezárva",
  szamlazva: "Számlázva",
  problemas: "Problémás",
  torolt: "Törölt",
};

export const FUVAR_STATUSZOK = Object.keys(FUVAR_STATUSZ_LABEL) as FuvarStatusz[];

export type FuvarRow = {
  id: string;
  tipus: FuvarTipus;
  date: string;
  idopont: string | null;
  felrako: string | null;
  lerako: string;
  megrendelo: string | null;
  aru: string | null;
  mennyiseg: string | null;
  suly: string | null;
  jarmu: string | null;
  sofor: string | null;
  alvallalkozo: string | null;
  fuvardij: number | null;
  koltseg: number | null;
  statusz: FuvarStatusz;
  megjegyzes: string | null;
  dokumentum_url: string | null;
  forras: "kezi" | "pdf_import";
  ellenorzott: boolean;
  created_by: string | null;
  /** A megbízás beérkezésének dátuma (bér fuvaroknál) — formázva, mint a "date" mező. */
  erkezett_datum: string | null;
  /** A lerakás dátuma, ha eltér a felrakás dátumától ("date" mezőtől) — formázva. */
  lerakas_datum: string | null;
  /** A megbízásban szereplő fizetési határidő, napokban (pl. 30/45/60). */
  fizetesi_hatarido_nap: number | null;
};

export type AddFuvarInput = {
  tipus: FuvarTipus;
  datum: string;
  idopont?: string;
  felrako?: string;
  lerako: string;
  megrendelo?: string;
  aru?: string;
  mennyiseg?: string;
  suly?: string;
  jarmu?: string;
  sofor?: string;
  alvallalkozo?: string;
  fuvardij?: number;
  koltseg?: number;
  megjegyzes?: string;
  dokumentumUrl?: string;
  driveFileId?: string;
  forras?: "kezi" | "pdf_import";
  ellenorzott?: boolean;
  createdBy?: string;
  erkezettDatum?: string;
  lerakasDatum?: string;
  fizetesiHataridoNap?: number;
};

export type ApproveFuvarInput = {
  id: string;
  tipus: FuvarTipus;
  datum: string;
  idopont?: string;
  felrako: string;
  lerako: string;
  megrendelo?: string;
  aru?: string;
  mennyiseg?: string;
  suly?: string;
  jarmu?: string;
  sofor?: string;
  alvallalkozo?: string;
  fuvardij?: number;
  koltseg?: number;
  megjegyzes?: string;
};
