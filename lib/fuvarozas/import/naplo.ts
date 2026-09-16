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
  /** Ugyanaz az irat még egyszer, más Drive-azonosítóval (kétszer feltöltve) — a meglévő fuvarhoz csatoltuk, új sor nem lett. */
  | "duplikatum"
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
 * Ugyanaz az irat még egyszer, MÁS Drive-azonosítóval: a mappába kétszer
 * feltöltött fájl (élesben pl. 26-3289.pdf, 26-3553.pdf, FRALI1994504_V1.pdf
 * kétszer). A Duvenbeck-iratokat az Út ID egy sorba fogja, de a többi
 * partner iratának nincs ilyen kulcsa — ott a második példányból a nyelvi
 * modell útján ÚJ sor lett, és a fuvar kétszer szerepelt (kétszer volt
 * számlázható). A pdf-parse nyers szövege fájlonként el van tárolva
 * (nyers_szoveg), és két azonos PDF-ből szó szerint ugyanaz jön ki — ez a
 * kulcs. Csak élő fuvarhoz kötött, korábbi iratot ad vissza.
 */
export async function azonosSzoveguIsmertIrat(
  driveFileId: string,
  nyersSzoveg: string
): Promise<{ driveFileId: string; fajlnev: string | null; fuvarId: string } | null> {
  if (!nyersSzoveg.trim()) return null;
  const [sor] = await query<{ drive_file_id: string; fajlnev: string | null; fuvar_id: string }>(
    `select n.drive_file_id, n.fajlnev, n.fuvar_id::text
     from fuvar_import_naplo n
     join fuvar_megbizasok f on f.id = n.fuvar_id and f.statusz <> 'torolt'
     where n.drive_file_id <> $1
       and n.nyers_szoveg is not null
       and md5(n.nyers_szoveg) = md5($2)
       and n.nyers_szoveg = $2
     order by n.created_at asc
     limit 1`,
    [driveFileId, nyersSzoveg]
  );
  return sor ? { driveFileId: sor.drive_file_id, fajlnev: sor.fajlnev, fuvarId: sor.fuvar_id } : null;
}

/**
 * Egy irat hozzákötése egy meglévő fuvarhoz (fuvar_dokumentumok) — ettől a
 * fájl "ismert" lesz (ismertDriveFileIdk), a szinkron nem olvassa újra.
 */
export async function csatolIratotFuvarhoz(
  fuvarId: string,
  file: { id: string; name: string; url: string },
  tipus: "megbizas" | "rakomanylista" | "egyeb" = "egyeb"
): Promise<void> {
  await query(
    `insert into fuvar_dokumentumok (fuvar_id, drive_file_id, dokumentum_url, tipus, fajlnev)
     values ($1, $2, $3, $4, $5)
     on conflict (drive_file_id) do update set fuvar_id = excluded.fuvar_id`,
    [fuvarId, file.id, file.url, tipus, file.name]
  );
}

/**
 * A Duvenbeck egy fuvarhoz KÉT iratot küld (megbízás + rakománylista, lásd
 * lib/fuvarozas/duvenbeck.ts). Ha egy sorhoz csak az egyik van meg, a másik
 * hiányzik — a cím vagy az ár addig a gyengébb forrásból származik. Ezt a
 * szinkron a futás VÉGÉN kérdezi le (nem az első irat érkezésekor, mert a pár
 * két tagja ugyanabban a körben jön, és akkor minden pár "hiányosnak"
 * látszana egy pillanatig).
 */
export async function hianyzoDuvenbeckParja(fuvarId: string): Promise<"megbizas" | "rakomanylista" | null> {
  const [sor] = await query<{ van_megbizas: boolean; van_rakomanylista: boolean }>(
    `select bool_or(tipus = 'megbizas') as van_megbizas,
            bool_or(tipus = 'rakomanylista') as van_rakomanylista
     from fuvar_dokumentumok where fuvar_id = $1`,
    [fuvarId]
  );
  if (!sor) return null;
  if (!sor.van_megbizas && sor.van_rakomanylista) return "megbizas";
  if (sor.van_megbizas && !sor.van_rakomanylista) return "rakomanylista";
  return null;
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
