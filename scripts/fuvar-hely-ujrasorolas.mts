// EGYSZERI újrafeldolgozó + bármikor újrafuttatható ellenőrzés: minden
// meglévő fuvar_megbizasok sort a KÖZÖS besorolási szabály
// (lib/fuvarozas/fuvar-hely.ts — getFuvarHelye / FUVAR_HELY_SQL) szerint
// sorol be, kilistázza, mi van ma rossz helyen, és jóváhagyás után rendbe
// teszi az adatot. A db/archiv-backlog-cleanup.sql mintájára: először
// szárazon, aztán írva.
//
// Futtatás (DATABASE_URL a környezetből, pl. Railway "railway run"):
//   npx tsx scripts/fuvar-hely-ujrasorolas.mts            — száraz futás: csak listáz
//   npx tsx scripts/fuvar-hely-ujrasorolas.mts --apply    — a listázott javításokat beírja
//   npx tsx scripts/fuvar-hely-ujrasorolas.mts --check    — csak az ellenőrző számokat írja ki (cél: 0)
//
// MIT JAVÍT (és miért csak ezt):
//   A) postazva = true, de postazva_at üres → postazva_at pótlása. A besorolás
//      a hiányzó postazva_at-ot "régen postázott"-nak veszi (tehát archív),
//      de az Archív fül `postazva_at desc` rendezésében ezek a sorok a lista
//      végére esnek, és bármely későbbi, szigorúbb szabály örökre a Számla/
//      Postán tarthatná őket. A fuvar saját napjára (lerakás, ha nincs,
//      felrakás) áll be, mint a db/archiv-backlog-cleanup.sql-nél, hogy az
//      Archív időrendje ne boruljon fel.
//   B) tipus = 'sajat' (Bér fuvarok fül), van számlaszáma, de nincs
//      Teljesítve-nek jelölve és a lerakás dátuma még nem múlt el → teljesitve
//      = true. A régi besorolás ezeket a "folyamatban" listán tartotta,
//      pedig számla csak kész munkáról készül. Az új szabály a számlaszám
//      miatt már magától a Számla/Postára teszi, a jelölő pótlása azért kell,
//      hogy a többi fogyasztó (GPS-teljesítés-figyelés, papír-nyugtázás) is
//      késznek lássa, és ne függjön a szabály egy részletétől.
//   Semmi mást nem ír: dátumot, számlaszámot, postázást NEM hamisít.
//
// MIT ELLENŐRIZ (--check, és minden futás végén):
//   1. a SQL-szabály (FUVAR_HELY_SQL) és a TS-tükör (getFuvarHelye) minden
//      soron ugyanazt adja-e — ha nem, a két megvalósítás szétcsúszott;
//   2. hány sor van A) állapotban;
//   3. hány sor van B) állapotban.
//   A cél mindháromnál 0.

import { pool, query } from "@/lib/db";
import {
  FUVAR_HELY_CIMKE,
  FUVAR_HELY_SQL,
  getFuvarHelye,
  type FuvarHely,
  type FuvarHelyBemenet,
} from "@/lib/fuvarozas/fuvar-hely";

type Sor = FuvarHelyBemenet & {
  id: string;
  megrendelo: string | null;
  lerako: string;
  teljesitve_at: string | null;
  papirok_beerkeztek_at: string | null;
  hely_sql: FuvarHely;
  hely_regi: FuvarHely;
};

/**
 * A 2026-09-16 ELŐTTI besorolás, szó szerint a régi get*-lekérdezésekből
 * összerakva — csak ahhoz kell, hogy a száraz futás megmutassa, melyik sor
 * költözik fület a közös szabályra való átállással. Amint az adat rendben
 * van, ez a kifejezés érdektelen; nem a termékkód része.
 */
const REGI_HELY_SQL = `(case
  when tipus = 'sajat' and (postazva and coalesce(postazva_at, '-infinity'::timestamptz) <= now() - interval '5 minutes') then 'archiv'
  when tipus = 'sajat' and (teljesitve or coalesce(lerakas_datum, datum) < current_date) then 'szamla_posta'
  when tipus = 'sajat' then 'ber_folyamatban'
  when teljesitve or coalesce(lerakas_datum, datum) < current_date then 'archiv'
  else 'sajat_folyamatban'
end)`;

const POSTAZVA_AT_HIANYZIK_SQL = `(postazva and postazva_at is null)`;
const SZAMLAS_DE_FOLYAMATBAN_SQL = `(tipus = 'sajat' and coalesce(szamla_szam, '') <> '' and not teljesitve and coalesce(lerakas_datum, datum) >= current_date)`;

async function beolvas(): Promise<{ ma: string; sorok: Sor[] }> {
  const [{ ma }] = await query<{ ma: string }>(`select current_date::text as ma`);
  const sorok = await query<Sor>(
    `select id::text, tipus, megrendelo, lerako,
       to_char(datum, 'YYYY-MM-DD') as datum_iso,
       to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas_datum_iso,
       postazva, postazva_at::text, teljesitve, teljesitve_at::text,
       papirok_beerkeztek_at::text, szamla_szam,
       ${FUVAR_HELY_SQL} as hely_sql,
       ${REGI_HELY_SQL} as hely_regi
     from fuvar_megbizasok
     where statusz <> 'torolt'
     order by coalesce(lerakas_datum, datum) desc, id desc`
  );
  return { ma, sorok };
}

function cimke(h: FuvarHely) {
  return FUVAR_HELY_CIMKE[h];
}

function sorLeiras(s: Sor) {
  const nap = s.lerakas_datum_iso ?? s.datum_iso;
  return `#${s.id.padStart(5)}  ${nap}  ${(s.megrendelo ?? "(nincs megrendelő)").slice(0, 28).padEnd(28)}  → ${s.lerako.slice(0, 20)}`;
}

async function ellenorzes(): Promise<number> {
  const { ma, sorok } = await beolvas();
  const most = new Date();
  const eltero = sorok.filter((s) => getFuvarHelye(s, ma, most) !== s.hely_sql);
  const [{ a, b }] = await query<{ a: string; b: string }>(
    `select count(*) filter (where ${POSTAZVA_AT_HIANYZIK_SQL}) as a,
            count(*) filter (where ${SZAMLAS_DE_FOLYAMATBAN_SQL}) as b
     from fuvar_megbizasok where statusz <> 'torolt'`
  );
  console.log("\n== ELLENŐRZÉS (cél: mindhárom 0) ==");
  console.log(`  SQL-szabály és TS-tükör eltér:              ${eltero.length}`);
  console.log(`  postázva, de postazva_at hiányzik (A):      ${a}`);
  console.log(`  van számlaszám, mégis folyamatban (B):      ${b}`);
  for (const s of eltero.slice(0, 20)) {
    console.log(`    ELTÉRÉS ${sorLeiras(s)}  SQL=${s.hely_sql} TS=${getFuvarHelye(s, ma, most)}`);
  }
  return eltero.length + Number(a) + Number(b);
}

async function szarazFutas(): Promise<{ koltozik: Sor[]; javitasA: Sor[]; javitasB: Sor[] }> {
  const { ma, sorok } = await beolvas();
  const most = new Date();

  const osszes: Record<FuvarHely, number> = { ber_folyamatban: 0, sajat_folyamatban: 0, szamla_posta: 0, archiv: 0 };
  for (const s of sorok) osszes[getFuvarHelye(s, ma, most)]++;

  const koltozik = sorok.filter((s) => s.hely_regi !== s.hely_sql);
  const javitasA = sorok.filter((s) => s.postazva && s.postazva_at === null);
  const javitasB = sorok.filter(
    (s) =>
      s.tipus === "sajat" &&
      (s.szamla_szam ?? "") !== "" &&
      !s.teljesitve &&
      (s.lerakas_datum_iso ?? s.datum_iso) >= ma
  );

  console.log(`Mai nap az adatbázis szerint: ${ma}. Élő (nem törölt) sor: ${sorok.length}.`);
  console.log("\n== Hol vannak a sorok a közös szabály szerint ==");
  for (const h of Object.keys(osszes) as FuvarHely[]) {
    console.log(`  ${cimke(h).padEnd(30)} ${osszes[h]}`);
  }

  console.log(`\n== Fület vált a közös szabályra átállással: ${koltozik.length} sor ==`);
  console.log("   (jelenlegi hely → helyes hely)");
  for (const s of koltozik) {
    console.log(`  ${sorLeiras(s)}   ${cimke(s.hely_regi)} → ${cimke(s.hely_sql)}`);
  }

  console.log(`\n== A) postazva_at pótlása: ${javitasA.length} sor ==`);
  for (const s of javitasA) console.log(`  ${sorLeiras(s)}   számla: ${s.szamla_szam ?? "-"}`);

  console.log(`\n== B) teljesitve pótlása (van számlaszám, jövőbeli/mai dátum): ${javitasB.length} sor ==`);
  for (const s of javitasB) console.log(`  ${sorLeiras(s)}   számla: ${s.szamla_szam}`);

  return { koltozik, javitasA, javitasB };
}

async function alkalmaz(vart: { javitasA: Sor[]; javitasB: Sor[] }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const a = await client.query(
      `update fuvar_megbizasok
       set postazva_at = coalesce(lerakas_datum, datum)::timestamptz
       where statusz <> 'torolt' and ${POSTAZVA_AT_HIANYZIK_SQL}
       returning id`
    );
    const b = await client.query(
      `update fuvar_megbizasok
       set teljesitve = true,
           teljesitve_at = coalesce(papirok_beerkeztek_at, postazva_at, now())
       where statusz <> 'torolt' and ${SZAMLAS_DE_FOLYAMATBAN_SQL}
       returning id`
    );
    // A száraz futás és az írás közt más session is módosíthatott — ha a
    // sorszám nem egyezik azzal, amit a listában átnéztél, nem írunk.
    if (a.rowCount !== vart.javitasA.length || b.rowCount !== vart.javitasB.length) {
      await client.query("rollback");
      console.error(
        `\nROLLBACK: a módosított sorok száma eltér a listázottól (A: ${a.rowCount} vs ${vart.javitasA.length}, B: ${b.rowCount} vs ${vart.javitasB.length}). Futtasd újra szárazon.`
      );
      process.exitCode = 1;
      return;
    }
    await client.query("commit");
    console.log(`\nBEÍRVA: A) ${a.rowCount} sor postazva_at, B) ${b.rowCount} sor teljesitve.`);
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    console.error("Hiányzik a DATABASE_URL.");
    process.exit(1);
  }
  try {
    if (args.has("--check")) {
      const hibak = await ellenorzes();
      process.exitCode = hibak === 0 ? 0 : 1;
      return;
    }
    const talalt = await szarazFutas();
    if (args.has("--apply")) {
      await alkalmaz(talalt);
    } else {
      console.log("\nSZÁRAZ FUTÁS — semmi nem íródott. Írás: --apply");
    }
    const hibak = await ellenorzes();
    if (hibak !== 0 && args.has("--apply")) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
