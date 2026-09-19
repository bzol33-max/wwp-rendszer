import { NextResponse } from "next/server";
import { vegrehajtDriveSync } from "@/lib/fuvarozas/drive-sync-core";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { requireDriveSyncSecret } from "@/lib/fuvarozas/drive-sync-guard";

/**
 * A Google Drive-fuvarmegbízás-import önálló, óránkénti belépési pontja —
 * ezt hívja egy külön Railway cron szolgáltatás (nem Claude-feladat többé,
 * lásd lib/fuvarozas/drive-sync-core.ts). Ugyanezt a logikát hívja a "Bér
 * fuvarok — folyamatban" lista "Frissítés" gombja is, közvetlenül (lib/
 * fuvarozas/drive-sync.ts szerver-akción keresztül) — ez a HTTP végpont
 * csak a Railway-en kívülről (a cron szolgáltatásból) induló hívásokhoz kell.
 *
 * A DRIVE_SYNC_SECRET környezeti változó KÖTELEZŐ: csak az
 * "Authorization: Bearer <titok>" fejléccel érkező kérést szolgálja ki,
 * enélkül bárki, aki ismeri az URL-t, tudna Drive-/OpenRouter-hívásokat (és
 * ezzel költséget) kiváltani, sőt — mivel a törzs rendszerjogon fut, lásd
 * futtatRendszerkent — fuvarokat is rögzíthetne. Ha a változó hiányzik, a
 * végpont 503-mal tiltja le magát. Az ellenőrzés a közös
 * lib/fuvarozas/drive-sync-guard.ts-ben van (a drive-import és a
 * drive-frissites végpont is ugyanazt használja).
 */
export async function POST(req: Request) {
  const tiltas = requireDriveSyncSecret(req);
  if (tiltas) return tiltas;

  try {
    const eredmeny = await futtatRendszerkent("drive-sync-cron", vegrehajtDriveSync);
    return NextResponse.json(eredmeny);
  } catch (err) {
    return NextResponse.json(
      { hiba: err instanceof Error ? err.message : "ismeretlen hiba" },
      { status: 500 }
    );
  }
}
