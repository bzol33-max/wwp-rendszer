"use server";

import { query } from "@/lib/db";
import type { KapcsolatRow, AddKapcsolatInput } from "@/lib/fuvarozas/kapcsolatok-constants";

// A Kapcsolatok tábla automatikusan, kézi lépés nélkül bővül minden
// induláskor/deploykor — lásd scripts/migrate.mjs és db/kapcsolatok-updates.json.
// Ez a fájl csak a UI-ból használt CRUD-műveleteket tartalmazza.

export async function getKapcsolatok(): Promise<KapcsolatRow[]> {
  return query<KapcsolatRow>(
    `select id::text, ceg, kapcsolattarto, telefon, email, megjegyzes, forras
     from fuvar_kapcsolatok
     order by ceg asc, kapcsolattarto asc nulls last, id asc`
  );
}

export async function addKapcsolat(input: AddKapcsolatInput) {
  await query(
    `insert into fuvar_kapcsolatok (ceg, kapcsolattarto, telefon, email, megjegyzes, forras)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.ceg,
      input.kapcsolattarto || null,
      input.telefon || null,
      input.email || null,
      input.megjegyzes || null,
      input.forras || null,
    ]
  );
}

export async function deleteKapcsolat(id: string) {
  await query(`delete from fuvar_kapcsolatok where id = $1`, [id]);
}
