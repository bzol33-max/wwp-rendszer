import { NextResponse } from "next/server";
import { vegrehajtDriveSync } from "@/lib/fuvarozas/drive-sync-core";
import { futtatRendszerkent } from "@/lib/auth/system-context";

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
 * végpont 503-mal tiltja le magát.
 */
export async function POST(req: Request) {
  const titok = process.env.DRIVE_SYNC_SECRET;
  if (!titok) {
    // A hívás rendszerjogon fut, ezért a titok hiánya nem eshet vissza
    // hitelesítetlen futásra — akkor bárki, aki ismeri az URL-t, fuvarokat
    // rögzíthetne.
    return NextResponse.json(
      { hiba: "A DRIVE_SYNC_SECRET nincs beállítva, a végpont le van tiltva." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${titok}`) {
    return NextResponse.json({ hiba: "Érvénytelen vagy hiányzó Authorization fejléc." }, { status: 401 });
  }

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
