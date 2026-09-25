import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { kertCsatolmanyok, kertTorzsek, jelezFutast } from "@/lib/fuvarozas2/levelek-core";

/** Mely levelek csatolmányát és szövegét várjuk — a figyelő ezzel kezdi a körét. */
export async function GET(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  try {
    const { kert, torzs } = await futtatRendszerkent("gmail-figyelo", async () => {
      await jelezFutast({ utolso_eletjel: new Date().toISOString() });
      return { kert: await kertCsatolmanyok(), torzs: await kertTorzsek() };
    });
    // `torzs`: mely megbízás-levelek teljes szövegét kérjük (a figyelő
    // 2026-09-25-i változata küldi; a régebbi figyelő nem nézi ezt a mezőt).
    return NextResponse.json({ kert, torzs });
  } catch (err) {
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
