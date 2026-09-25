import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { veszTorzset } from "@/lib/fuvarozas2/levelek-core";

/**
 * Egy megbízás-levél teljes szövege: { gmailMessageId, torzs }. A figyelő
 * csak azokét küldi, amiket a /kert `torzs` listája kér (megbízásnak
 * osztályozott levelek). A beolvasás a csatolmánnyal együtt olvassa — lásd
 * lib/fuvarozas/drive-sync-core.ts (kiseroLevelSzovege, levelSzovegPotlasa).
 */
export async function POST(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  let body: { gmailMessageId?: string; torzs?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }
  if (!body.gmailMessageId || typeof body.torzs !== "string") {
    return NextResponse.json({ hiba: "gmailMessageId és torzs kötelező." }, { status: 400 });
  }
  try {
    const eredmeny = await futtatRendszerkent("gmail-figyelo", () => veszTorzset(body.gmailMessageId!, body.torzs!));
    return NextResponse.json(eredmeny, { status: eredmeny.ok ? 200 : 409 });
  } catch (err) {
    console.error("[gmail-torzs] mentés nem sikerült:", err);
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
