import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { szinkronizalSzamlaSzamokat } from "@/lib/fuvarozas/megbizasok";

export async function GET() {
  const talalatDarab = await szinkronizalSzamlaSzamokat();
  const minta = await query(
    `select id::text, megrendelo, pozicioszam, szamla_szam, postazva, postazva_at::text
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
     order by datum desc
     limit 15`
  );
  return NextResponse.json({ talalatDarab, minta });
}
