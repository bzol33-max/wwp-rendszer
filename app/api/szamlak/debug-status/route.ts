import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES debug-végpont — csak darabszámokat ad vissza, semmilyen
// kulcsot/titkot nem tartalmaz. Az ellenőrzés után törlésre kerül.
export async function GET() {
  const osszes = await query<{ n: number }>(`select count(*)::int as n from szamla`);
  const fizetve = await query<{ n: number }>(`select count(*)::int as n from szamla where fizetve = true`);
  const nyitott = await query<{ n: number }>(`select count(*)::int as n from szamla where fizetve = false`);
  return NextResponse.json({
    osszes: osszes[0]?.n ?? 0,
    fizetve: fizetve[0]?.n ?? 0,
    nyitott: nyitott[0]?.n ?? 0,
  });
}
