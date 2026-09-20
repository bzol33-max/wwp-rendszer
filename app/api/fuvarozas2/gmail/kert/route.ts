import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { kertCsatolmanyok, jelezFutast } from "@/lib/fuvarozas2/levelek-core";

/** Mely levelek csatolmányát várjuk — a figyelő ezzel kezdi a körét. */
export async function GET(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  try {
    const kert = await futtatRendszerkent("gmail-figyelo", async () => {
      await jelezFutast({ utolso_eletjel: new Date().toISOString() });
      return kertCsatolmanyok();
    });
    return NextResponse.json({ kert });
  } catch (err) {
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
