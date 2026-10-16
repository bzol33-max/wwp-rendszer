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

// A régi tükörtábla (fuvar_megallo_allapot) írása 2026-10-16-án megszűnt
// (docs/fuvarozas-1-hullam-terv.md D6): minden olvasó a fuvar_megallok-at
// nézi. A tábla és a megallo_id hivatkozása marad (a trigger és a fenti
// FK-bontás miatt), csak új sor / új tény nem kerül bele.

export async function megalloKeszTx(tx: Querier, fuvarId: string, index: number, nev: string | null) {
  await tx(`update fuvar_megallok set sofor_kesz_at = now(), sofor_kesz_by = coalesce($3, sofor_kesz_by) where megbizas_id = $1 and sorszam = $2`, [fuvarId, megalloSorszam(index), nev]);
}

export async function megalloKeszVisszavonTx(tx: Querier, fuvarId: string, index: number) {
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set sofor_kesz_at = null, sofor_kesz_by = null where id = $1`, [id]);
}

// A `nev` a tükörtábla kesz_by mezőjébe ment; a hívó (lib/fuvarozas/sofor.ts)
// kompatibilitásáért marad a paraméterlistában.
export async function megerkezettTx(tx: Querier, fuvarId: string, index: number, nev: string | null) {
  void nev;
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set sofor_megerkezett_at = coalesce(sofor_megerkezett_at, now()) where id = $1`, [id]);
}

export async function varakozasTx(tx: Querier, fuvarId: string, index: number, muvelet: "kezd" | "vege", nev: string | null) {
  void nev;
  const id = await megalloIdTx(tx, fuvarId, index);
  if (muvelet === "kezd") {
    if (id) await tx(`update fuvar_megallok set varakozas_kezdete = coalesce(varakozas_kezdete, now()) where id = $1`, [id]);
  } else {
    const [vege] = id
      ? await tx<{ id: string }>(`update fuvar_megallok set varakozas_vege = now() where id = $1 and varakozas_kezdete is not null and varakozas_vege is null returning id`, [id])
      : [];
    if (!vege) throw new Error("Nincs folyamatban lévő várakozás ezen a megállón.");
  }
}

// Az érkezés felülíródik, a már ismert távozást viszont egy későbbi,
// távozás nélküli érintés nem törli.
export async function gpsErintesTx(tx: Querier, fuvarId: string, index: number, erkezes: Date, tavozas: Date | null) {
  const id = await megalloIdTx(tx, fuvarId, index);
  if (id) await tx(`update fuvar_megallok set gps_erkezes = $2, gps_tavozas = coalesce($3, gps_tavozas) where id = $1`, [id, erkezes.toISOString(), tavozas?.toISOString() ?? null]);
}
