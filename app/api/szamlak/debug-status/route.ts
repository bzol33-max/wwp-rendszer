import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const osszesen = await query(
    `select forras, count(*)::int as darab from fuvar_megbizasok group by forras`
  );

  const sorok = await query(
    `select id::text, tipus, date, megrendelo, forras, ellenorzott, dokumentum_url, created_at::text
     from fuvar_megbizasok
     order by created_at desc
     limit 100`
  );

  const hajduKriki = await query(
    `select id::text, tipus, date, megrendelo, forras, ellenorzott, dokumentum_url
     from fuvar_megbizasok
     where megrendelo ilike '%hajdu%' or megrendelo ilike '%hajdú%' or megrendelo ilike '%kriki%'`
  );

  return NextResponse.json({ osszesen, sorok, hajduKriki });
}
