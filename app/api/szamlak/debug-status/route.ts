import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const recent = await query(
    `select id::text, szamlaszam, vevo_nev, brutto, penznem, fizetve, fizetve_datum::text
     from szamla
     where fizetve = true
       and fizetve_datum is not null
       and fizetve_datum > now() - interval '15 minutes'
     order by fizetve_datum desc
     limit 10`
  );
  return NextResponse.json({ recent });
}
