import { NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/fuvarozas/drive-sync-guard";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { veszCsatolmanyt, veszCsatolmanyDriveId } from "@/lib/fuvarozas2/levelek-core";

/** Legnagyobb elfogadott csatolmány (base64 előtt) — a megbízás-PDF-ek 1 MB alatt vannak. */
const MAX_BYTE = 15 * 1024 * 1024;

/**
 * Egy kért levél csatolmánya. Két elfogadott body:
 *
 *   { gmailMessageId, driveFileId, driveUrl? }   — ELSŐDLEGES: a figyelő már
 *     feltöltötte a fájlt a Drive figyelt mappájába a saját kvótájából, itt
 *     csak rögzítjük.
 *   { gmailMessageId, nev, mimeType, base64 }    — tartalék: a szerver tölti
 *     fel. A service accountnak nincs tárhelykvótája a személyes My Drive-ban
 *     lévő mappához, ezért ez 500-nal elszállhat (2026-09-20).
 *
 * A megbízás-irat mindkét úton a Drive figyelt mappájába kerül, onnan a
 * drive-sync importálja — nincs új import-út.
 */
export async function POST(req: Request) {
  const tiltas = requireBearerSecret(req, "GMAIL_FIGYELO_SECRET", true);
  if (tiltas) return tiltas;
  let body: {
    gmailMessageId?: string;
    nev?: string;
    mimeType?: string;
    base64?: string;
    driveFileId?: string;
    driveUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hiba: "Érvénytelen JSON body." }, { status: 400 });
  }
  if (!body.gmailMessageId) {
    return NextResponse.json({ hiba: "gmailMessageId kötelező." }, { status: 400 });
  }
  // Elsődleges út: a figyelő már feltöltötte — nincs Drive-írás a szerveren.
  if (body.driveFileId) {
    try {
      const eredmeny = await futtatRendszerkent("gmail-figyelo", () =>
        veszCsatolmanyDriveId(body.gmailMessageId!, { driveFileId: body.driveFileId!, driveUrl: body.driveUrl ?? null })
      );
      return NextResponse.json(eredmeny, { status: eredmeny.ok ? 200 : 409 });
    } catch (err) {
      console.error("[gmail-csatolmany] Drive-azonosító rögzítése nem sikerült:", err);
      return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
    }
  }
  if (!body.nev || !body.base64) {
    return NextResponse.json({ hiba: "driveFileId, vagy nev és base64 kötelező." }, { status: 400 });
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
    // NAPLÓZNI KELL: 2026-09-20-ig ez az ág némán 500-at adott, ezért három
    // hétig nem derült ki, hogy a service account nem tud a Drive-ba írni.
    console.error("[gmail-csatolmany] Drive-feltöltés nem sikerült:", err);
    return NextResponse.json({ hiba: err instanceof Error ? err.message : "ismeretlen hiba" }, { status: 500 });
  }
}
