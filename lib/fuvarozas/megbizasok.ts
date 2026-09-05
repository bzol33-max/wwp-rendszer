"use server";

import { query } from "@/lib/db";
import type {
  FuvarTipus,
  FuvarStatusz,
  FuvarRow,
  AddFuvarInput,
  ApproveFuvarInput,
} from "@/lib/fuvarozas/fuvar-constants";

// FIGYELEM: ez egy "use server" fájl — Next.js-ben ez KIZÁRÓLAG async
// függvényeket exportálhat. Típusokat, konstans objektumokat/tömböket NE
// ide tegyünk (lásd lib/fuvarozas/fuvar-constants.ts), mert az futásidőben
// "A "use server" file can only export async functions, found object."
// hibát okoz, és eldönti az egész oldalt.

const TIME_FMT = "mon. DD";

const FUVAR_ROW_COLUMNS = `
  id::text, tipus,
  to_char(datum, '${TIME_FMT}') as date,
  idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
  jarmu, sofor, alvallalkozo,
  fuvardij, koltseg, statusz, megjegyzes,
  dokumentum_url, forras, ellenorzott, created_by,
  to_char(erkezett_datum, '${TIME_FMT}') as erkezett_datum,
  to_char(lerakas_datum, '${TIME_FMT}') as lerakas_datum,
  fizetesi_hatarido_nap,
  pozicioszam, pozicioszam_nincs
`;

export async function getFuvarok(tipus: FuvarTipus): Promise<FuvarRow[]> {
  // A "sajat" tipus mögött (megjelenítve: "Bér fuvarok") a megbízás beérkezési
  // dátuma a fő rendezési szempont — a "fuvar_megbizasok." előtag azért kell,
  // mert az erkezett_datum alias a select-listában már formázott szöveg, a
  // dátum szerinti (nem szöveges) rendezéshez az eredeti oszlopra van szükség.
  const orderBy =
    tipus === "sajat"
      ? `ellenorzott asc, fuvar_megbizasok.erkezett_datum desc nulls last, datum desc, id desc`
      : `ellenorzott asc, datum desc, id desc`;
  return query<FuvarRow>(
    `select ${FUVAR_ROW_COLUMNS}
     from fuvar_megbizasok
     where tipus = $1 and statusz <> 'torolt'
     order by ${orderBy}
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

export async function addFuvar(input: AddFuvarInput) {
  await query(
    `insert into fuvar_megbizasok
       (tipus, datum, idopont, felrako, lerako, megrendelo, aru, mennyiseg, suly,
        jarmu, sofor, alvallalkozo, fuvardij, koltseg, megjegyzes,
        dokumentum_url, drive_file_id, forras, ellenorzott, created_by,
        erkezett_datum, lerakas_datum, fizetesi_hatarido_nap,
        pozicioszam, pozicioszam_nincs)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
    [
      input.tipus,
      input.datum,
      input.idopont || null,
      input.felrako || null,
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
      input.erkezettDatum || null,
      input.lerakasDatum || null,
      input.fizetesiHataridoNap ?? null,
      input.pozicioszam || null,
      input.pozicioszamNincs ?? false,
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

/** A lista soron belüli, azonnali javítás: a hivatkozási szám kitöltése vagy "nincs" jelölése. */
export async function setFuvarPoziciszam(
  id: string,
  input: { pozicioszam?: string | null; nincs?: boolean }
) {
  await query(
    `update fuvar_megbizasok set
       pozicioszam = $2,
       pozicioszam_nincs = $3
     where id = $1`,
    [id, input.pozicioszam || null, input.nincs ?? false]
  );
}

/** A "Jóváhagy" / "Módosít" gomb: a mezőket (esetleg módosítva) menti, és ellenorzott = true. */
export async function approveFuvar(input: ApproveFuvarInput) {
  await query(
    `update fuvar_megbizasok set
       tipus = $2, datum = $3, idopont = $4, felrako = $5, lerako = $6,
       megrendelo = $7, aru = $8, mennyiseg = $9, suly = $10,
       jarmu = $11, sofor = $12, alvallalkozo = $13,
       fuvardij = $14, koltseg = $15, megjegyzes = $16,
       pozicioszam = $17, pozicioszam_nincs = $18,
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
      input.pozicioszam || null,
      input.pozicioszamNincs ?? false,
    ]
  );
}
