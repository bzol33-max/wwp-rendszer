import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES debug-végpont — csak darabszámokat és állapotot ad vissza,
// semmilyen kulcsot/titkot nem tartalmaz. A vizsgálat után törlésre kerül.
export async function GET() {
  const szamlaSorok = await query<{ n: number }>(`select count(*)::int as n from szamla`);
  const pendingSorok = await query<{ n: number }>(
    `select count(*)::int as n from szamlak_poll_pending where feladva = false`
  );
  const allapotSorok = await query<{ elotag: string; ev: number; utolso_sorszam: number; utolso_futas_at: string }>(
    `select elotag, ev, utolso_sorszam, utolso_futas_at::text from szamlak_poll_allapot order by elotag`
  );

  return NextResponse.json({
    szamlaDarab: szamlaSorok[0]?.n ?? 0,
    pendingSzam: pendingSorok[0]?.n ?? 0,
    elotagAllapotok: allapotSorok,
  });
}
