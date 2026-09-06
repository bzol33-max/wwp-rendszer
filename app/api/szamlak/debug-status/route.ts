import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const fuvarSzamlaMinta = await query(
    `select id::text, szamlaszam, vevo_nev, rendelesszam, brutto, penznem,
            to_char(kiallitas_datum,'YYYY-MM-DD') as kiallitas_datum, tetelek_szoveg
     from szamla
     where kategoria = 'fuvar'
     order by kiallitas_datum desc
     limit 15`
  );
  const rendelesszamStat = await query(
    `select count(*)::int as osszes, count(rendelesszam)::int as van_rendelesszam
     from szamla where kategoria = 'fuvar'`
  );
  const berFuvarMinta = await query(
    `select id::text, megrendelo, pozicioszam, pozicioszam_nincs, fuvardij, szamla_szam, postazva,
            to_char(datum,'YYYY-MM-DD') as datum
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
     order by datum desc
     limit 15`
  );
  return NextResponse.json({ fuvarSzamlaMinta, rendelesszamStat, berFuvarMinta });
}
