import { NextResponse } from "next/server";

// A Content-Security-Policy-Report-Only jelentései (audit 2026-10-04, SEC-9).
// A szabály még nem tilt semmit — a böngésző csak jelzi ide, ha egy oldal a
// szabályon kívüli forrást töltene be. A Railway-naplóból kiderül, mit kell
// még engedni, mielőtt a szabály élesedik. Hitelesítés nélküli (a böngésző
// süti nélkül is küldheti), ezért a jelentés méretét levágjuk, és csak
// naplózunk, semmit nem tárolunk.
export async function POST(req: Request) {
  const szoveg = (await req.text().catch(() => "")).slice(0, 2000);
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
