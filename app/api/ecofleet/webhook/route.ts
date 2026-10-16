import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { webhookKulcs } from "@/lib/jarmu-telemetria/webhook";
import { webhookMent } from "@/lib/jarmu-telemetria/repo";

// Ecofleet webhook fogadó (docs/ecofleet-telemetria-terv.md 3. pont).
// Az /api útvonalak NINCSENEK a bejelentkezés-proxy mögött (proxy.ts matcher),
// ezért itt a `?token=` az EGYETLEN hitelesítés: időállandó összevetés az
// ECOFLEET_WEBHOOK_TOKEN-nel. A tokent és a teljes URL-t soha nem naplózzuk.
// Csak eltárol (idempotensen), feldolgozás később.

const MAX_BODY_BAJT = 256 * 1024;

function tokenRendben(kapott: string | null, vart: string): boolean {
  if (!kapott) return false;
  const a = Buffer.from(kapott, "utf8");
  const b = Buffer.from(vart, "utf8");
  // Hossz-eltérésnél is fusson le egy összevetés, hogy az időzítés ne áruljon el sokat.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

class TulNagyBody extends Error {}

/** A body legfeljebb MAX_BODY_BAJT bájtig, utf8 szövegként; nagyobb → TulNagyBody. */
async function korlatozottBody(req: Request): Promise<string> {
  const jelzett = Number(req.headers.get("content-length"));
  if (Number.isFinite(jelzett) && jelzett > MAX_BODY_BAJT) throw new TulNagyBody();
  if (!req.body) return "";
  const olvaso = req.body.getReader();
  const darabok: Uint8Array[] = [];
  let osszes = 0;
  for (;;) {
    const { done, value } = await olvaso.read();
    if (done) break;
    osszes += value.byteLength;
    if (osszes > MAX_BODY_BAJT) {
      await olvaso.cancel().catch(() => {});
      throw new TulNagyBody();
    }
    darabok.push(value);
  }
  return Buffer.concat(darabok).toString("utf8");
}

function payloadErtelmez(nyers: string, tipus: string): unknown {
  if (tipus.includes("application/x-www-form-urlencoded")) {
    const obj: Record<string, string | string[]> = {};
    for (const [k, v] of new URLSearchParams(nyers)) {
      const elozo = obj[k];
      obj[k] = elozo === undefined ? v : Array.isArray(elozo) ? [...elozo, v] : [elozo, v];
    }
    return obj;
  }
  if (!nyers.trim()) return {};
  try {
    return JSON.parse(nyers);
  } catch {
    // Nem JSON és nem form: nyers szövegként tároljuk, hogy semmi ne vesszen el.
    return { nyers };
  }
}

export async function POST(req: Request) {
  const vart = process.env.ECOFLEET_WEBHOOK_TOKEN;
  if (!vart) {
    return NextResponse.json({ ok: false, hiba: "A webhook nincs beállítva." }, { status: 503 });
  }
  const token = new URL(req.url).searchParams.get("token");
  if (!tokenRendben(token, vart)) {
    return NextResponse.json({ ok: false, hiba: "Nincs jogosultság." }, { status: 401 });
  }

  let nyers: string;
  try {
    nyers = await korlatozottBody(req);
  } catch (e) {
    if (e instanceof TulNagyBody) {
      return NextResponse.json({ ok: false, hiba: "Túl nagy kérés." }, { status: 413 });
    }
    return NextResponse.json({ ok: false, hiba: "A kérés nem olvasható." }, { status: 400 });
  }

  const payload = payloadErtelmez(nyers, (req.headers.get("content-type") ?? "").toLowerCase());
  const kulcs = webhookKulcs(payload, nyers);
  try {
    const eredmeny = await webhookMent(kulcs, payload);
    return NextResponse.json({ ok: true, uj: eredmeny === "uj" });
  } catch (e) {
    console.error("[ecofleet-webhook] mentés sikertelen:", e instanceof Error ? e.message : "ismeretlen hiba");
    return NextResponse.json({ ok: false, hiba: "Mentés sikertelen." }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, hiba: "Csak POST." }, { status: 405, headers: { Allow: "POST" } });
}
