// Fuvarozás 2 adat-invariánsok ellenőrzése — kizárólag SELECT (2026-10-06).
// Futtatás: npm run invarians [-- --szigoru]

import { pool, query } from "@/lib/db";
import { FUVAR_HELY_SQL, FUVAR_MA_SQL } from "@/lib/fuvarozas/fuvar-hely";
import { regiHelyUjAllapot, type BackfillBemenet } from "@/lib/fuvarozas/backfill-allapot";
import type { FuvarHely } from "@/lib/fuvarozas/fuvar-hely";

type Talalat = { kategoria: string; id: string };
const szigoru = process.argv.includes("--szigoru");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Hiányzik a DATABASE_URL környezeti változó.");
  const hibak = await query<Talalat>(`
    select kategoria, id from (
      select 'allapot NULL'::text kategoria, id::text id from fuvar_megbizasok where allapot is null
      union all select 'jelleg NULL', id::text from fuvar_megbizasok where jelleg is null
      union all select 'jelleg és régi tipus ellentmond', id::text from fuvar_megbizasok
        where jelleg is not null and ((tipus = 'sajat' and jelleg <> 'ber') or (tipus = 'ber' and jelleg <> 'sajat'))
      union all select 'törlésjelölők ellentmondanak', id::text from fuvar_megbizasok
        where (torolt_at is null) is distinct from (statusz <> 'torolt')
      union all select 'számlaszám eltérés', m.id::text from fuvar_megbizasok m join fuvar_elszamolas e on e.megbizas_id=m.id
        where e.szamla_szam is not null and m.szamla_szam is not null and e.szamla_szam <> m.szamla_szam
      -- Kemény: mindkét helyen van postázási idő, de eltér. A csak a régi
      -- oszlopban élő postázás (régi író, e.postazva_at üres) puha — az
      -- olvasó coalesce-szel a régire esik vissza, a cutover tölti át.
      union all select 'postázás eltérés', m.id::text from fuvar_megbizasok m join fuvar_elszamolas e on e.megbizas_id=m.id
        where e.postazva_at is not null and (not m.postazva or (m.postazva_at is not null and e.postazva_at is distinct from m.postazva_at))
      union all select 'postázás csak a régi oszlopban (puha)', m.id::text from fuvar_megbizasok m left join fuvar_elszamolas e on e.megbizas_id=m.id
        where m.postazva and e.postazva_at is null
      union all select 'megálló-állapot megallo_id hibás', a.fuvar_id::text from fuvar_megallo_allapot a
        left join fuvar_megallok g on g.id=a.megallo_id
        where a.megallo_id is null or g.id is null or g.megbizas_id <> a.fuvar_id
      union all select 'régi és új megállóállapot eltér', a.fuvar_id::text from fuvar_megallo_allapot a
        join fuvar_megbizasok m on m.id=a.fuvar_id
        left join fuvar_megallok g on g.megbizas_id=m.id and g.sorszam=a.megallo_index+1
        -- A 003-as tükör: kesz/kesz_at → sofor_kesz_at, gps_* → gps_*. A GPS-
        -- érintés NEM kész-jelölés, a kettőt külön kell összevetni.
        where g.id is not null and (
          a.kesz is distinct from (g.sofor_kesz_at is not null)
          or (a.kesz and a.kesz_at is distinct from g.sofor_kesz_at)
          or a.gps_erkezes is distinct from g.gps_erkezes
          -- az új tábla lehet teljesebb (pl. utólag észlelt távozás), fordítva nem
          or (a.gps_tavozas is not null and a.gps_tavozas is distinct from g.gps_tavozas))
      union all select 'megállók hiányoznak', m.id::text from fuvar_megbizasok m
        where not m.elokeszites and (coalesce(m.felrako,'') <> '' or coalesce(m.lerako,'') <> '')
          and not exists (select 1 from fuvar_megallok g where g.megbizas_id=m.id)
    ) h order by kategoria, id
  `);

  // A régi fül → új állapot szabály az E6 backfill tiszta függvénye.
  const [{ ma }] = await query<{ ma: string }>(`select ${FUVAR_MA_SQL}::text as ma`);
  type AllapotSor = BackfillBemenet & { id: string; allapot: string | null; hely_sql: FuvarHely };
  const sorok = await query<AllapotSor>(`
    select m.id::text, m.tipus, m.statusz, m.ellenorzott, m.allapot, m.postazva, m.postazva_at::text,
      m.szamla_szam, m.teljesitve, to_char(m.datum, 'YYYY-MM-DD') as datum_iso,
      to_char(m.lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
      m.papirok_beerkeztek_at::text, m.created_at::text,
      exists(select 1 from fuvar_dokumentumok d where d.fuvar_id=m.id and d.tipus='fuvarlevel') as "fotoVan",
      ${FUVAR_HELY_SQL} as hely_sql
    from fuvar_megbizasok m
  `);
  const most = new Date();
  const ujKod = new Set((await query<{ id: string }>(`
    select distinct m.id::text id from fuvar_megbizasok m
    where exists(select 1 from fuvar_megbizas_esemeny e where e.megbizas_id=m.id and e.forras='ember' and e.allapot_utan=m.allapot)
  `)).map((r) => r.id));
  for (const s of sorok) {
    if (s.allapot !== null && !ujKod.has(s.id) && regiHelyUjAllapot(s, ma, most).allapot !== s.allapot) {
      hibak.push({ kategoria: "régi fül ≠ új allapot (puha)", id: s.id });
    }
  }
  const elsz = await query<{ id: string }>(`
    select m.id::text id from fuvar_megbizasok m
    where m.jelleg='ber' and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
      and not exists(select 1 from fuvar_elszamolas e where e.megbizas_id=m.id)
  `);
  hibak.push(...elsz.map(({ id }) => ({ kategoria: "bér, teljesített, elszámolás nélkül (puha)", id })));

  const kategoria = new Map<string, string[]>();
  for (const nev of [
    "allapot NULL", "jelleg NULL", "jelleg és régi tipus ellentmond", "törlésjelölők ellentmondanak",
    "számlaszám eltérés", "postázás eltérés", "megálló-állapot megallo_id hibás",
    "régi és új megállóállapot eltér", "megállók hiányoznak",
    "postázás csak a régi oszlopban (puha)", "régi fül ≠ új allapot (puha)", "bér, teljesített, elszámolás nélkül (puha)",
  ]) kategoria.set(nev, []);
  for (const h of hibak) {
    const idk = kategoria.get(h.kategoria) ?? [];
    if (!idk.includes(h.id)) idk.push(h.id); // megállónként több sor is jöhet
    kategoria.set(h.kategoria, idk);
  }
  const puha = (nev: string) => nev.endsWith("(puha)");
  console.log("Megbízás-invariánsok\n--------------------");
  let buko = false;
  for (const [nev, idk] of [...kategoria].sort(([a], [b]) => a.localeCompare(b, "hu"))) {
    console.log(`${String(idk.length).padStart(6)}  ${nev}`);
    console.log(`       Példa ID: ${idk.slice(0, 20).join(", ") || "—"}`);
    if (!puha(nev) || szigoru) buko ||= idk.length > 0;
  }
  if (hibak.length === 0) console.log("Nincs eltérés.");
  console.log(`Mód: ${szigoru ? "szigorú (a puha kategóriák is buktatnak)" : "alap (csak kemény kategóriák buktatnak)"}`);
  if (buko) process.exitCode = 1;
}

main().catch((hiba) => { console.error(`Hiba: ${hiba instanceof Error ? hiba.message : hiba}`); process.exitCode = 1; })
  .finally(() => pool.end());
