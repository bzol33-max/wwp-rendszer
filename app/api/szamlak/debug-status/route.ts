import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES debug-végpont — csak darabszámokat és állapotot ad vissza,
// semmilyen kulcsot/titkot nem tartalmaz. A vizsgálat után törlésre kerül.
export async function GET() {
  const szamlaSorok = await query<{ n: number; elso: string | null; utolso: string | null }>(
    `select count(*)::int as n, min(szamlaszam) as elso, max(szamlaszam) as utolso from szamla`
  );
  const pendingSorok = await query<{ n: number }>(
    `select count(*)::int as n from szamlak_poll_pending where feladva = false`
  );
  const pendingLista = await query<{ szamlaszam: string; probalkozasok: number; eloszor_probalt_at: string }>(
    `select szamlaszam, probalkozasok, eloszor_probalt_at from szamlak_poll_pending where feladva = false order by szamlaszam`
  );
  const allapotSor = await query<{ ev: number; utolso_sorszam: number; utolso_futas_at: string }>(
    `select ev, utolso_sorszam, utolso_futas_at from szamlak_poll_allapot where id = 1`
  );

  return NextResponse.json({
    szamla: szamlaSorok[0],
    pendingSzam: pendingSorok[0]?.n ?? 0,
    pendingLista,
    allapot: allapotSor[0],
  });
}
