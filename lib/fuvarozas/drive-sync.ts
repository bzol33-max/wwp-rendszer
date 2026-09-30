"use server";

// Vékony "use server" burok a lib/fuvarozas/drive-sync-core.ts köré — ezt
// hívja a Megbízások „Bérfuvarok” oszlopának „Frissítés” gombja
// (components/fuvarozas2/berfuvar.tsx) és a régi lista (components/fuvarozas/megbizasok.tsx), ugyanúgy szerver-akcióként,
// mint a modul többi addFuvar/approveFuvar hívása. A tényleges Drive/
// OpenRouter-logika a core modulban van, mert egy "use server" fájl
// kizárólag async függvényeket exportálhat.

import { requireEditPermission } from "@/lib/auth/require-permission";
import { vegrehajtDriveSync } from "@/lib/fuvarozas/drive-sync-core";
import type { DriveSyncEredmeny } from "@/lib/fuvarozas/drive-sync-core";

// Jogosultság (2026-09-30): eddig nem volt, így bármelyik bejelentkezett
// felhasználó indíthatott Drive-szinkront (OpenRouter-költséggel). Az óránkénti
// automatika nem ezt hívja, hanem közvetlenül a core-t (app/api/fuvarozas/drive-sync).
export async function frissitsDriveBol(): Promise<DriveSyncEredmeny> {
  await requireEditPermission("fuvarozas");
  return vegrehajtDriveSync();
}
