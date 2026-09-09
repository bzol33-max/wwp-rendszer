import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * A Drive-fuvarmegbízás-figyelő automatika (ütemezett Claude-feladat) ezzel
 * kérdezi le, mely Google Drive fájlok (dokumentum_url) vannak már a
 * rendszerben rögzítve — így egy új lefutáskor csak az újakat viszi fel,
 * nem duplikál. Csak a "sajat" típusú (saját fuvar) megbízásokat nézi,
 * mert a Drive-mappa is ezeket tartalmazza.
 *
 * FONTOS (2026-09-09-i javítás): a "statusz <> 'torolt'" szűrő korábban itt
 * szerepelt, hogy a törölt (pl. duplikált/sztornózott) megbízások "ismét
 * újnak" tűnjenek — ez viszont pontosan a duplikálás oka volt: egy törölt
 * sor dokumentum_url-je "eltűnt" ebből a listából, így a Drive-automatika a
 * KÖVETKEZŐ körben újra felvitte ugyanazt a dokumentumot, létrehozva egy
 * újabb sort. A törölt sorokat is látnia kell az automatikának ahhoz, hogy
 * egy adott dokumentumot véglegesen (a törlés után is) "ismertnek" tartson.
 */
export async function GET() {
  const sorok = await query<{ dokumentum_url: string }>(
    `select dokumentum_url
     from fuvar_megbizasok
     where dokumentum_url is not null`
  );
  return NextResponse.json({
    dokumentumUrlak: sorok.map((s) => s.dokumentum_url),
  });
}
