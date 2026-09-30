"use server";

// Fuvarozás 2 — közös Kalkulátor (2026-09-30: a régi útdíjkalkulátor és a
// tervvászon D6 kalkulátora egyben). Amit számol:
//   • RAKOTT km, menetidő, útdíj: az összes megállón át (HU-GO), a térképhez
//     geometriával.
//   • ÜRES km: telephely → első megálló és utolsó megálló → telephely (ha
//     nincs visszfuvar) — ez az, ami a legtöbb kalkulációból kimarad.
//   • Üzemanyag: (rakott + üres) km × mért fogyasztás (Ecofleet, 14 nap) ×
//     NAV gázolajár a tankolási kedvezménnyel (lib/fuvarozas/gazolaj.ts).
//   • Útdíj a teljes útra; napi költség 50 000 Ft/nap (kalkulator-alap.ts).
//   • Önköltség, 500/600/700 Ft/km ajánlat-sáv és a megbízó ajánlatának minősítése.
//
// Minden külső hívás a sorosított, cache-elt úton megy (lib/fuvarozas/
// kulso-hivas.ts), ezért a lap ismételt megnyitása nem terheli a HU-GO-t.

import { requireViewPermission } from "@/lib/auth/require-permission";
import { query } from "@/lib/db";
import { kozosKalkulacio, type KozosBemenet, type KozosEredmeny } from "@/lib/fuvarozas2/kalkulator-szamitas";

export type { KozosBemenet, KozosEredmeny } from "@/lib/fuvarozas2/kalkulator-szamitas";

export async function szamoljKozosKalkulaciot(bemenet: KozosBemenet): Promise<{ ok: true; eredmeny: KozosEredmeny } | { ok: false; hiba: string }> {
  await requireViewPermission("fuvarozas");
  return kozosKalkulacio(bemenet);
}

/** A Kalkulátor kocsi-választójához. */
export async function getKalkulatorJarmuvek(): Promise<{ kod: string; cimke: string }[]> {
  await requireViewPermission("fuvarozas");
  return query<{ kod: string; cimke: string }>(`select kod, cimke from fuvar_jarmuvek where aktiv order by id`);
}
