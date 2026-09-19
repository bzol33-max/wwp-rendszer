// Fuvarozás 2 — E6 backfill és E6-kapu ellenőrzés. A régi fuvar_megbizasok
// jelölőiből feltölti az új oszlopokat/táblákat (a 001 migráció után), és
// bármikor újrafuttatható ellenőrzést ad: a régi fül (getFuvarHelye) a 11.2
// leképező táblán át MINDEN soron egyezik-e az eltárolt `allapot`-tal.
//
// Futtatás (DATABASE_URL a környezetből):
//   npx tsx scripts/fuvarozas2-backfill.ts            — száraz futás: számok + hibajelöltek, nem ír
//   npx tsx scripts/fuvarozas2-backfill.ts --apply    — ír (idempotens: ami már megvan, kihagyja)
//   npx tsx scripts/fuvarozas2-backfill.ts --check    — csak az E6 kapu számai (cél: 0 eltérés, 0 nyitott hiba)
//
// MIT ÍR (--apply), soronként, egy tranzakcióban:
//   1. partner: a megrendelő normalizált kulcsa → fuvar_partnerek (PONTOS
//      egyezés, S13; új kulcs → új partner, fuzzy összevonás kézzel később);
//      megbizas.partner_id. Nincs megrendelő és jelleg='ber' → migracio_hiba.
//   2. hivatkozas_kanonikus = pozicioszam ?? reise_id, masodlagos = a másik,
//      hivatkozas_nincs = pozicioszam_nincs.
//   3. jarmu_id a `jarmu` szövegből (resolveJarmu, pontos/ismert alak).
//   4. megállók: bontsMegallokra(felrako) + bontsMegallokra(lerako) → sorok
//      (sorszám: felrakók, aztán lerakók — a sofor.ts sorrendje); terv:
//      felrakó = datum + felrakas_ablak, lerakó = lerakas_datum ?? datum +
//      lerakas_ablak. jelleg='ber' üres felrakóval → migracio_hiba.
//   5. fuvar_megallo_allapot.megallo_id az indexből (S11: egyszer, snapshot);
//      a kesz/kesz_at/kesz_by és gps_erkezes/tavozas átmásolva a megállóra.
//      Orphan index → migracio_hiba.
//   6. allapot + allapot_at (11.2), esemény 'migracio' a részletekkel.
//   7. elszámolás-sor jelleg='ber' és allapot ≥ teljesitve esetén: papír,
//      számla (szamla.szamlaszam egyezés), postázás, cím, határidő.
//   Semmit nem hamisít: dátumot, számlát nem talál ki; a becsült
//   elhagyva_at 'becsult: true' jelölést kap a naplóban (S6).

import { pool, query } from "@/lib/db";
import { FUVAR_HELY_SQL, FUVAR_MA_SQL, type FuvarHely } from "@/lib/fuvarozas/fuvar-hely";
import { regiHelyUjAllapot, becsultElhagyvaAt, type BackfillBemenet } from "@/lib/fuvarozas/backfill-allapot";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";
import { resolveJarmu } from "@/lib/fuvarozas/vehicles";

type Sor = BackfillBemenet & {
  id: string;
  megrendelo: string | null;
  felrako: string | null;
  lerako: string;
  jarmu: string | null;
  pozicioszam: string | null;
  pozicioszam_nincs: boolean;
  reise_id: string | null;
  teljesitve_at: string | null;
  created_at: string;
  postazasi_cim: string | null;
  fizetesi_hatarido_nap: number | null;
  felrakas_ablak_tol: string | null;
  felrakas_ablak_ig: string | null;
  lerakas_ablak_tol: string | null;
  lerakas_ablak_ig: string | null;
  allapot: string | null;
  partner_id: string | null;
  jarmu_id: string | null;
  hely_sql: FuvarHely;
  megallo_db: number;
};

const mod = process.argv.includes("--apply") ? "apply" : process.argv.includes("--check") ? "check" : "dry";

async function beolvas(): Promise<{ ma: string; sorok: Sor[] }> {
  const [{ ma }] = await query<{ ma: string }>(`select ${FUVAR_MA_SQL}::text as ma`);
  const sorok = await query<Sor>(
    `select m.id::text, m.tipus, m.statusz, m.megrendelo, m.felrako, m.lerako, m.jarmu,
       m.pozicioszam, m.pozicioszam_nincs, m.reise_id, m.ellenorzott,
       to_char(m.datum, 'YYYY-MM-DD') as datum_iso,
       to_char(m.lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
       m.postazva, m.postazva_at::text, m.teljesitve, m.teljesitve_at::text,
       m.papirok_beerkeztek_at::text, m.szamla_szam, m.created_at::text,
       m.postazasi_cim, m.fizetesi_hatarido_nap,
       m.felrakas_ablak_tol::text, m.felrakas_ablak_ig::text, m.lerakas_ablak_tol::text, m.lerakas_ablak_ig::text,
       m.allapot, m.partner_id::text, m.jarmu_id::text,
       exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = m.id and d.tipus = 'fuvarlevel') as "fotoVan",
       ${FUVAR_HELY_SQL} as hely_sql,
       (select count(*) from fuvar_megallok g where g.megbizas_id = m.id)::int as megallo_db
     from fuvar_megbizasok m
     order by m.id`
  );
  return { ma, sorok };
}

type Hiba = { megbizas_id: string; tipus: string; leiras: string };

function tervezettHibak(sorok: Sor[]): Hiba[] {
  const hibak: Hiba[] = [];
  for (const s of sorok) {
    if (s.statusz === "torolt") continue;
    const jelleg = s.tipus === "sajat" ? "ber" : "sajat";
    if (jelleg === "ber" && !s.megrendelo?.trim()) hibak.push({ megbizas_id: s.id, tipus: "partner_hianyzik", leiras: "bér fuvar megrendelő nélkül" });
    if (jelleg === "ber" && bontsMegallokra(s.felrako).length === 0) hibak.push({ megbizas_id: s.id, tipus: "felrako_ures", leiras: "bér fuvar felrakó nélkül" });
    if (bontsMegallokra(s.lerako).length === 0) hibak.push({ megbizas_id: s.id, tipus: "lerako_ures", leiras: "nincs lerakó" });
    if (s.jarmu?.trim() && !resolveJarmu(s.jarmu)) hibak.push({ megbizas_id: s.id, tipus: "jarmu_ismeretlen", leiras: `nem azonosítható kocsi: "${s.jarmu}"` });
  }
  return hibak;
}

async function check(): Promise<number> {
  const { ma, sorok } = await beolvas();
  const most = new Date();
  const nincs = sorok.filter((s) => s.allapot === null);
  const elter = sorok.filter((s) => s.allapot !== null && regiHelyUjAllapot(s, ma, most).allapot !== s.allapot);
  const [{ nyitott }] = await query<{ nyitott: string }>(`select count(*) as nyitott from fuvar_migracio_hiba where rendezve_at is null`);
  const [{ elsz }] = await query<{ elsz: string }>(
    `select count(*) as elsz from fuvar_megbizasok m
     where m.jelleg = 'ber' and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
       and not exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id)`
  );
  const [{ orphan }] = await query<{ orphan: string }>(`select count(*) as orphan from fuvar_megallo_allapot where megallo_id is null`);
  console.log(`E6 kapu:`);
  console.log(`  sorok összesen:                       ${sorok.length}`);
  console.log(`  allapot nélkül:                       ${nincs.length}`);
  console.log(`  régi fül ≠ új allapot (11.2 szerint): ${elter.length}`);
  console.log(`  nyitott migracio_hiba:                ${nyitott}`);
  console.log(`  bér, teljesített, elszámolás nélkül:  ${elsz}`);
  console.log(`  megallo_allapot megallo_id nélkül:    ${orphan}`);
  for (const s of elter.slice(0, 20)) {
    console.log(`    #${s.id} régi=${s.hely_sql} tárolt=${s.allapot} várt=${regiHelyUjAllapot(s, ma, most).allapot}`);
  }
  return nincs.length + elter.length + Number(nyitott) + Number(elsz) + Number(orphan);
}

async function dry() {
  const { ma, sorok } = await beolvas();
  const most = new Date();
  const szamlalo = new Map<string, number>();
  for (const s of sorok) {
    const e = regiHelyUjAllapot(s, ma, most);
    const k = `${s.hely_sql} → ${e.allapot}${s.statusz === "torolt" ? " (törölt)" : ""}`;
    szamlalo.set(k, (szamlalo.get(k) ?? 0) + 1);
  }
  console.log(`Száraz futás — ${sorok.length} sor, ma=${ma}`);
  for (const [k, n] of [...szamlalo.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  const hibak = tervezettHibak(sorok);
  console.log(`Migrációs hiba-jelöltek: ${hibak.length}`);
  const tipusok = new Map<string, number>();
  for (const h of hibak) tipusok.set(h.tipus, (tipusok.get(h.tipus) ?? 0) + 1);
  for (const [t, n] of tipusok) console.log(`  ${String(n).padStart(5)}  ${t}`);
  const partnerek = new Set(sorok.filter((s) => s.megrendelo?.trim()).map((s) => normalizaltCegKulcs(s.megrendelo!)));
  console.log(`Partnerek (pontos kulcs szerint): ${partnerek.size}`);
  console.log(`Már van allapot: ${sorok.filter((s) => s.allapot).length}, megálló-sorral: ${sorok.filter((s) => s.megallo_db > 0).length}`);
}

async function apply() {
  const { ma, sorok } = await beolvas();
  const most = new Date();
  const client = await pool.connect();
  let irt = 0;
  try {
    await client.query("begin");
    // Partnerek (pontos kulcs).
    const kulcsNev = new Map<string, string>();
    for (const s of sorok) if (s.megrendelo?.trim()) kulcsNev.set(normalizaltCegKulcs(s.megrendelo), s.megrendelo.trim());
    for (const [kulcs, nev] of kulcsNev) {
      await client.query(
        `insert into fuvar_partnerek (nev, nev_kulcs) values ($1, $2) on conflict (nev_kulcs) do nothing`,
        [nev, kulcs]
      );
    }
    const { rows: prow } = await client.query<{ id: string; nev_kulcs: string }>(`select id::text, nev_kulcs from fuvar_partnerek`);
    const partnerId = new Map(prow.map((p) => [p.nev_kulcs, p.id]));
    const { rows: jrow } = await client.query<{ id: string; kod: string }>(`select id::text, kod from fuvar_jarmuvek`);
    const jarmuId = new Map(jrow.map((j) => [j.kod, j.id]));
    const { rows: szrow } = await client.query<{ id: string; szamlaszam: string; kelt: string | null }>(
      `select id::text, szamlaszam, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla`
    ).catch(() => ({ rows: [] as { id: string; szamlaszam: string; kelt: string | null }[] }));
    const szamlaBySzam = new Map(szrow.map((r) => [r.szamlaszam, r]));

    // Hibák: a meglévő nyitott sorokat nem duplikáljuk.
    for (const h of tervezettHibak(sorok)) {
      await client.query(
        `insert into fuvar_migracio_hiba (megbizas_id, tipus, leiras)
         select $1, $2, $3 where not exists (select 1 from fuvar_migracio_hiba where megbizas_id = $1 and tipus = $2 and rendezve_at is null)`,
        [h.megbizas_id, h.tipus, h.leiras]
      );
    }

    for (const s of sorok) {
      const jelleg = s.tipus === "sajat" ? "ber" : "sajat";
      const e = regiHelyUjAllapot(s, ma, most);
      const pid = s.megrendelo?.trim() ? partnerId.get(normalizaltCegKulcs(s.megrendelo)) ?? null : null;
      const jarmu = s.jarmu?.trim() ? resolveJarmu(s.jarmu) : null;
      const jid = jarmu ? jarmuId.get(jarmu.rendszamok[0] ?? "JANI") ?? null : null;
      const kanon = s.pozicioszam?.trim() || s.reise_id?.trim() || null;
      const masod = kanon && s.pozicioszam?.trim() && s.reise_id?.trim() ? s.reise_id.trim() : null;

      // Megállók — csak ha még nincsenek (idempotens).
      if (s.megallo_db === 0) {
        const felrakok = bontsMegallokra(s.felrako);
        const lerakok = bontsMegallokra(s.lerako);
        const lista = [
          ...felrakok.map((cim) => ({ tipus: "felrako", cim, nap: s.datum_iso, tol: s.felrakas_ablak_tol, ig: s.felrakas_ablak_ig })),
          ...lerakok.map((cim) => ({ tipus: "lerako", cim, nap: s.lerakas_datum_iso ?? s.datum_iso, tol: s.lerakas_ablak_tol, ig: s.lerakas_ablak_ig })),
        ];
        const megalloIds: string[] = [];
        for (let i = 0; i < lista.length; i++) {
          const m = lista[i];
          const { rows } = await client.query<{ id: string }>(
            `insert into fuvar_megallok (megbizas_id, sorszam, tipus, cim_nyers, tervezett_nap, ablak_tol, ablak_ig)
             values ($1, $2, $3, $4, $5, $6, $7) returning id::text`,
            [s.id, i + 1, m.tipus, m.cim, m.nap, m.tol, m.ig]
          );
          megalloIds.push(rows[0].id);
        }
        // Régi indexes állapot-sorok → megálló (S11), a tények átmásolva.
        const { rows: all } = await client.query<{
          id: string; megallo_index: number; kesz: boolean; kesz_at: string | null; kesz_by: string | null; gps_erkezes: string | null; gps_tavozas: string | null;
        }>(`select id::text, megallo_index, kesz, kesz_at::text, kesz_by, gps_erkezes::text, gps_tavozas::text from fuvar_megallo_allapot where fuvar_id = $1 and megallo_id is null`, [s.id]);
        for (const a of all) {
          const mid = megalloIds[a.megallo_index];
          if (!mid) {
            await client.query(
              `insert into fuvar_migracio_hiba (megbizas_id, tipus, leiras, reszletek)
               select $1, 'orphan_megallo_index', $2, $3 where not exists (select 1 from fuvar_migracio_hiba where megbizas_id = $1 and tipus = 'orphan_megallo_index' and rendezve_at is null)`,
              [s.id, `megallo_index ${a.megallo_index}, de csak ${megalloIds.length} megálló van`, JSON.stringify({ megallo_allapot_id: a.id })]
            );
            continue;
          }
          await client.query(`update fuvar_megallo_allapot set megallo_id = $2 where id = $1`, [a.id, mid]);
          await client.query(
            `update fuvar_megallok set sofor_kesz_at = case when $2 then coalesce($3::timestamptz, sofor_kesz_at) else sofor_kesz_at end,
               sofor_kesz_by = case when $2 then coalesce($4, sofor_kesz_by) else sofor_kesz_by end,
               gps_erkezes = coalesce($5::timestamptz, gps_erkezes), gps_tavozas = coalesce($6::timestamptz, gps_tavozas)
             where id = $1`,
            [mid, a.kesz, a.kesz_at, a.kesz_by, a.gps_erkezes, a.gps_tavozas]
          );
        }
      }

      // Megbízás oszlopai (csak amit még nem töltöttünk — allapot NULL).
      if (s.allapot === null) {
        const elhagyva = becsultElhagyvaAt(s);
        const allapotAt =
          e.allapot === "lezart" || e.allapot === "postazva" ? (s.postazva_at ? new Date(s.postazva_at) : elhagyva.at)
          : e.allapot === "teljesitve" || e.allapot === "szamlazhato" || e.allapot === "szamlazva" ? elhagyva.at
          : new Date(s.created_at);
        await client.query(
          `update fuvar_megbizasok set allapot = $2, allapot_at = $3, partner_id = coalesce(partner_id, $4), jarmu_id = coalesce(jarmu_id, $5),
             hivatkozas_kanonikus = coalesce(hivatkozas_kanonikus, $6), hivatkozas_nyers = coalesce(hivatkozas_nyers, $7),
             hivatkozas_masodlagos = coalesce(hivatkozas_masodlagos, $8), hivatkozas_nincs = $9, jelleg = $10
           where id = $1`,
          [s.id, e.allapot, allapotAt, pid, jid, kanon, s.pozicioszam ?? s.reise_id, masod, s.pozicioszam_nincs, jelleg]
        );
        await client.query(
          `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, mikor, reszletek)
           values ($1, 'migracio', null, $2, 'migracio', 'fuvarozas2-backfill', now(), $3)`,
          [s.id, e.allapot, JSON.stringify({ regi_hely: e.regiHely, indok: e.indok, elhagyva_becsult: elhagyva.becsult, torolt: s.statusz === "torolt" })]
        );
        irt++;
      }

      // Elszámolás-sor (bér, teljesített vagy tovább).
      if (jelleg === "ber" && ["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"].includes(e.allapot)) {
        const sz = s.szamla_szam ? szamlaBySzam.get(s.szamla_szam) ?? null : null;
        await client.query(
          `insert into fuvar_elszamolas (megbizas_id, papirok_beerkeztek_at, szamla_id, szamla_szam, szamla_kelte, fizetesi_hatarido_nap, postazasi_cim, postazva_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (megbizas_id) do nothing`,
          [s.id, s.papirok_beerkeztek_at, sz?.id ?? null, s.szamla_szam || null, sz?.kelt ?? null, s.fizetesi_hatarido_nap, s.postazasi_cim, s.postazva ? s.postazva_at ?? becsultElhagyvaAt(s).at : null]
        );
      }
    }
    await client.query("commit");
    console.log(`Beírva: ${irt} sor kapott allapot-ot (a többi már megvolt).`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  if (mod === "check") {
    const gond = await check();
    process.exitCode = gond === 0 ? 0 : 1;
  } else if (mod === "apply") {
    await apply();
    const gond = await check();
    process.exitCode = gond === 0 ? 0 : 1;
  } else {
    await dry();
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
