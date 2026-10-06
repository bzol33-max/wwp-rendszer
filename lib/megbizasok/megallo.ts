import "server-only";

import type { Querier } from "@/lib/db";
import { megalloSorszam } from "@/lib/megbizasok/megallo-tiszta";

/** Meglévő új modellű megálló azonosítója, ha már felépült. (2026-10-06) */
export async function megalloIdTx(tx: Querier, fuvarId: string, megalloIndex: number): Promise<string | null> {
  const [sor] = await tx<{ id: string }>(
    `select id::text from fuvar_megallok where megbizas_id = $1 and sorszam = $2`,
    [fuvarId, megalloSorszam(megalloIndex)]
  );
  return sor?.id ?? null;
}

/** A régi sor hivatkozását a megállók törlése előtt bontja fel az FK miatt. (2026-10-06) */
export async function regiMegalloHivatkozasokTorlese(tx: Querier, fuvarId: string): Promise<void> {
  await tx(`update fuvar_megallo_allapot set megallo_id = null where fuvar_id = $1`, [fuvarId]);
}

async function regiSorTx(tx: Querier, fuvarId: string, index: number, mezok: {
  kesz?: boolean; keszAt?: boolean; keszBy?: boolean; erkezes?: boolean;
  varakozasKezdete?: boolean; varakozasVege?: boolean; gpsErkezes?: boolean; gpsTavozas?: boolean;
}, ertekek: unknown[], kihagyottFrissitesek: string[] = []) {
  const id = await megalloIdTx(tx, fuvarId, index);
  // A közös kód előbb írja az új sort; a régi írás triggertilalma megőrzi a
  // mostani SQL upsert-szemantikát és az új modell tényeit. (2026-10-06)
  await tx(`select set_config('fuvarozas2.megallo_uj_kod', '1', true)`);
  const keys = Object.keys(mezok);
  const column: Record<string, string> = {
    kesz: "kesz", keszAt: "kesz_at", keszBy: "kesz_by", erkezes: "kezi_erkezes",
    varakozasKezdete: "varakozas_kezdete", varakozasVege: "varakozas_vege", gpsErkezes: "gps_erkezes", gpsTavozas: "gps_tavozas",
  };
  const inserts = keys.map((k) => column[k]);
  // Mint a régi SQL: az ELSŐ érkezés / várakozás-kezdet marad meg
  // (coalesce(meglévő, új)), az ismételt gombnyomás nem írja felül.
  const megtarto = new Set(["erkezes", "varakozasKezdete"]);
  const updates = keys.filter((k) => !kihagyottFrissitesek.includes(k)).map((k) => `${column[k]} = ${megtarto.has(k) ? `coalesce(fuvar_megallo_allapot.${column[k]}, excluded.${column[k]})` : `excluded.${column[k]}`}`);
  const vals = ertekek;
  const names = ["fuvar_id", "megallo_index", "megallo_id", ...inserts];
  const params = [fuvarId, index, id, ...vals];
  await tx(
    `insert into fuvar_megallo_allapot (${names.join(", ")}) values (${params.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (fuvar_id, megallo_index) do update set megallo_id = coalesce(excluded.megallo_id, fuvar_megallo_allapot.megallo_id), ${updates.join(", ")}`,
    params
  );
}

export async function megalloKeszTx(tx: Querier, fuvarId: string, index: number, nev: string | null) {
  const [ido] = await tx<{ ido: Date }>(`select now() as ido`);
  await tx(`update fuvar_megallok set sofor_kesz_at = now(), sofor_kesz_by = coalesce($3, sofor_kesz_by) where megbizas_id = $1 and sorszam = $2`, [fuvarId, megalloSorszam(index), nev]);
  await regiSorTx(tx, fuvarId, index, { kesz: true, keszAt: true, keszBy: true }, [true, ido?.ido ?? new Date(), nev]);
}

export async function megalloKeszVisszavonTx(tx: Querier, fuvarId: string, index: number) {
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set sofor_kesz_at = null, sofor_kesz_by = null where id = $1`, [id]);
  await regiSorTx(tx, fuvarId, index, { kesz: true, keszAt: true, keszBy: true }, [false, null, null]);
}

export async function megerkezettTx(tx: Querier, fuvarId: string, index: number, nev: string | null) {
  const [ido] = await tx<{ ido: Date }>(`select now() as ido`);
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set sofor_megerkezett_at = coalesce(sofor_megerkezett_at, now()) where id = $1`, [id]);
  await regiSorTx(tx, fuvarId, index, { kesz: true, erkezes: true, keszBy: true }, [false, ido?.ido ?? new Date(), nev], ["kesz", "keszBy"]);
}

export async function varakozasTx(tx: Querier, fuvarId: string, index: number, muvelet: "kezd" | "vege", nev: string | null) {
  const id = await megalloIdTx(tx, fuvarId, index);
  if (muvelet === "kezd") {
    const [ido] = await tx<{ ido: Date }>(`select now() as ido`);
    if (id) await tx(`update fuvar_megallok set varakozas_kezdete = coalesce(varakozas_kezdete, now()) where id = $1`, [id]);
    await regiSorTx(tx, fuvarId, index, { kesz: true, varakozasKezdete: true, keszBy: true }, [false, ido?.ido ?? new Date(), nev], ["kesz", "keszBy"]);
  } else {
    if (id) await tx(`update fuvar_megallok set varakozas_vege = now() where id = $1 and varakozas_kezdete is not null and varakozas_vege is null returning id`, [id]);
    const [regi] = await tx<{ id: string }>(`update fuvar_megallo_allapot set varakozas_vege = now() where fuvar_id = $1 and megallo_index = $2 and varakozas_kezdete is not null and varakozas_vege is null returning id`, [fuvarId, index]);
    if (!regi) throw new Error("Nincs folyamatban lévő várakozás ezen a megállón.");
  }
}

// A régi tükör-trigger szerint: az érkezés felülíródik, a már ismert
// távozást viszont egy későbbi, távozás nélküli érintés nem törli.
export async function gpsErintesTx(tx: Querier, fuvarId: string, index: number, erkezes: Date, tavozas: Date | null) {
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set gps_erkezes = $2, gps_tavozas = coalesce($3, gps_tavozas) where id = $1`, [id, erkezes.toISOString(), tavozas?.toISOString() ?? null]);
  await regiSorTx(tx, fuvarId, index, { gpsErkezes: true, gpsTavozas: true }, [erkezes.toISOString(), tavozas?.toISOString() ?? null]);
}
