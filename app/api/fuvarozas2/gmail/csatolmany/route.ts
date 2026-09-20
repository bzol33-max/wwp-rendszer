import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { veszCsatolmanyt } from "@/lib/fuvarozas2/levelek-core";

/** Legnagyobb elfogadott csatolmány (base64 előtt) — a megbízás-PDF-ek 1 MB alatt vannak. */
const MAX_BYTE = 15 * 1024 * 1024;

/**
 * Egy kért levél csatolmánya. Body: { gmailMessageId, nev, mimeType, base64 }.
 * A megbízás-irat a Drive figyelt mappájába kerül, onnan a drive-sync
 * importálja — nincs új import-út.
 */
export async function POST(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  let body: { gmailMessageId?: string; nev?: string; mimeType?: string; base64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }
  if (!body.gmailMessageId || !body.nev || !body.base64) {
    return NextResponse.json({ hiba: "gmailMessageId, nev és base64 kötelező." }, { status: 400 });
  }
  const tartalom = Buffer.from(body.base64, "base64");
  if (tartalom.length === 0) return NextResponse.json({ hiba: "Üres csatolmány." }, { status: 400 });
  if (tartalom.length > MAX_BYTE) return NextResponse.json({ hiba: "Túl nagy csatolmány." }, { status: 413 });
  try {
    const eredmeny = await futtatRendszerkent("gmail-figyelo", () =>
      veszCsatolmanyt(body.gmailMessageId!, { nev: body.nev!, mimeType: body.mimeType ?? "application/pdf", tartalom })
    );
    return NextResponse.json(eredmeny, { status: eredmeny.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
