import { NextResponse } from "next/server";

/**
 * Közös Bearer-titok ellenőrzés a Drive-import HTTP végpontjaihoz
 * (/api/fuvarozas/drive-sync, drive-import, drive-frissites).
 *
 * MIÉRT VAN EZ ITT? A drive-sync végpont eddig is titokkal védett volt, a
 * drive-import és a drive-frissites viszont NEM: bárki, aki ismerte az
 * URL-t, hitelesítés nélkül új fuvart hozhatott létre, illetve id alapján
 * felülírhatta a fuvardíjat, a számlaszámot, a postázva jelölőt és a
 * postázási címet (Fuvarozás 2 átállás-ellenőrzés, B5 tétel). A két végpontot
 * eredetileg egy ütemezett Claude-feladat hívta; azt a lib/fuvarozas/
 * drive-sync-core.ts váltotta ki, így ismert külső hívójuk ma nincs — de a
 * kód marad, ugyanazzal a titokkal védve, mint a drive-sync.
 *
 * A DRIVE_SYNC_SECRET környezeti változó KÖTELEZŐ: ha hiányzik, a végpont
 * 503-mal letiltja magát (a titok hiánya nem eshet vissza hitelesítetlen
 * futásra); rossz vagy hiányzó "Authorization: Bearer <titok>" fejléc → 401.
 *
 * Nem "use server" fájl — sima segédmodul, route handlerek hívják.
 */
export function requireDriveSyncSecret(req: Request): NextResponse | null {
  return requireBearerSecret(req, "DRIVE_SYNC_SECRET");
}

/**
 * Ugyanez tetszőleges megosztott titokhoz (pl. GMAIL_FIGYELO_SECRET a
 * felhasználó Gmail-fiókjában futó Apps Script-hez — lásd
 * docs/gmail-fuvar-figyelo.gs). A titok jöhet az Authorization fejlécben
 * vagy — ha a hívó ezt kéri (`queryEngedett`) — a `token` query
 * paraméterben. A Drive-végpontokon a query NEM engedett: az URL a
 * naplókba is bekerülhet.
 */
export function requireBearerSecret(req: Request, envNev: string, queryEngedett = false): NextResponse | null {
  const titok = process.env[envNev];
  if (!titok) {
    return NextResponse.json(
      { hiba: `A ${envNev} nincs beállítva, a végpont le van tiltva.` },
      { status: 503 }
    );
  }
  const fejlecOk = req.headers.get("authorization") === `Bearer ${titok}`;
  let queryOk = false;
  if (queryEngedett) {
    try {
      queryOk = new URL(req.url).searchParams.get("token") === titok;
    } catch {
      queryOk = false;
    }
  }
  if (!fejlecOk && !queryOk) {
    return NextResponse.json({ hiba: "Érvénytelen vagy hiányzó Authorization fejléc." }, { status: 401 });
  }
  return null;
}
