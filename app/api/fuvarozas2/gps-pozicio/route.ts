import { NextResponse } from "next/server";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getFleetLastPositions, parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";

/**
 * A kamionok pillanatnyi helye az Útvonaltervező (public/utvonaltervezo.html)
 * térképéhez. Csak olvas: a meglévő, 30 mp-ig gyorsítótárazott
 * `getFleetLastPositions()`-t adja tovább, új Ecofleet-hívást nem vezet be,
 * és az API-kulcs a szerveren marad.
 *
 * Jog: a teljes "fuvarozas" modul megtekintése kell hozzá — a sofőri
 * "fuvarozas_sajat" jog nem elég, a flotta helyét a sofőr nem látja.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireViewPermission("fuvarozas");
  } catch (err) {
    // A requireSession átirányítása (nincs munkamenet) menjen tovább a Nextnek.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return NextResponse.json({ hiba: "Nincs jogosultságod a flotta helyéhez." }, { status: 403 });
  }
  try {
    const poziciok = await getFleetLastPositions();
    return NextResponse.json(
      poziciok.map((p) => ({
        rendszam: p.plate || p.name,
        lat: p.latitude,
        lon: p.longitude,
        sebesseg: p.speed,
        irany: p.direction,
        motor: p.engineOn,
        ido: parseEcofleetTimestamp(p.timestamp)?.toISOString() ?? null,
      })),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // A hiba részletei (URL, kulcs) nem mennek ki a kliensnek.
    return NextResponse.json({ hiba: "Az Ecofleet most nem érhető el." }, { status: 502 });
  }
}
