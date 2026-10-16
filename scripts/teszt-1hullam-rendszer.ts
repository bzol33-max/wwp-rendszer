// Az 1. hullám A része (docs/fuvarozas-1-hullam-terv.md): a GPS-figyelő
// döntőfüggvénye (figyelendo), a GPS-egészség szabálya (gpsEgeszseg), és a
// 043-as migráció (elszámolás-sor pótlás + trigger, rendszer_eletjel) —
// az utóbbi csak TESZT_DATABASE_URL-lel, visszagörgetett tranzakcióban.
// Futtatás: npx tsx scripts/teszt-1hullam-rendszer.ts
//           TESZT_DATABASE_URL=postgres://postgres@localhost:5433/wwp npx tsx scripts/teszt-1hullam-rendszer.ts

import pg from "pg";
import { figyelendo } from "@/lib/fuvarozas/figyeles-dontes";
import { gpsEgeszseg } from "@/lib/fuvarozas2/rendszer-alap";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// ── 1. figyelendo ──────────────────────────────────────────────────────────
type F = Parameters<typeof figyelendo>[0];
const f = (x: Partial<F>): F => ({ nyitott: false, lezarvaOraja: null, vanNyitottTavozas: false, szamlazva: false, ...x });
{
  eq("nyitott fuvar → figyelendő", figyelendo(f({ nyitott: true })), true);
  eq("nyitott, nyitott távozással → figyelendő", figyelendo(f({ nyitott: true, vanNyitottTavozas: true })), true);
  eq("nyitott + számlázott → figyelendő (a 'nyitott' ág az első)", figyelendo(f({ nyitott: true, szamlazva: true })), true);
  eq("számlázott, lezárva 1 órája, nyitott távozással → nem", figyelendo(f({ szamlazva: true, lezarvaOraja: 1, vanNyitottTavozas: true })), false);
  eq("lezárva 2 órája + nyitott távozás → figyelendő", figyelendo(f({ lezarvaOraja: 2, vanNyitottTavozas: true })), true);
  eq("lezárva most (0 óra) + nyitott távozás → figyelendő", figyelendo(f({ lezarvaOraja: 0, vanNyitottTavozas: true })), true);
  eq("lezárva 23,99 órája + nyitott távozás → figyelendő", figyelendo(f({ lezarvaOraja: 23.99, vanNyitottTavozas: true })), true);
  eq("lezárva PONTOSAN 24 órája + nyitott távozás → nem (< 24 a feltétel)", figyelendo(f({ lezarvaOraja: 24, vanNyitottTavozas: true })), false);
  eq("lezárva 30 órája + nyitott távozás → nem", figyelendo(f({ lezarvaOraja: 30, vanNyitottTavozas: true })), false);
  eq("lezárva 2 órája, NINCS nyitott távozás → nem", figyelendo(f({ lezarvaOraja: 2 })), false);
  eq("lezarvaOraja null + nyitott távozás → nem", figyelendo(f({ lezarvaOraja: null, vanNyitottTavozas: true })), false);
  eq("lezarvaOraja null, semmi → nem", figyelendo(f({})), false);
}

// ── 2. gpsEgeszseg ─────────────────────────────────────────────────────────
type G = Parameters<typeof gpsEgeszseg>[0];
const g = (x: Partial<G>): G => ({ eletjelKorPerc: 1, aktivMegalloDb: 3, utolsoIrasOra: 1, ...x });
const szint = (x: Partial<G>) => gpsEgeszseg(g(x)).szint;
{
  const nincsEletjel = gpsEgeszseg(g({ eletjelKorPerc: null }));
  eq("életjel null → gond", nincsEletjel.szint, "gond");
  all(`életjel null → szöveg: „a figyelő nem fut” (${nincsEletjel.szoveg})`, nincsEletjel.szoveg.includes("a figyelő nem fut"));
  const regi = gpsEgeszseg(g({ eletjelKorPerc: 16 }));
  eq("életjel 16 perce → gond", regi.szint, "gond");
  all(`életjel 16 perce → szöveg: „a figyelő nem fut” (${regi.szoveg})`, regi.szoveg.includes("a figyelő nem fut"));
  eq("életjel 15,01 perce → gond", szint({ eletjelKorPerc: 15.01 }), "gond");
  eq("életjel PONTOSAN 15 perce → nem gond (> 15 a feltétel) → rendben", szint({ eletjelKorPerc: 15 }), "rendben");
  eq("életjel 0 perce → rendben", szint({ eletjelKorPerc: 0 }), "rendben");
  eq("életjel null + 0 aktív megálló → gond (az életjel az első)", szint({ eletjelKorPerc: null, aktivMegalloDb: 0 }), "gond");
  eq("életjel 20 perce + 0 aktív megálló → gond", szint({ eletjelKorPerc: 20, aktivMegalloDb: 0 }), "gond");

  const nincsAktiv = gpsEgeszseg(g({ aktivMegalloDb: 0, utolsoIrasOra: 100 }));
  eq("0 aktív megálló, 100 órája nincs írás → rendben", nincsAktiv.szint, "rendben");
  all(`0 aktív megálló → szöveg: „nincs aktív megálló” (${nincsAktiv.szoveg})`, nincsAktiv.szoveg.includes("nincs aktív megálló"));
  eq("0 aktív megálló, írás null → rendben", szint({ aktivMegalloDb: 0, utolsoIrasOra: null }), "rendben");

  const regiIras = gpsEgeszseg(g({ utolsoIrasOra: 13 }));
  eq("aktív megálló, utolsó írás 13 órája → figyelj", regiIras.szint, "figyelj");
  all("figyelj → nem üres szöveg", typeof regiIras.szoveg === "string" && regiIras.szoveg.trim().length > 0);
  eq("aktív megálló, utolsó írás 12,01 órája → figyelj", szint({ utolsoIrasOra: 12.01 }), "figyelj");
  eq("aktív megálló, utolsó írás PONTOSAN 12 órája → rendben (> 12 a feltétel)", szint({ utolsoIrasOra: 12 }), "rendben");
  eq("aktív megálló, utolsó írás 1 órája → rendben", szint({ utolsoIrasOra: 1 }), "rendben");
  eq("aktív megálló, utolsó írás null → rendben (null > 12 nem igaz)", szint({ utolsoIrasOra: null }), "rendben");
  const jo = gpsEgeszseg(g({}));
  all("rendben → nem üres szöveg", typeof jo.szoveg === "string" && jo.szoveg.trim().length > 0);
}

// ── 3. 043 migráció (csak valódi adatbázissal) ─────────────────────────────
async function dbTeszt(url: string) {
  const kliens = new pg.Client({ connectionString: url });
  await kliens.connect();
  try {
    const { rows: tabla } = await kliens.query<{ van: boolean }>(`select to_regclass('public.rendszer_eletjel') is not null as van`);
    if (!tabla[0].van) {
      console.log("  043 még nincs alkalmazva (nincs rendszer_eletjel tábla) — a DB-rész kimarad");
      bad++;
      return;
    }
    ok++;

    // A pótlás (egyszeri insert … select) után nincs elszámolás-sor nélküli, lezárt bérfuvar.
    const { rows: hiany } = await kliens.query<{ db: number }>(
      `select count(*)::int as db from fuvar_megbizasok m
        where m.jelleg = 'ber' and m.torolt_at is null
          and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
          and not exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id)`
    );
    eq("043 után nincs elszámolás-sor nélküli teljesített bérfuvar", hiany[0].db, 0);

    await kliens.query("begin");
    // jelleg='ber' (bérfuvar) a DB-ben tipus='sajat' — a kettős-írás trigger ebből állítja a jelleg-et.
    const ujFuvar = async (lerako: string, allapot: string | null, tipus: "sajat" | "ber" = "sajat", datum = "2099-01-15") => {
      const { rows } = await kliens.query<{ id: string }>(
        `insert into fuvar_megbizasok (tipus, jelleg, datum, felrako, lerako, ellenorzott, allapot)
         values ($1, case $1 when 'sajat' then 'ber' else 'sajat' end, $2, 'TESZT-1H felrakó', $3, true, $4)
         returning id::text`,
        [tipus, datum, lerako, allapot]
      );
      return rows[0].id;
    };
    const elszDb = async (id: string) =>
      (await kliens.query<{ db: number }>(`select count(*)::int as db from fuvar_elszamolas where megbizas_id = $1`, [id])).rows[0].db;

    // a) INSERT közvetlenül 'teljesitve' állapotban
    const a = await ujFuvar("TESZT-1H-a", "teljesitve");
    const { rows: ja } = await kliens.query<{ jelleg: string; allapot: string }>(`select jelleg, allapot from fuvar_megbizasok where id = $1`, [a]);
    eq("a) a beszúrt sor bérfuvar 'teljesitve' állapotban", ja[0], { jelleg: "ber", allapot: "teljesitve" });
    eq("a) INSERT 'teljesitve' → a trigger létrehozza az elszámolás-sort", await elszDb(a), 1);

    // b) UPDATE allapot: tervezett → teljesitve → szamlazhato → szamlazva (nincs duplikáció)
    const b = await ujFuvar("TESZT-1H-b", "tervezett");
    eq("b) 'tervezett' bérfuvarnak még nincs elszámolás-sora", await elszDb(b), 0);
    await kliens.query(`update fuvar_megbizasok set allapot = 'teljesitve' where id = $1`, [b]);
    eq("b) allapot → 'teljesitve' után van elszámolás-sor", await elszDb(b), 1);
    await kliens.query(`update fuvar_megbizasok set allapot = 'szamlazhato' where id = $1`, [b]);
    await kliens.query(`update fuvar_megbizasok set allapot = 'szamlazva' where id = $1`, [b]);
    await kliens.query(`update fuvar_megbizasok set allapot = 'szamlazva', megjegyzes = 'x' where id = $1`, [b]);
    eq("b) további allapot-írások után is pontosan 1 sor (nincs duplikáció)", await elszDb(b), 1);

    // c) A valós út: az app `teljesitve = true`-t ír, az allapot-ot a BEFORE trigger
    //    (fuvar_megbizasok_allapot_koveto) állítja. Egy `AFTER UPDATE OF allapot`
    //    trigger ilyenkor NEM sül el (a Postgres csak a SET-listát nézi) — a 043
    //    triggerének ezt az utat is le kell fednie.
    const c = await ujFuvar("TESZT-1H-c", null, "sajat", "2099-01-15");
    await kliens.query(`update fuvar_megbizasok set teljesitve = true, teljesitve_at = now() where id = $1`, [c]);
    const { rows: jc } = await kliens.query<{ allapot: string }>(`select allapot from fuvar_megbizasok where id = $1`, [c]);
    eq("c) teljesitve = true → a követő trigger 'teljesitve'-re állítja", jc[0].allapot, "teljesitve");
    eq("c) teljesitve = true (allapot nincs a SET-ben) → mégis van elszámolás-sor", await elszDb(c), 1);

    // d) meglévő elszámolás-sort nem ír felül (on conflict do nothing)
    const d = await ujFuvar("TESZT-1H-d", "tervezett");
    await kliens.query(`insert into fuvar_elszamolas (megbizas_id, postazasi_cim) values ($1, 'TESZT-CIM')`, [d]);
    await kliens.query(`update fuvar_megbizasok set allapot = 'teljesitve' where id = $1`, [d]);
    const { rows: jd } = await kliens.query<{ postazasi_cim: string | null }>(`select postazasi_cim from fuvar_elszamolas where megbizas_id = $1`, [d]);
    eq("d) meglévő elszámolás-sor: továbbra is 1 sor, a mezői érintetlenek", jd, [{ postazasi_cim: "TESZT-CIM" }]);

    // e) negatívak: saját fuvar (jelleg='sajat'), törölt bérfuvar, nyitott állapot
    const e1 = await ujFuvar("TESZT-1H-e1", "teljesitve", "ber");
    eq("e) saját fuvar (jelleg='sajat') 'teljesitve' → nincs elszámolás-sor", await elszDb(e1), 0);
    const e2 = await ujFuvar("TESZT-1H-e2", "tervezett");
    await kliens.query(`update fuvar_megbizasok set statusz = 'torolt', torolt_at = now(), torolt_by = 'teszt' where id = $1`, [e2]);
    await kliens.query(`update fuvar_megbizasok set allapot = 'teljesitve' where id = $1`, [e2]);
    eq("e) törölt bérfuvar 'teljesitve' → nincs elszámolás-sor", await elszDb(e2), 0);
    const e3 = await ujFuvar("TESZT-1H-e3", "folyamatban");
    eq("e) 'folyamatban' bérfuvar → nincs elszámolás-sor", await elszDb(e3), 0);

    // f) rendszer_eletjel upsert
    const kulcs = "teszt-1hullam";
    const upsert = (adat: object) =>
      kliens.query(
        `insert into rendszer_eletjel (kulcs, utolso_kor, adat) values ($1, now(), $2::jsonb)
         on conflict (kulcs) do update set utolso_kor = excluded.utolso_kor, adat = excluded.adat`,
        [kulcs, JSON.stringify(adat)]
      );
    await upsert({ vizsgalt: 3, hibak: 0 });
    await kliens.query(`update rendszer_eletjel set utolso_kor = now() - interval '1 hour' where kulcs = $1`, [kulcs]);
    await upsert({ vizsgalt: 5, hibak: 1 });
    const { rows: ej } = await kliens.query<{ db: number; adat: unknown; friss: boolean }>(
      `select count(*) over ()::int as db, adat, utolso_kor > now() - interval '1 minute' as friss from rendszer_eletjel where kulcs = $1`,
      [kulcs]
    );
    eq("f) rendszer_eletjel: kulcsonként 1 sor az upsert után", ej.length, 1);
    const adat = (ej[0]?.adat ?? {}) as Record<string, unknown>;
    eq("f) rendszer_eletjel: az adat a legutolsó", { vizsgalt: adat.vizsgalt, hibak: adat.hibak }, { vizsgalt: 5, hibak: 1 });
    eq("f) rendszer_eletjel: utolso_kor frissült", ej[0]?.friss, true);
  } finally {
    await kliens.query("rollback").catch(() => {});
    await kliens.end();
  }
}

async function main() {
  const url = process.env.TESZT_DATABASE_URL;
  if (!url) {
    console.log("  (043 DB-teszt kihagyva: nincs TESZT_DATABASE_URL)");
    return;
  }
  await dbTeszt(url);
}

main().then(
  () => {
    console.log(`\n1. hullám — rendszer teszt: ${ok} rendben, ${bad} hiba`);
    if (bad > 0) process.exit(1);
  },
  (e) => {
    console.error(e);
    console.log(`\n1. hullám — rendszer teszt: ${ok} rendben, ${bad + 1} hiba`);
    process.exit(1);
  }
);
