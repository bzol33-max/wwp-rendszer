import "server-only";

// Élő ETA-napló és -pontosság (db/migrations/038_eta_naplo.sql). (2026-10-11)
import { query } from "@/lib/db";
import { etaPontossagStat, type EtaPontossag } from "./eta-lanc";

export type NaplozandoEta = { megbizasId: string; sorszam: number; becsultErkezes: Date };

/**
 * A lánc becsléseinek rögzítése — megállónként legfeljebb 10 percenként
 * (az oldal sokszor betöltődik). Hibát nem dob: a napló nem akaszthatja
 * meg a Ma / GPS oldalt.
 */
export async function naplozEtat(jarmu: string | null, sorok: NaplozandoEta[]): Promise<void> {
  const jo = sorok.filter((s) => /^\d+$/.test(s.megbizasId) && Number.isFinite(s.becsultErkezes.getTime()));
  if (!jo.length) return;
  try {
    await query(
      `insert into eta_naplo (megbizas_id, sorszam, jarmu, becsult_erkezes)
       select x.megbizas_id, x.sorszam, $1, x.becsult_erkezes
       from unnest($2::bigint[], $3::int[], $4::timestamptz[]) as x(megbizas_id, sorszam, becsult_erkezes)
       where exists (select 1 from fuvar_megbizasok b where b.id = x.megbizas_id)
         and not exists (
           select 1 from eta_naplo n
           where n.megbizas_id = x.megbizas_id and n.sorszam = x.sorszam and n.becsles_at > now() - interval '10 minutes')`,
      [jarmu, jo.map((s) => s.megbizasId), jo.map((s) => s.sorszam), jo.map((s) => s.becsultErkezes.toISOString())]
    );
  } catch (e) {
    console.warn("[eta-naplo] rögzítés sikertelen:", e instanceof Error ? e.message : e);
  }
}

/** Az utolsó `nap` nap mért ETA-pontossága (csak a GPS-sel igazolt érkezésekre). */
export async function etaPontossag(nap = 60): Promise<EtaPontossag[]> {
  try {
    const sorok = await query<{ horizont: number; hiba: number }>(
      `select extract(epoch from (m.gps_erkezes - n.becsles_at)) / 60 as horizont,
              extract(epoch from (n.becsult_erkezes - m.gps_erkezes)) / 60 as hiba
       from eta_naplo n
       join fuvar_megallok m on m.megbizas_id = n.megbizas_id and m.sorszam = n.sorszam
       where m.gps_erkezes is not null and n.becsles_at < m.gps_erkezes
         and n.becsles_at > now() - ($1::int * interval '1 day')`,
      [nap]
    );
    return etaPontossagStat(sorok.map((s) => ({ horizontPerc: Number(s.horizont), hibaPerc: Number(s.hiba) })));
  } catch {
    return [];
  }
}
