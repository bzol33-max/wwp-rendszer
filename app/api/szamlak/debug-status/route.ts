import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// IDEIGLENES diagnosztikai végpont — a Készlet "havi" fül élesítése előtt
// megnézzük, mi van ténylegesen az éles adatbázisban (nem csak a seed
// scriptben). Törlésre kerül, amint a döntés megszületett.

export async function GET() {
  const kassza = await query<{ count: string; sum: string | null }>(
    `select count(*)::text as count, sum(amount)::text as sum from kassza_movements`
  );
  const purchases = await query<{ count: string }>(`select count(*)::text as count from nyiregyhaza_purchases`);
  const keszletMovements = await query<{
    site_id: string;
    type_id: string;
    direction: string;
    count: string;
    sum_qty: string;
  }>(
    `select site_id, type_id, direction, count(*)::text as count, sum(qty)::text as sum_qty
     from keszlet_movements
     group by site_id, type_id, direction
     order by site_id, type_id, direction`
  );
  const inventoryCounts = await query<{ count: string }>(`select count(*)::text as count from inventory_counts`);
  const keszletEvents = await query<{ count: string }>(`select count(*)::text as count from keszlet_events`);

  const kasszaReszletek = await query(
    `select id, description, amount, purchase_id, category, created_at, created_by from kassza_movements order by created_at`
  );
  const purchaseReszletek = await query(
    `select id, type_id, qty, unit_price, total, seller, pending, created_at, payment_method from nyiregyhaza_purchases order by created_at`
  );

  return NextResponse.json({
    kassza: kassza[0],
    purchasesCount: purchases[0]?.count,
    keszletMovements,
    inventoryCountsCount: inventoryCounts[0]?.count,
    keszletEventsCount: keszletEvents[0]?.count,
    kasszaReszletek,
    purchaseReszletek,
  });
}

// POST: a Készlet modul teljes élesítés előtti nullázása — a felhasználó
// (Zoltán) kifejezetten jóváhagyta (2026-09-07), miután megmutattam neki a
// pontos éles adatokat (teszt-kassza, teszt-felvásárlások, demó
// "Nyitókészlet" sorok). Minden érintett tábla ürítése, hogy a Készlet
// oldal minden telephelyen, minden terméken 0-ról induljon — a valós
// leltárt/kasszát/havi felvásárlást ő adja majd meg ezután.
export async function POST() {
  await query(`delete from kassza_movements`);
  await query(`delete from nyiregyhaza_purchases`);
  await query(`delete from keszlet_movements`);
  await query(`delete from keszlet_events`);
  await query(`delete from inventory_counts`);
  return NextResponse.json({ ok: true, message: "Készlet modul nullázva." });
}
