import { NextResponse } from "next/server";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { getMaiSajatFuvarok } from "@/lib/fuvarozas/megbizasok";
import { getVehicleTrips } from "@/lib/fuvarozas/ecofleet";

// IDEIGLENES diagnosztikai végpont — az idővonal/megbízás hibakereséséhez.
// Törlésre kerül, amint a hiba beazonosítva.

export async function GET() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" });
  const napISO = fmt.format(now);

  const napKezdet = new Date(`${napISO}T00:00:00`);
  const nmzTripsRaw = await getVehicleTrips("369485", napKezdet, now).catch((e) => ({ error: String(e) }));

  const maiFuvarok = await getMaiSajatFuvarok(napISO).catch((e) => ({ error: String(e) }));
  const idovonalak = await getIdovonalak().catch((e) => ({ error: String(e) }));

  return NextResponse.json({
    serverNowUtc: now.toISOString(),
    napISO,
    nmzTripsRaw,
    maiFuvarok,
    idovonalak,
  });
}
