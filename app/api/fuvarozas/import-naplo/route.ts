import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiViewGuard } from "@/lib/auth/api-guard";
import { importNaplo } from "@/lib/fuvarozas/import/naplo";

/**
 * A Drive-import naplója — mi történt az egyes iratokkal.
 *
 * GET /api/fuvarozas/import-naplo
 *   A napló sorai, a legproblémásabbak elöl (hiba -> elutasítva ->
 *   ellenőrizendő -> a többi). A nyers szöveg NÉLKÜL, csak a hosszával.
 *
 * GET /api/fuvarozas/import-naplo?fileId=<Drive fájl ID>
 *   EGY irat NYERS SZÖVEGE — pontosan az, amit a pdf-parse élesben
 *   visszaadott. Ez a végpont a rendszer "földi igazsága": egy értelmező
 *   mintáit KIZÁRÓLAG ilyen szövegre szabad írni. Egy korábbi nekifutás
 *   azért dőlt romba, mert a minták a Google Drive saját
 *   szöveg-megjelenítéséhez készültek, élesben viszont más sortöréssel
 *   érkezik a szöveg — a tesztek zöldek voltak, a feldolgozó mégis minden
 *   iratra némán nemet mondott.
 */
export async function GET(request: Request) {
  const tiltas = await apiViewGuard("fuvarozas");
  if (tiltas) return tiltas;

  const fileId = new URL(request.url).searchParams.get("fileId");
  if (fileId) {
    const sorok = await query<{ fajlnev: string | null; nyers_szoveg: string | null }>(
      `select fajlnev, nyers_szoveg from fuvar_import_naplo where drive_file_id = $1`,
      [fileId]
    );
    if (sorok.length === 0) {
      return NextResponse.json({ hiba: "Nincs ilyen fájl a naplóban." }, { status: 404 });
    }
    return NextResponse.json({
      fajlnev: sorok[0].fajlnev,
      nyersSzoveg: sorok[0].nyers_szoveg,
    });
  }

  return NextResponse.json({ naplo: await importNaplo() });
}
