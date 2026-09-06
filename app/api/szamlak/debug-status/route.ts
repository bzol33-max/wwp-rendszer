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

  const erintettSzamok = [
    "WLLWR-2026-27", "WLLWR-2026-53", "WLLWR-2026-72", "WLLWR-2026-120", "WLLWR-2026-137",
    "WLLWR-2026-111", "WLLWR-2026-57", "WLLWR-2026-74", "WLLWR-2026-121", "WLLWR-2026-138",
    "WLLWR-2026-41", "WLLWR-2026-73", "WLLWR-2026-139", "WLLWR-2026-13", "WLLWR-2026-68",
    "WLLWR-2026-46", "WLLWR-2026-60", "WLLWR-2026-49", "WLLWR-2026-50",
    "WLLWR-2026-107", "WLLWR-2026-86", "WLLWR-2026-143", "WLLWR-2026-149",
  ];
  const reszletek = await query<{
    szamlaszam: string;
    vevo_nev: string;
    rendelesszam: string | null;
    tetelek_szoveg: string;
    brutto: number;
    fizetve: boolean;
    kiallitas_datum: string;
  }>(
    `select szamlaszam, vevo_nev, rendelesszam, tetelek_szoveg, brutto, fizetve, kiallitas_datum::text
     from szamla
     where szamlaszam = any($1)
     order by rendelesszam, kiallitas_datum, szamlaszam`,
    [erintettSzamok]
  );

  const jupiker = await query<{ szamlaszam: string; brutto: number; kiallitas_datum: string; fizetve: boolean }>(
    `select szamlaszam, brutto, kiallitas_datum::text, fizetve from szamla where vevo_nev ilike '%jupiker%' order by kiallitas_datum`
  );

  return NextResponse.json({
    sztornoSzovegTalalat: sztornoSzoveg,
    negativVagyNullaOsszeg: negativOsszeg,
    duplikaltRendelesszamok: duplikaltRendelesszam,
    reszletek,
    jupiker,
  });
}
