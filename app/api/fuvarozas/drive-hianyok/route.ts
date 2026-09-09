import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * A Drive-fuvarmegbízás-figyelő automatika utólagos pótló körének ezzel
 * kérdezi le, mely MÁR korábban felvitt ("sajat" típusú, nem törölt) saját
 * fuvaroknál hiányzik a fuvardíj, a fizetési határidő és/vagy a postázási
 * cím, PEDIG van hozzájuk forrás-dokumentum (dokumentum_url) — ezeket a
 * pótló kör a dokumentum újbóli elolvasásával töltheti ki, lásd
 * /api/fuvarozas/drive-frissites. Csak azokat adjuk vissza, amikhez tényleg
 * van dokumentum — enélkül nincs miből pótolni.
 */
export async function GET() {
  const sorok = await query<{
    id: string;
    dokumentum_url: string;
    hianyzik_fuvardij: boolean;
    hianyzik_fizetesi_hatarido: boolean;
    hianyzik_postazasi_cim: boolean;
  }>(
    `select id::text, dokumentum_url,
       (fuvardij is null) as hianyzik_fuvardij,
       (fizetesi_hatarido_nap is null) as hianyzik_fizetesi_hatarido,
       (postazasi_cim is null or trim(postazasi_cim) = '') as hianyzik_postazasi_cim
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
       and dokumentum_url is not null
       and (fuvardij is null or fizetesi_hatarido_nap is null
            or postazasi_cim is null or trim(postazasi_cim) = '')
     order by id desc
     limit 200`
  );
  return NextResponse.json({
    hianyok: sorok.map((s) => ({
      id: s.id,
      dokumentumUrl: s.dokumentum_url,
      hianyzikFuvardij: s.hianyzik_fuvardij,
      hianyzikFizetesiHatarido: s.hianyzik_fizetesi_hatarido,
      hianyzikPostazasiCim: s.hianyzik_postazasi_cim,
    })),
  });
}
