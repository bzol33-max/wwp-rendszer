// Ideiglenes, egyszer használatos admin végpont: tesztüzemi állapotra állítja
// a készletet (minden telep, minden aktív típusa 100 db) és a kasszát
// (1 000 000 Ft), miközben törli az összes korábbi előzményt.
// Csak a `token` query paraméterrel hívható, majd a bevetés után törlendő.
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const RESET_TOKEN = "wwp-teszt-2026-reset";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== RESET_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query("truncate table keszlet_movements restart identity cascade");
    await client.query("truncate table nyiregyhaza_purchases restart identity cascade");
    await client.query("truncate table kassza_movements restart identity cascade");
    await client.query("truncate table keszlet_events restart identity cascade");
    await client.query("truncate table inventory_counts restart identity cascade");

    const inserted = await client.query(
      `insert into keszlet_movements (site_id, type_id, direction, qty, partner, created_by)
       select sat.site_id, sat.type_id, 'be', 100, 'Nyitókészlet (tesztüzem)', 'admin'
       from site_active_types sat
       returning id`
    );

    await client.query(
      `insert into kassza_movements (description, amount, created_by)
       values ('Nyitó kassza (tesztüzem)', 1000000, 'admin')`
    );

    await client.query("commit");

    return NextResponse.json({
      ok: true,
      stockRowsInserted: inserted.rowCount,
      kasszaSet: 1000000,
    });
  } catch (err) {
    await client.query("rollback");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
