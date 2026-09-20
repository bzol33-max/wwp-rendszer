import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { veszLeveleket, type BeerkezoLevel } from "@/lib/fuvarozas2/levelek-core";

/**
 * A Gmail-figyelő (docs/gmail-fuvar-figyelo.gs, a felhasználó Google
 * fiókjában fut) ide küldi az új levelek METAADATÁT. Törzs nem jön, csak
 * feladó, tárgy, snippet, csatolmánynevek — a magánlevél tartalma sosem
 * hagyja el a postafiókot (S17).
 *
 * Hitelesítés: GMAIL_FIGYELO_SECRET (Bearer fejléc vagy ?token=).
 */
export async function POST(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  let body: { levelek?: BeerkezoLevel[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }
  const levelek = (body.levelek ?? []).filter((l) => l && typeof l.gmailMessageId === "string" && typeof l.felado === "string");
  if (levelek.length > 200) return NextResponse.json({ hiba: "Egyszerre legfeljebb 200 levél." }, { status: 400 });
  try {
    const eredmeny = await futtatRendszerkent("gmail-figyelo", () => veszLeveleket(levelek));
    return NextResponse.json(eredmeny);
  } catch (err) {
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
