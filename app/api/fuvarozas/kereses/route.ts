import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withSession } from "@/lib/auth/require-session";
import { escapeLike } from "@/lib/sql/like-escape";

/**
 * Általános diagnosztikai kereső végpont: szabad szöveggel (megrendelő vagy
 * hiv. szám részlete) keres a nem törölt "sajat" fuvarok közt — arra kell,
 * hogy egy konkrét, névvel/hiv. számmal említett megbízást (pl. "melyik sor
 * a Duvenbeck?") gyorsan meg lehessen találni id/dokumentum_url szerint,
 * hogy aztán a drive-frissites végponttal javítható legyen.
 *
 * Használat: GET /api/fuvarozas/kereses?q=Duvenbeck
 */
export const GET = withSession(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ hiba: "Hiányzó 'q' lekérdezési paraméter." }, { status: 400 });
  }

  const escapedQ = escapeLike(q);
  const sorok = await query<{
    id: string;
    megrendelo: string | null;
    pozicioszam: string | null;
    felrako: string | null;
    lerako: string;
    datum: string;
    fuvardij: number | null;
    fuvardij_penznem: string;
    dokumentum_url: string | null;
    szamla_szam: string | null;
    postazasi_cim: string | null;
  }>(
    `select id::text, megrendelo, pozicioszam, felrako, lerako,
       to_char(datum, 'YYYY-MM-DD') as datum,
       fuvardij, fuvardij_penznem, dokumentum_url, szamla_szam, postazasi_cim
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
       and (megrendelo ilike '%' || $1 || '%' escape '\\' or pozicioszam ilike '%' || $1 || '%' escape '\\')
     order by id desc
     limit 50`,
    [escapedQ]
  );

  return NextResponse.json({
    talalatok: sorok.map((s) => ({
      id: s.id,
      megrendelo: s.megrendelo,
      pozicioszam: s.pozicioszam,
      felrako: s.felrako,
      lerako: s.lerako,
      datum: s.datum,
      fuvardij: s.fuvardij,
      fuvardijPenznem: s.fuvardij_penznem,
      dokumentumUrl: s.dokumentum_url,
      szamlaSzam: s.szamla_szam,
      postazasiCim: s.postazasi_cim,
    })),
  });
});
