import { NextResponse } from "next/server";

// A Content-Security-Policy-Report-Only jelentései (audit 2026-10-04, SEC-9).
// A szabály még nem tilt semmit — a böngésző csak jelzi ide, ha egy oldal a
// szabályon kívüli forrást töltene be. A Railway-naplóból kiderül, mit kell
// még engedni, mielőtt a szabály élesedik. Hitelesítés nélküli (a böngésző
// süti nélkül is küldheti), ezért a jelentés méretét levágjuk, és csak
// naplózunk, semmit nem tárolunk.
export async function POST(req: Request) {
  const szoveg = await elejeSzovegkent(req, 2000);
  try {
    const adat = JSON.parse(szoveg);
    const j = adat["csp-report"] ?? adat[0]?.body ?? adat;
    console.warn(
      `[csp] ${j["violated-directive"] ?? j.effectiveDirective ?? "?"} ← ${j["blocked-uri"] ?? j.blockedURL ?? "?"} (oldal: ${j["document-uri"] ?? j.documentURL ?? "?"})`
    );
  } catch {
    console.warn("[csp] olvashatatlan jelentés");
  }
  return new NextResponse(null, { status: 204 });
}

// Csak a body első `max` bájtját olvassa be, a többit el sem fogadja — a
// req.text() a teljes (akármekkora) body-t memóriába húzná (audit A4).
async function elejeSzovegkent(req: Request, max: number): Promise<string> {
  if (!req.body) return "";
  const olvaso = req.body.getReader();
  const darabok: Uint8Array[] = [];
  let hossz = 0;
  try {
    while (hossz < max) {
      const { done, value } = await olvaso.read();
      if (done) break;
      darabok.push(value);
      hossz += value.length;
    }
  } catch {
    return "";
  } finally {
    olvaso.cancel().catch(() => {});
  }
  const egyben = new Uint8Array(hossz);
  let i = 0;
  for (const d of darabok) {
    egyben.set(d, i);
    i += d.length;
  }
  return new TextDecoder().decode(egyben).slice(0, max);
}
