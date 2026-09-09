import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Egyszeri diagnosztikai/karbantartó végpont: megkeresi azokat a "sajat"
 * típusú, még nem törölt fuvarokat, amiknek MEGEGYEZIK a megrendelője
 * (normalizálva: whitespace/kis-nagybetű-független) és a hiv. száma
 * (pozicioszam) — ez a két mező együtt egyértelműen ugyanazt a valós
 * megbízást azonosítja, tehát ha egynél több sor osztozik rajtuk, az
 * duplikátum (jellemzően a most javított drive-allapot hiba miatt régebben
 * újra importált dokumentum). Csak akkor csoportosít, ha van pozicioszam
 * (üres/hiányzó hiv. számnál nem megbízható az egyezés).
 */
export async function GET() {
  const csoportok = await query<{
    kulcs: string;
    darab: number;
    idk: string[];
    statuszok: string[];
    datumok: string[];
    dokumentum_urlek: (string | null)[];
    fuvardijak: (number | null)[];
    postazva_flagek: boolean[];
    szamla_szamok: (string | null)[];
  }>(
    `select
       lower(regexp_replace(trim(megrendelo), '\\s+', ' ', 'g')) || '|' ||
         lower(regexp_replace(trim(pozicioszam), '\\s+', ' ', 'g')) as kulcs,
       count(*) as darab,
       array_agg(id::text order by id) as idk,
       array_agg(statusz order by id) as statuszok,
       array_agg(to_char(datum, 'YYYY-MM-DD') order by id) as datumok,
       array_agg(dokumentum_url order by id) as dokumentum_urlek,
       array_agg(fuvardij order by id) as fuvardijak,
       array_agg(postazva order by id) as postazva_flagek,
       array_agg(szamla_szam order by id) as szamla_szamok
     from fuvar_megbizasok
     where tipus = 'sajat' and statusz <> 'torolt'
       and megrendelo is not null and trim(megrendelo) <> ''
       and pozicioszam is not null and trim(pozicioszam) <> ''
     group by 1
     having count(*) > 1
     order by darab desc`
  );

  return NextResponse.json({
    duplikatumCsoportok: csoportok.map((c) => ({
      kulcs: c.kulcs,
      darab: c.darab,
      sorok: c.idk.map((id, i) => ({
        id,
        statusz: c.statuszok[i],
        datum: c.datumok[i],
        dokumentumUrl: c.dokumentum_urlek[i],
        fuvardij: c.fuvardijak[i],
        postazva: c.postazva_flagek[i],
        szamlaSzam: c.szamla_szamok[i],
      })),
    })),
  });
}
