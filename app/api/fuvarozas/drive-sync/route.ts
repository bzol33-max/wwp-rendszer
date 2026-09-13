import { NextResponse } from "next/server";
import { vegrehajtDriveSync } from "@/lib/fuvarozas/drive-sync-core";

/**
 * A Google Drive-fuvarmegbízás-import önálló, óránkénti belépési pontja —
 * ezt hívja egy külön Railway cron szolgáltatás (nem Claude-feladat többé,
 * lásd lib/fuvarozas/drive-sync-core.ts). Ugyanezt a logikát hívja a "Bér
 * fuvarok — folyamatban" lista "Frissítés" gombja is, közvetlenül (lib/
 * fuvarozas/drive-sync.ts szerver-akción keresztül) — ez a HTTP végpont
 * csak a Railway-en kívülről (a cron szolgáltatásból) induló hívásokhoz kell.
 *
 * Ha be van állítva a DRIVE_SYNC_SECRET környezeti változó, csak az
 * "Authorization: Bearer <titok>" fejléccel érkező kérést szolgálja ki —
 * enélkül bárki, aki ismeri az URL-t, tudna Drive-/OpenRouter-hívásokat (és
 * ezzel költséget) kiváltani. Ha a változó nincs beállítva, a végpont
 * (a többi, már meglévő /api/fuvarozas/drive-* végponttal konzisztensen)
 * hitelesítés nélkül fut — ERŐSEN AJÁNLOTT beállítani.
 */
export async function POST(req: Request) {
  const titok = process.env.DRIVE_SYNC_SECRET;
  if (titok) {
    const authFejlec = req.headers.get("authorization");
    if (authFejlec !== `Bearer ${titok}`) {
      return NextResponse.json({ hiba: "Érvénytelen vagy hiányzó Authorization fejléc." }, { status: 401 });
    }
  }

  try {
    const eredmeny = await vegrehajtDriveSync();
    return NextResponse.json(eredmeny);
  } catch (err) {
    return NextResponse.json(
      { hiba: err instanceof Error ? err.message : "ismeretlen hiba" },
      { status: 500 }
    );
  }
}
