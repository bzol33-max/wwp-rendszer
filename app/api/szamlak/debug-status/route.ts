import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query(`select name, default_price from pallet_types order by sort_order, id`);
  return NextResponse.json({ rows });
}
