// A Drive-import napló írása és olvasása — lásd db/schema.sql
// `fuvar_import_naplo`.
//
// Minden feldolgozott fájlról pontosan egy sor keletkezik, a fájl Drive-azonosítójára
// kulcsolva. Az ismételt futások frissítik, nem sokszorozzák.
//
// NEM "use server" fájl — a drive-sync-core.ts (sima Node modul) hívja.

import { query } from "@/lib/db";

export type ImportVerdikt =
  | "biztos"
  | "ellenorizendo"
  | "elutasitva"
  | "nem_megbizas"
  /** A napló bevezetése előtt beimportált irat — nem tudjuk, mit olvasott ki belőle a gép. */
  | "regi_import"
  | "hiba";

export type NaploBejegyzes = {
  driveFileId: string;
  fajlnev: string;
  dokumentumUrl: string;
  partnerKod: string | null;
  olvaso: "duvenbeck" | "llm" | null;
  verdikt: ImportVerdikt;
  kifogasok: string[];
  fuvarId: string | null;
  /** A pdf-parse nyers kimenete. null-t adva a korábban eltárolt szöveg MEGMARAD. */
  nyersSzoveg: string | null;
};

export async function rogzitNaplot(b: NaploBejegyzes): Promise<void> {
  await query(
    `insert into fuvar_import_naplo
       (drive_file_id, fajlnev, dokumentum_url, partner_kod, olvaso, verdikt,
        kifogasok, fuvar_id, nyers_szoveg)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     on conflict (drive_file_id) do update set
       fajlnev        = excluded.fajlnev,
       dokumentum_url = excluded.dokumentum_url,
       partner_kod    = excluded.partner_kod,
       olvaso         = excluded.olvaso,
       verdikt        = excluded.verdikt,
       kifogasok      = excluded.kifogasok,
       fuvar_id       = coalesce(excluded.fuvar_id, fuvar_import_naplo.fuvar_id),
       -- A nyers szöveget soha nem töröljük: ha egy későbbi kör nem olvasta
       -- újra a fájlt, a korábban eltárolt marad.
       nyers_szoveg   = coalesce(excluded.nyers_szoveg, fuvar_import_naplo.nyers_szoveg),
       frissitve_at   = now()`,
    [
      b.driveFileId,
      b.fajlnev,
      b.dokumentumUrl,
      b.partnerKod,
      b.olvaso,
      b.verdikt,
      JSON.stringify(b.kifogasok),
      b.fuvarId,
      b.nyersSzoveg,
    ]
  );
}

/**
 * Azok a fájlok, amikről MÁR eltároltuk a nyers szöveget. Az ezekre
 * vonatkozó szöveg-kinyerést a szinkron kihagyhatja — így a naplófeltöltés
 * fájlonként egyszer fut le, nem óránként újra.
 */
export async function nyersSzoveggelNaplozottFileIdk(): Promise<Set<string>> {
  const sorok = await query<{ drive_file_id: string }>(
    `select drive_file_id from fuvar_import_naplo where nyers_szoveg is not null`
  );
  return new Set(sorok.map((s) => s.drive_file_id));
}

export type NaploSor = {
  drive_file_id: string;
  fajlnev: string | null;
  dokumentum_url: string | null;
  partner_kod: string | null;
  olvaso: string | null;
  verdikt: string | null;
  kifogasok: string[];
  fuvar_id: string | null;
  szoveg_hossz: number;
  frissitve_at: string;
};

/**
 * A napló emberi átnézésre — a nyers szöveg NÉLKÜL (az több száz kilobájt
 * lenne), csak a hosszával, hogy látszódjon: egyáltalán volt-e kiolvasható
 * szöveg a PDF-ben.
 */
export async function importNaplo(limit = 200): Promise<NaploSor[]> {
  return query<NaploSor>(
    `select drive_file_id, fajlnev, dokumentum_url, partner_kod, olvaso, verdikt,
            kifogasok, fuvar_id::text,
            coalesce(length(nyers_szoveg), 0) as szoveg_hossz,
            frissitve_at::text
       from fuvar_import_naplo
      order by
        case verdikt when 'hiba' then 0 when 'elutasitva' then 1
                     when 'ellenorizendo' then 2 else 3 end,
        frissitve_at desc
      limit ${Number(limit) || 200}`
  );
}
