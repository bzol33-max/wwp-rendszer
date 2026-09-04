"use server";

import { query } from "@/lib/db";

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
  felrako: string;
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
};

const TIME_FMT = "mon. DD";

const FUVAR_ROW_COLUMNS = `
  id::text, tipus,
  to_char(datum, '${TIME_FMT}') as date,
  idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
  jarmu, sofor, alvallalkozo,
  fuvardij, koltseg, statusz, megjegyzes,
  dokumentum_url, forras, ellenorzott, created_by
`;

export async function getFuvarok(tipus: FuvarTipus): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where tipus = $1 and statusz <> 'torolt'
     order by ellenorzott asc, datum desc, id desc
     limit 200`,
    [tipus]
  );
}

/** A PDF-ből előkészített, még jóvá nem hagyott fuvarok — típustól függetlenül. */
export async function getElokeszitettFuvarok(): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where ellenorzott = false and statusz <> 'torolt'
     order by datum desc, id desc
     limit 200`
  );
}

export type AddFuvarInput = {
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
  dokumentumUrl?: string;
  driveFileId?: string;
  forras?: "kezi" | "pdf_import";
  ellenorzott?: boolean;
  createdBy?: string;
};

export async function addFuvar(input: AddFuvarInput) {
  await query(
    `insert into fuvar_megbizasok
       (tipus, datum, idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
        jarmu, sofor, alvallalkozo, fuvardij, koltseg, megjegyzes,
        dokumentum_url, drive_file_id, forras, ellenorzott, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      input.tipus,
      input.datum,
      input.idopont || null,
      input.felrako,
      input.lerako,
      input.megrendelo || null,
      input.aru || null,
      input.mennyiseg || null,
      input.suly || null,
      input.jarmu || null,
      input.sofor || null,
      input.alvallalkozo || null,
      input.fuvardij ?? null,
      input.koltseg ?? null,
      input.megjegyzes || null,
      input.dokumentumUrl || null,
      input.driveFileId || null,
      input.forras ?? "kezi",
      input.ellenorzott ?? true,
      input.createdBy ?? null,
    ]
  );
}

export async function updateFuvarStatus(id: string, statusz: FuvarStatusz) {
  await query(`update fuvar_megbizasok set statusz = $2 where id = $1`, [id, statusz]);
}

export async function deleteFuvar(id: string) {
  // Nem töröljük fizikailag — "Törölt" státuszba kerül, hogy a naplózás megmaradjon.
  await query(`update fuvar_megbizasok set statusz = 'torolt' where id = $1`, [id]);
}

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

/** A "Jóváhagy" / "Módosít" gomb: a mezőket (esetleg módosítva) menti, és ellenorzott = true. */
export async function approveFuvar(input: ApproveFuvarInput) {
  await query(
    `update fuvar_megbizasok set
       tipus = $2, datum = $3, idopont = $4, felrako = $5, lerako = $6,
       megrendelo = $7, aru = $8, mennyiseg = $9, suly = $10,
       jarmu = $11, sofor = $12, alvallalkozo = $13,
       fuvardij = $14, koltseg = $15, megjegyzes = $16,
       ellenorzott = true
     where id = $1`,
    [
      input.id,
      input.tipus,
      input.datum,
      input.idopont || null,
      input.felrako,
      input.lerako,
      input.megrendelo || null,
      input.aru || null,
      input.mennyiseg || null,
      input.suly || null,
      input.jarmu || null,
      input.sofor || null,
      input.alvallalkozo || null,
      input.fuvardij ?? null,
      input.koltseg ?? null,
      input.megjegyzes || null,
    ]
  );
}
