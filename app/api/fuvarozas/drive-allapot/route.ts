import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * A Drive-fuvarmegbízás-figyelő automatika (ütemezett Claude-feladat) ezzel
 * kérdezi le, mely Google Drive fájlok (dokumentum_url) vannak már a
 * rendszerben rögzítve — így egy új lefutáskor csak az újakat viszi fel,
 * nem duplikál. Csak a "sajat" típusú (saját fuvar) megbízásokat nézi,
 * mert a Drive-mappa is ezeket tartalmazza.
 */
export async function GET() {
  const sorok = await query<{ dokumentum_url: string }>(
    `select dokumentum_url
     from fuvar_megbizasok
     where dokumentum_url is not null and statusz <> 'torolt'`
  );
  return NextResponse.json({
    dokumentumUrlak: sorok.map((s) => s.dokumentum_url),
  });
}
