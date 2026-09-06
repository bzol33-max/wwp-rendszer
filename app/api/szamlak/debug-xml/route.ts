// Ideiglenes hibakereső végpont: az egyik már lekérdezett számla nyers XML
// válaszát adja vissza szöveges formátumban, hogy a Számlázz.hu válasz
// pontos mezőneveit ellenőrizni lehessen. NEM tartalmaz titkot (a
// SZAMLAZZHU_API_KEY-t nem adja vissza) — csak üzleti adatot, amit az
// alkalmazás amúgy is tárol. Törlendő, ha a mezőleképezés megerősítést nyert.
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query<{ szamlaszam: string; raw_xml: string }>(
    `select szamlaszam, raw_xml from szamla order by id desc limit 1`
  );
  const row = rows[0];
  if (!row) return new Response("nincs még lekérdezett számla", { status: 404 });
  return new Response(`--- ${row.szamlaszam} ---\n${row.raw_xml}`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
