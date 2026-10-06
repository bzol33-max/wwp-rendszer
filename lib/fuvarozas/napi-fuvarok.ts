import "server-only";

// A napi fuvar-lekérdezések, amikre a GPS-idővonal épül. NEM "use server":
// a sofőr mobil napja (lib/fuvarozas/sofor.ts) is ezeken át számol — a
// "use server" fájlban kívülről, közvetlen hívással bárki (a sofőr is) az
// összes fuvart lekérhette (audit 2026-10-04). A hívók maguk ellenőrzik a
// jogot és szűkítik a hatókört.

import { query } from "@/lib/db";
import { FUVAR_MA_SQL } from "@/lib/fuvarozas/fuvar-hely";
import type { MaiFuvarSor } from "@/lib/fuvarozas/fuvar-constants";

/**
 * Ennyi napra visszamenőleg mutatja a GPS lap a CSÚSZÓ fuvarokat: járművel
 * rendelkező, még nem Teljesítve és még nem számlázott fuvar, aminek a
 * lerakási napja már elmúlt (a kiszámlázott nyilván megtörtént, csak a
 * Teljesítve pipa maradt el — az nem csúszik).
 * Élesben a #130 (Pápa → Debrecen, lerakás 09-16) éjfél után eltűnt a GPS
 * lapról, miközben a kocsi felrakva Pápán állt, és csak másnap indult.
 */
const CSUSZO_FUVAR_NAPOK = 3;

/**
 * A csúszó fuvar akkor is a nap része, ha AZNAP zárult le: a #134 (Ghibli
 * Gyöngyöshalász → Debrecen, tervezett lerakás 09-17) 09-18 07:57-kor ért a
 * lerakóhoz, és 09:25-kor automatikusan Teljesítve lett — attól a perctől
 * eltűnt a mai GPS lapról, a reggeli debreceni lerakás sehol nem látszott,
 * miközben a kocsi már a következő fuvar felrakójához ment. A megjelenített
 * nap ELŐTT lezárt csúszó fuvar viszont nem a nap munkája (azt a
 * szamitsIdovonalakat napElottKesz szűrője is kizárja).
 */
const CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL = `(not teljesitve
  or (teljesitve_at at time zone 'Europe/Budapest')::date = coalesce($1::date, ${FUVAR_MA_SQL}))`;

/**
 * Egy adott nap (alapértelmezetten a mai) saját fuvarjai — akár aznap
 * kell felrakni, akár aznap kell lerakni, AKÁR a kettő közé eső napon (egy
 * többnapos fuvar felrakás és lerakás közti napjain, pl. amíg a jármű a
 * saját telephelyen áll) —, nyers dátumokkal, a napi jármű-idővonalra
 * (GPS-idővonal + tervezett fuvarok) történő időpont-becsléshez.
 *
 * FONTOS: korábban ez csak a felrakás VAGY a lerakás napjára illeszkedett
 * (egyenlőségvizsgálattal) — egy péntek-hétfő közti többnapos fuvar emiatt
 * szombaton/vasárnap teljesen eltűnt a GPS idővonalról (majd hétfőn
 * "visszatért"), holott a fuvar ezeken a napokon is folyamatban van (csak
 * éppen áll). A tartomány-illesztés ezt a hézagot zárja be.
 *
 * `csuszokIs`: a CSUSZO_FUVAR_NAPOK napon belül lerakandó, még nem
 * Teljesítve VAGY aznap Teljesítve lett, járművel rendelkező fuvarok is (a
 * GPS lap mai nézetéhez — lásd CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL).
 */
export async function getMaiSajatFuvarok(nap?: string, csuszokIs = false): Promise<MaiFuvarSor[]> {
  return query<MaiFuvarSor>(
    `select
       id::text, megrendelo, felrako, lerako, idopont,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       jarmu, sofor, pozicioszam, referencia,
       aru, mennyiseg, suly, fuvardij, fuvardij_penznem,
       (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve,
       to_char(teljesitve_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as teljesitve_at
     from fuvar_megbizasok
     where jelleg = 'ber' and torolt_at is null
       and (
         (datum <= coalesce($1::date, ${FUVAR_MA_SQL})
          and coalesce(lerakas_datum, datum) >= coalesce($1::date, ${FUVAR_MA_SQL}))
         or ($2::boolean and ${CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL}
             and coalesce(szamla_szam, '') = '' and jarmu is not null and jarmu <> ''
             and coalesce(lerakas_datum, datum)
               between coalesce($1::date, ${FUVAR_MA_SQL}) - ${CSUSZO_FUVAR_NAPOK}
                   and coalesce($1::date, ${FUVAR_MA_SQL}) - 1)
       )
     order by idopont nulls last, id asc
     limit 100`,
    [nap ?? null, csuszokIs]
  );
}

/**
 * Egy adott nap (alapértelmezetten a mai) "Saját fuvarok" fülön (tipus='ber')
 * rögzített, kézzel felvett fuvarjai — a mobil összefoglaló nézethez
 * (kocsinkénti csoportosítás a `jarmu` mező alapján). Lásd getMaiSajatFuvarok
 * fenti megjegyzését a "sajat"/"ber" elnevezés (történelmi okokból fordított
 * UI-címkézés: tipus='sajat' → "Bér fuvarok" fül, tipus='ber' → "Saját
 * fuvarok" fül) tisztázásához.
 */
export async function getMaiValodiSajatFuvarok(nap?: string, csuszokIs = false): Promise<MaiFuvarSor[]> {
  return query<MaiFuvarSor>(
    `select
       id::text, megrendelo, felrako, lerako, idopont,
       to_char(datum, 'YYYY-MM-DD') as datum,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum,
       jarmu, sofor, pozicioszam,
       aru, mennyiseg, suly, fuvardij, fuvardij_penznem,
       (select count(*) from fuvar_dokumentumok d where d.fuvar_id = fuvar_megbizasok.id and d.tipus = 'fuvarlevel')::int as fuvarlevel_foto_db,
       to_char(felrakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as felrakas_ablak_tol,
       to_char(lerakas_ablak_tol at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as lerakas_ablak_tol,
       teljesitve,
       to_char(teljesitve_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as teljesitve_at
     from fuvar_megbizasok
     where jelleg = 'sajat' and torolt_at is null
       and (
         (datum <= coalesce($1::date, ${FUVAR_MA_SQL})
          and coalesce(lerakas_datum, datum) >= coalesce($1::date, ${FUVAR_MA_SQL}))
         or ($2::boolean and ${CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL}
             and coalesce(szamla_szam, '') = '' and jarmu is not null and jarmu <> ''
             and coalesce(lerakas_datum, datum)
               between coalesce($1::date, ${FUVAR_MA_SQL}) - ${CSUSZO_FUVAR_NAPOK}
                   and coalesce($1::date, ${FUVAR_MA_SQL}) - 1)
       )
     order by idopont nulls last, id asc
     limit 100`,
    [nap ?? null, csuszokIs]
  );
}

/** Egy fuvar-lista megállóinak állapota az új megállótáblából. (2026-10-06) */
export async function getMegalloAllapotok(fuvarIds: string[]): Promise<
  {
    fuvar_id: string;
    megallo_index: number;
    kesz: boolean;
    kesz_by: string | null;
    /** Mikor lett kézzel készre jelölve (sofőr mobil, GPS lap pipa). */
    kesz_at: Date | null;
    /** A sofőr "Megérkeztem" koppintásának ideje. */
    kezi_erkezes: Date | null;
    varakozas_kezdete: Date | null;
    varakozas_vege: Date | null;
  }[]
> {
  if (fuvarIds.length === 0) return [];
  // Nem csak a kész sorok: a várakozás-jelölés és a "Megérkeztem" kész
  // megálló nélkül is létezik — a GPS lap táblázata mindkettőt mutatja.
  return query(
    `select megbizas_id::text as fuvar_id, sorszam - 1 as megallo_index,
            sofor_kesz_at is not null as kesz, sofor_kesz_by as kesz_by, sofor_kesz_at as kesz_at,
            sofor_megerkezett_at as kezi_erkezes, varakozas_kezdete, varakozas_vege
     from fuvar_megallok
     where megbizas_id = any($1::bigint[]) and (sofor_kesz_at is not null or varakozas_kezdete is not null or sofor_megerkezett_at is not null)`,
    [fuvarIds]
  );
}
