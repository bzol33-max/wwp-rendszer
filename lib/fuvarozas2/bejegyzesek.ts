import "server-only";

// Hét nézet B1 (docs/het-b1-terv.md): az ablak napjaira eső bejegyzések és a
// sofőrök távollétei (Jelenlét: jelenletek.day_type), kocsi-kódra fordítva.

import { query } from "@/lib/db";
import type { BejegyzesSor, BejegyzesTipus, Tavollet, TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";

export async function getBejegyzesSorok(tol: string, ig: string): Promise<BejegyzesSor[]> {
  const sorok = await query<{
    id: string; jarmu_kod: string; tipus: BejegyzesTipus; nap: string; tol: string | null; ig: string | null;
    hely: string | null; megjegyzes: string | null; ismetles: "nincs" | "heti"; ismetles_ig: string | null; kihagyott: string[] | null;
  }>(
    `select id::text, jarmu_kod, tipus, to_char(nap, 'YYYY-MM-DD') as nap,
            to_char(tol, 'HH24:MI') as tol, to_char(ig, 'HH24:MI') as ig, hely, megjegyzes, ismetles,
            to_char(ismetles_ig, 'YYYY-MM-DD') as ismetles_ig,
            array(select to_char(d, 'YYYY-MM-DD') from unnest(kihagyott) d order by d) as kihagyott
       from fuvar_bejegyzesek
      where torolt_at is null and nap <= $2::date
        and (nap >= $1::date or (ismetles = 'heti' and (ismetles_ig is null or ismetles_ig >= $1::date)))
      order by nap, tol nulls first, id`,
    [tol, ig]
  );
  return sorok.map((s) => ({
    id: s.id, jarmuKod: s.jarmu_kod, tipus: s.tipus, nap: s.nap, tol: s.tol, ig: s.ig,
    hely: s.hely, megjegyzes: s.megjegyzes, ismetles: s.ismetles, ismetlesIg: s.ismetles_ig, kihagyott: s.kihagyott ?? [],
  }));
}

/** A kocsikhoz rendelt sofőrök szabadság- és betegnapjai (csak a Jelenlétbe beírt, jóváhagyott napok). */
export async function getTavolletek(tol: string, ig: string): Promise<Tavollet[]> {
  const sorok = await query<{ kod: string; nap: string; tipus: TavolletTipus }>(
    `select distinct j.kod, to_char(t.work_date, 'YYYY-MM-DD') as nap, t.day_type as tipus
       from jelenletek t
       join fuvar_jarmuvek j on j.sofor_id = t.employee_id and j.aktiv
      where t.day_type in ('szabadsag', 'beteg') and t.work_date between $1::date and $2::date`,
    [tol, ig]
  );
  return sorok.map((s) => ({ jarmuKod: s.kod, nap: s.nap, tipus: s.tipus }));
}
