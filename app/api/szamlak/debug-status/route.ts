import { NextResponse } from "next/server";
import { addPurchase } from "@/lib/keszlet/actions";
import { query } from "@/lib/db";

export async function GET() {
  const kassza = await query<{ sum: string | null }>(`select sum(amount)::text as sum from kassza_movements`);
  const stock = await query(
    `select t.name, sum(km.qty) as qty
     from keszlet_movements km
     join sites s on s.id = km.site_id
     join pallet_types t on t.id = km.type_id
     where s.name = 'Nyíregyháza'
     group by t.name
     order by t.name`
  );
  return NextResponse.json({ kasszaOsszeg: kassza[0]?.sum, nyiregyhazaKeszlet: stock });
}

// IDEIGLENES: az eddigi havi (Nyíregyháza) felvásárlás egyszeri, visszamenőleges
// rögzítése — a felhasználó (Zoltán) adta meg a mennyiségeket és jóváhagyta az árakat.
// Törlésre kerül a rögzítés után.

const ENTRIES: { date: string; createdBy: string; type: string; qty: number; unitPrice: number }[] = [
  // 2026-09-04 (péntek) — B.Zoltán
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "EUR világos", qty: 105, unitPrice: 2700 },
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "EUR szürke", qty: 48, unitPrice: 1500 },
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "Egyutas 80-as", qty: 5, unitPrice: 1100 },
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "Egyutas gyenge", qty: 52, unitPrice: 600 },
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "H1 raklap", qty: 1, unitPrice: 6000 },
  { date: "2026-09-04", createdBy: "B.Zoltán", type: "Csere", qty: 64, unitPrice: 800 },
  // 2026-09-03 (csütörtök) — B.Zoltán
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "EUR világos", qty: 89, unitPrice: 2700 },
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "EUR szürke", qty: 22, unitPrice: 1500 },
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "Egyutas 80-as", qty: 4, unitPrice: 1100 },
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "Egyutas gyenge", qty: 1, unitPrice: 600 },
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "H1 raklap", qty: 2, unitPrice: 6000 },
  { date: "2026-09-03", createdBy: "B.Zoltán", type: "Gitterbox", qty: 3, unitPrice: 17000 },
  // 2026-09-02 (szerda) — OszlanszkiTamas
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "EUR világos", qty: 90, unitPrice: 2700 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "EUR szürke", qty: 35, unitPrice: 1500 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "Egyutas 100-as", qty: 1, unitPrice: 1100 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "Egyutas gyenge", qty: 102, unitPrice: 600 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "Színes", qty: 5, unitPrice: 1000 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "H1 raklap", qty: 6, unitPrice: 6000 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "Csere", qty: 50, unitPrice: 800 },
  { date: "2026-09-02", createdBy: "OszlanszkiTamas", type: "Gitterbox", qty: 9, unitPrice: 17000 },
  // 2026-09-01 (kedd) — OszlanszkiTamas
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "EUR világos", qty: 143, unitPrice: 2700 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "EUR szürke", qty: 69, unitPrice: 1500 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "Egyutas 80-as", qty: 4, unitPrice: 1100 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "Egyutas gyenge", qty: 48, unitPrice: 600 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "Színes", qty: 8, unitPrice: 1000 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "H1 raklap", qty: 2, unitPrice: 6000 },
  { date: "2026-09-01", createdBy: "OszlanszkiTamas", type: "Csere", qty: 2, unitPrice: 800 },
];

export async function POST() {
  const eredmenyek: { entry: (typeof ENTRIES)[number]; ok: boolean; hiba?: string }[] = [];
  for (const e of ENTRIES) {
    try {
      await addPurchase({
        type: e.type,
        qty: e.qty,
        unitPrice: e.unitPrice,
        pending: false,
        method: "keszpenz",
        date: `${e.date}T12:00:00`,
        createdBy: e.createdBy,
      });
      eredmenyek.push({ entry: e, ok: true });
    } catch (err) {
      eredmenyek.push({ entry: e, ok: false, hiba: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ eredmenyek });
}
