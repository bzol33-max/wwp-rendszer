import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES debug-végpont — a "rontott"/sztornó számlák felderítéséhez:
// keresünk a nyers XML-ekben sztornóra utaló szövegeket, illetve
// negatív/nulla összegű vagy duplikált (azonos rendelésszámú) tételeket.
// Semmilyen kulcsot/titkot nem ad vissza, csak üzleti adatot, ami már
// úgyis megjelenik a felületen. Az ellenőrzés után törlésre kerül.
export async function GET() {
  const sztornoSzoveg = await query<{ szamlaszam: string; vevo_nev: string; brutto: number }>(
    `select szamlaszam, vevo_nev, brutto
     from szamla
     where raw_xml ilike '%sztorn%' or raw_xml ilike '%rontott%' or raw_xml ilike '%storno%'
     order by szamlaszam`
  );
  const negativOsszeg = await query<{ szamlaszam: string; vevo_nev: string; brutto: number }>(
    `select szamlaszam, vevo_nev, brutto from szamla where brutto <= 0 order by szamlaszam`
  );
  const duplikaltRendelesszam = await query<{ rendelesszam: string; darab: number; szamlaszamok: string[] }>(
    `select rendelesszam, count(*)::int as darab, array_agg(szamlaszam order by szamlaszam) as szamlaszamok
     from szamla
     where rendelesszam is not null and rendelesszam <> ''
     group by rendelesszam
     having count(*) > 1
     order by rendelesszam`
  );

  return NextResponse.json({
    sztornoSzovegTalalat: sztornoSzoveg,
    negativVagyNullaOsszeg: negativOsszeg,
    duplikaltRendelesszamok: duplikaltRendelesszam,
  });
}
