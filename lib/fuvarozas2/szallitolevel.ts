// Számlázz.hu-s szállítólevél ↔ saját fuvar párosítás — betöltés és írás.
// A döntés: lib/fuvarozas2/szallitolevel-parositas.ts. A szállítóleveleket a
// Számlák modul húzza be a `szallitolevel_import` táblába (lib/szamlak/poll.ts);
// itt csak ebből a táblából dolgozunk, a Számlázz.hu-t nem kérdezzük.
//
// NEM "use server": a számla-szinkron (rendszer-kontextusban) hívja.

import { query } from "@/lib/db";
import { parositSzallitoleveleket } from "@/lib/fuvarozas2/szallitolevel-parositas";

export async function szinkronizalSzallitoleveleket(): Promise<number> {
  const szallitolevelek = await query<{ bizonylatszam: string; kelt: string; vevo: string | null; rendszam: string | null }>(
    `select bizonylatszam, to_char(kelt, 'YYYY-MM-DD') as kelt, vevo, rendszam
     from szallitolevel_import
     where parositas_allapot = 'nyitott' and megbizas_id is null and kelt >= current_date - 60`
  );
  if (szallitolevelek.length === 0) return 0;

  // Saját fuvar = tipus 'ber' (a felületen „Saját fuvar”). Az előkészítés
  // alattiak is: a szállítólevelet előre állítják ki.
  const fuvarok = await query<{ id: string; datum: string; jarmu_rendszam: string | null; kinek: string | null; hova: string | null }>(
    `select m.id::text, to_char(m.datum, 'YYYY-MM-DD') as datum,
       coalesce(j.kod, nullif(m.elokeszites_jarmu, ''), nullif(m.jarmu, '')) as jarmu_rendszam,
       coalesce(p.nev, m.megrendelo) as kinek, m.lerako as hova
     from fuvar_megbizasok m
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.tipus = 'ber' and m.torolt_at is null and m.statusz <> 'torolt' and m.datum >= current_date - 60
       and not exists (select 1 from szallitolevel_import s where s.megbizas_id = m.id and s.parositas_allapot = 'parositva')`
  );

  const parok = parositSzallitoleveleket(
    fuvarok.map((f) => ({ id: f.id, datum: f.datum, jarmuRendszam: f.jarmu_rendszam, kinek: f.kinek, hova: f.hova })),
    szallitolevelek
  );
  let db = 0;
  for (const p of parok) {
    const [sz] = await query<{ tetelek: { nev: string; mennyiseg: number | null; egyseg: string | null }[]; raklap_db: number | null }>(
      `update szallitolevel_import set megbizas_id = $2, parositas_allapot = 'parositva'
       where bizonylatszam = $1 and parositas_allapot = 'nyitott' returning tetelek, raklap_db`,
      [p.bizonylatszam, p.fuvarId]
    );
    if (!sz) continue;
    const aru = (sz.tetelek ?? []).map((t) => t.nev).filter(Boolean).join(", ") || null;
    await query(
      `update fuvar_megbizasok set kulso_azonosito = coalesce(kulso_azonosito, $2),
         aru = coalesce(nullif(aru, ''), $3), mennyiseg = coalesce(nullif(mennyiseg, ''), $4)
       where id = $1`,
      [p.fuvarId, p.bizonylatszam, aru, sz.raklap_db ? `${sz.raklap_db} db` : null]
    );
    await query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, reszletek) values ($1, 'modositva', 'szamla_szinkron', $2)`,
      [p.fuvarId, JSON.stringify({ szallitolevel: p.bizonylatszam })]
    );
    console.log(`[szallitolevel] #${p.fuvarId} ← ${p.bizonylatszam}`);
    db++;
  }
  return db;
}
