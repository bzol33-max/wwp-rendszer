import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSzamlaLista } from "@/lib/szamlak/actions";

export async function GET() {
  const egyebLista = await getSzamlaLista({ kategoria: "raklap", alkategoria: "egyeb", penznem: "Ft" });
  const osszesito = await query(
    `select kategoria, alkategoria, penznem,
            coalesce(sum(brutto) filter (where not fizetve), 0) as nyitott_osszeg,
            count(*) filter (where not fizetve) as nyitott_darab
     from szamla
     where not sztorno and not sztornozva
     group by kategoria, alkategoria, penznem
     order by kategoria, alkategoria nulls first, penznem`
  );
  const egyebMinta = await query(
    `select id::text, szamlaszam, vevo_nev, penznem, brutto, kategoria, alkategoria,
            to_char(kiallitas_datum,'YYYY-MM-DD') as kiallitas_datum,
            to_char(fizetesi_hatarido,'YYYY-MM-DD') as fizetesi_hatarido,
            fizetve, sztorno, sztornozva
     from szamla
     where kategoria = 'raklap' and alkategoria = 'egyeb'
     order by kiallitas_datum desc
     limit 10`
  );
  const alkategoriaEloszlas = await query(
    `select alkategoria, count(*)::int as n from szamla where kategoria='raklap' group by alkategoria`
  );
  return NextResponse.json({ osszesito, egyebMinta, alkategoriaEloszlas, egyebLista });
}
