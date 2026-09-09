import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Diagnosztikai kereső a Számlák modul (szamla tábla) felé: szabad
 * szöveggel (vevő neve vagy rendelésszám részlete) keres — arra kell,
 * hogy egy fuvar ↔ számla párosítási hiba esetén el lehessen dönteni, VAN-e
 * egyáltalán a partnerhez kiállított/behúzott számla, és ha van, a
 * rendelésszáma pontosan egyezik-e a fuvar hiv. számával (lásd
 * szinkronizalSzamlaSzamokat, lib/fuvarozas/megbizasok.ts).
 *
 * Használat: GET /api/fuvarozas/szamla-kereses?q=Duvenbeck
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ hiba: "Hiányzó 'q' lekérdezési paraméter." }, { status: 400 });
  }

  const sorok = await query<{
    szamlaszam: string;
    vevo_nev: string;
    rendelesszam: string | null;
    kategoria: string;
    kiallitas_datum: string;
    brutto: number;
    fizetve: boolean;
  }>(
    `select szamlaszam, vevo_nev, rendelesszam, kategoria, kiallitas_datum, brutto, fizetve
     from szamla
     where vevo_nev ilike '%' || $1 || '%' or rendelesszam ilike '%' || $1 || '%'
     order by kiallitas_datum desc
     limit 30`,
    [q]
  );

  return NextResponse.json({ talalatok: sorok });
}
