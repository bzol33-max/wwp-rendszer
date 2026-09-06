import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES ellenőrző végpont a sztornó-felismerés eredményének gyors
// megnézéséhez. Semmilyen kulcsot/titkot nem ad vissza.
export async function GET() {
  const osszefoglalo = await query<{ n: number }>(
    `select count(*)::int as n from szamla where sztorno or sztornozva`
  );
  const parok = await query<{
    szamlaszam: string;
    vevo_nev: string;
    brutto: number;
    sztorno: boolean;
    sztornozva: boolean;
    fizetve: boolean;
  }>(
    `select szamlaszam, vevo_nev, brutto, sztorno, sztornozva, fizetve
     from szamla
     where sztorno or sztornozva
     order by vevo_nev, szamlaszam`
  );
  const osszesito = await query(
    `select kategoria, alkategoria, penznem,
       coalesce(sum(brutto) filter (where not fizetve), 0) as nyitott_osszeg
     from szamla
     where not sztorno and not sztornozva
     group by kategoria, alkategoria, penznem`
  );
  return NextResponse.json({ erintettDarab: osszefoglalo[0]?.n ?? 0, parok, osszesito });
}
