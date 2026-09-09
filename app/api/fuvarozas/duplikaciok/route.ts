import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Egyszeri diagnosztikai/karbantartó végpont: megkeresi azokat a "sajat"
 * típusú, még nem törölt fuvarokat, amik nagy valószínűséggel ugyanannak a
 * valós megbízásnak a duplikátumai (jellemzően a most javított drive-allapot
 * hiba miatt régebben újra importált dokumentum).
 *
 * Két csoportosítási szabály fut egymás után:
 * 1. megrendelő + hiv. szám (pozicioszam) egyezés (normalizálva:
 *    whitespace/kis-nagybetű-független) — ez a két mező együtt
 *    egyértelműen azonosítja a megbízást, csak akkor néz rá, ha VAN
 *    pozicioszam (üres/hiányzó hiv. számnál nem megbízható az egyezés).
 * 2. megrendelő + felrakó + lerakó + dátum + fuvardíj egyezés, KIZÁRÓLAG
 *    azokra a sorokra, amiknek NINCS pozicioszáma — ilyenkor ez az 5 mező
 *    együtt ugyanolyan megbízhatóan azonosítja a megbízást (lásd pl. a
 *    Hajdúspedíció Nyírjákó→Ikrény párt, aminek egyik sora sem kapott
 *    pozicioszámot, így az 1. szabály nem vette észre).
 */
export async function GET() {
  const pozicioszamosCsoportok = await query<{
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

  const pozicioszamNelkuliCsoportok = await query<{
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
         lower(regexp_replace(trim(regexp_replace(felrako, '\\([^)]*\\)', '', 'g')), '\\s+', ' ', 'g')) || '|' ||
         lower(regexp_replace(trim(regexp_replace(lerako, '\\([^)]*\\)', '', 'g')), '\\s+', ' ', 'g')) || '|' ||
         to_char(datum, 'YYYY-MM-DD') || '|' ||
         coalesce(fuvardij::text, '') as kulcs,
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
       and (pozicioszam is null or trim(pozicioszam) = '')
       and lerako is not null and trim(lerako) <> ''
     group by 1
     having count(*) > 1
     order by darab desc`
  );

  const map = (c: (typeof pozicioszamosCsoportok)[number]) => ({
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
  });

  return NextResponse.json({
    duplikatumCsoportok: [
      ...pozicioszamosCsoportok.map(map),
      ...pozicioszamNelkuliCsoportok.map(map),
    ],
  });
}
