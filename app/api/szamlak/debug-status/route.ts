import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const minta = await query(
    `select id::text, megrendelo, jarmu, sofor
     from fuvar_megbizasok
     where jarmu is not null
     order by id desc
     limit 5`
  );

  const frissitve = await query(
    `update fuvar_megbizasok
       set jarmu = 'Gergő — AOPU-427/AOTY-474', sofor = 'Gergő'
     where id in (16, 19)
     returning id::text, megrendelo, pozicioszam, jarmu, sofor`
  );

  return NextResponse.json({ minta, frissitve });
}
