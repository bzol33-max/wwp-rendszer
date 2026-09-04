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
  felrako: string;
  lerako: string;
  megrendelo: string | null;
  aru: string | null;
  jarmu: string | null;
  alvallalkozo: string | null;
  fuvardij: number | null;
  koltseg: number | null;
  statusz: FuvarStatusz;
  megjegyzes: string | null;
  created_by: string | null;
};

const TIME_FMT = "mon. DD";

export async function getFuvarok(tipus: FuvarTipus): Promise<FuvarRow[]> {
  return query<FuvarRow>(
    `select id::text, tipus,
            to_char(datum, '${TIME_FMT}') as date,
            felrako, lerako, megrendelo, aru, jarmu, alvallalkozo,
            fuvardij, koltseg, statusz, megjegyzes, created_by
     from fuvar_megbizasok
     where tipus = $1 and statusz <> 'torolt'
     order by datum desc, id desc
     limit 200`,
    [tipus]
  );
}

export type AddFuvarInput = {
  tipus: FuvarTipus;
  datum: string;
  felrako: string;
  lerako: string;
  megrendelo?: string;
  aru?: string;
  jarmu?: string;
  alvallalkozo?: string;
  fuvardij?: number;
  koltseg?: number;
  megjegyzes?: string;
  createdBy?: string;
};

export async function addFuvar(input: AddFuvarInput) {
  await query(
    `insert into fuvar_megbizasok
       (tipus, datum, felrako, lerako, megrendelo, aru, jarmu, alvallalkozo, fuvardij, koltseg, megjegyzes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      input.tipus,
      input.datum,
      input.felrako,
      input.lerako,
      input.megrendelo || null,
      input.aru || null,
      input.jarmu || null,
      input.alvallalkozo || null,
      input.fuvardij ?? null,
      input.koltseg ?? null,
      input.megjegyzes || null,
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
