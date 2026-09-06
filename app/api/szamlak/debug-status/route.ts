import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query(
    `select id::text, tipus, to_char(datum,'YYYY-MM-DD') as datum, megrendelo, pozicioszam,
            felrako, lerako, jarmu, sofor, alvallalkozo, forras, megjegyzes
     from fuvar_megbizasok
     where (megrendelo ilike '%well pack%' or pozicioszam ilike '%196%aug%'
            or pozicioszam ilike '%R16/2279/2683%')
     order by datum desc
     limit 10`
  );
  return NextResponse.json({ rows });
}
