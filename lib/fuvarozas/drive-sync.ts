"use server";

// Vékony "use server" burok a lib/fuvarozas/drive-sync-core.ts köré — ezt
// hívja közvetlenül a "Bér fuvarok — folyamatban" lista "Frissítés" gombja
// (lásd components/fuvarozas/megbizasok.tsx), ugyanúgy szerver-akcióként,
// mint a modul többi addFuvar/approveFuvar hívása. A tényleges Drive/
// OpenRouter-logika a core modulban van, mert egy "use server" fájl
// kizárólag async függvényeket exportálhat.

import { vegrehajtDriveSync } from "@/lib/fuvarozas/drive-sync-core";
import type { DriveSyncEredmeny } from "@/lib/fuvarozas/drive-sync-core";

export async function frissitsDriveBol(): Promise<DriveSyncEredmeny> {
  return vegrehajtDriveSync();
}
