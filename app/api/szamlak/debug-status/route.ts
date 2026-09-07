import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query(
    `select km.id, s.name as site, t.name as type, km.direction, km.qty, km.partner, km.created_at
     from keszlet_movements km
     join sites s on s.id = km.site_id
     join pallet_types t on t.id = km.type_id
     order by km.created_at`
  );
  return NextResponse.json({ count: rows.length, rows });
}
