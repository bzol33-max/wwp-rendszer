/** Megálló-olvasók régi/új összevetése. Csak SELECT-eket futtat. (2026-10-06) */
import pg from "pg";

const { Pool } = pg;

// A régi SQL-ek változtatás előtt a git HEAD-ből kerültek ide; a kulcsok a
// visszaadott TS-mezőneveket követik, a stop az index/sorszám páros.
const olvasok: { nev: string; regi: string; uj: string }[] = [
  { nev: "napi-fuvarok/getMegalloAllapotok",
    regi: `select fuvar_id::text as fuvar_id, megallo_index, kesz, kesz_by, kesz_at, kezi_erkezes, varakozas_kezdete, varakozas_vege from fuvar_megallo_allapot where fuvar_id=any($1::bigint[]) and (kesz or varakozas_kezdete is not null or kezi_erkezes is not null)`,
    uj: `select megbizas_id::text as fuvar_id, sorszam-1 as megallo_index, sofor_kesz_at is not null as kesz, sofor_kesz_by as kesz_by, sofor_kesz_at as kesz_at, sofor_megerkezett_at as kezi_erkezes, varakozas_kezdete, varakozas_vege from fuvar_megallok where megbizas_id=any($1::bigint[]) and (sofor_kesz_at is not null or varakozas_kezdete is not null or sofor_megerkezett_at is not null)` },
  { nev: "megbizasok/lerakas-tenyleges",
    regi: `select fuvar_id::text, max(coalesce(kesz_at,gps_erkezes,kezi_erkezes))::text as ertek from fuvar_megallo_allapot where fuvar_id=any($1::bigint[]) group by fuvar_id`,
    uj: `select megbizas_id::text as fuvar_id, max(coalesce(sofor_kesz_at,gps_erkezes,sofor_megerkezett_at))::text as ertek from fuvar_megallok where megbizas_id=any($1::bigint[]) group by megbizas_id` },
  { nev: "megbizasok/varakozas-perc",
    regi: `select fuvar_id::text, coalesce(sum(extract(epoch from (coalesce(varakozas_vege,now())-varakozas_kezdete))/60),0)::int as ertek from fuvar_megallo_allapot where fuvar_id=any($1::bigint[]) and varakozas_kezdete is not null group by fuvar_id`,
    uj: `select megbizas_id::text as fuvar_id, coalesce(sum(extract(epoch from (coalesce(varakozas_vege,now())-varakozas_kezdete))/60),0)::int as ertek from fuvar_megallok where megbizas_id=any($1::bigint[]) and varakozas_kezdete is not null group by megbizas_id` },
  { nev: "sofor/visszavonas-for-update",
    regi: `select fuvar_id::text, megallo_index, kesz, kesz_at from fuvar_megallo_allapot where fuvar_id=any($1::bigint[])`,
    uj: `select megbizas_id::text as fuvar_id, sorszam-1 as megallo_index, sofor_kesz_at is not null as kesz, sofor_kesz_at as kesz_at from fuvar_megallok where megbizas_id=any($1::bigint[])` },
  { nev: "sofor/erkezes-es-helyszin",
    regi: `select fuvar_id::text, megallo_index, kezi_erkezes from fuvar_megallo_allapot where fuvar_id=any($1::bigint[]) and kezi_erkezes is not null`,
    uj: `select megbizas_id::text as fuvar_id, sorszam-1 as megallo_index, sofor_megerkezett_at as kezi_erkezes from fuvar_megallok where megbizas_id=any($1::bigint[]) and sofor_megerkezett_at is not null` },
  { nev: "sofor/nemreg-lezart",
    regi: `select f.id::text, a.megallo_index, a.kesz_at from fuvar_megbizasok f join fuvar_megallo_allapot a on a.fuvar_id=f.id and a.kesz where f.id=any($1::bigint[]) and f.teljesitve and f.allapot='teljesitve' and f.statusz<>'torolt' and f.torolt_at is null and coalesce(f.szamla_szam,'')='' and not exists(select 1 from fuvar_dokumentumok d where d.fuvar_id=f.id and d.tipus='fuvarlevel') and a.kesz_at>now()-interval '12 hours' and abs(extract(epoch from (f.teljesitve_at-a.kesz_at)))<120`,
    uj: `select f.id::text, a.sorszam-1 as megallo_index, a.sofor_kesz_at as kesz_at from fuvar_megbizasok f join fuvar_megallok a on a.megbizas_id=f.id and a.sofor_kesz_at is not null where f.id=any($1::bigint[]) and f.teljesitve and f.allapot='teljesitve' and f.statusz<>'torolt' and f.torolt_at is null and coalesce(f.szamla_szam,'')='' and not exists(select 1 from fuvar_dokumentumok d where d.fuvar_id=f.id and d.tipus='fuvarlevel') and a.sofor_kesz_at>now()-interval '12 hours' and abs(extract(epoch from (f.teljesitve_at-a.sofor_kesz_at)))<120` },
  { nev: "attekintes/kezdo-ido",
    regi: `select fuvar_id::text, megallo_index, kesz_at, kezi_erkezes from fuvar_megallo_allapot where fuvar_id=any($1::bigint[]) and (kesz_at is not null or kezi_erkezes is not null)`,
    uj: `select megbizas_id::text as fuvar_id, sorszam-1 as megallo_index, sofor_kesz_at as kesz_at, sofor_megerkezett_at as kezi_erkezes from fuvar_megallok where megbizas_id=any($1::bigint[]) and (sofor_kesz_at is not null or sofor_megerkezett_at is not null)` },
  { nev: "drive-sync/tenyfeltetel",
    regi: `select m.id::text as fuvar_id, exists(select 1 from fuvar_megallo_allapot a where a.fuvar_id=m.id and (a.kesz or a.kezi_erkezes is not null)) as ertek from fuvar_megbizasok m where m.id=any($1::bigint[])`,
    uj: `select m.id::text as fuvar_id, exists(select 1 from fuvar_megallok a where a.megbizas_id=m.id and (a.sofor_kesz_at is not null or a.sofor_megerkezett_at is not null)) as ertek from fuvar_megbizasok m where m.id=any($1::bigint[])` },
  { nev: "megbizasok/visszavehetoseg",
    // A régi akció két tábla összegét nézte (HEAD akciok.ts visszaveszem): a régi
    // tábla kész/érkezés + az új tábla GPS/kész.
    regi: `select m.id::text as fuvar_id, (
             (select count(*) from fuvar_megallo_allapot a where a.fuvar_id = m.id and (a.kesz or a.kezi_erkezes is not null)) +
             (select count(*) from fuvar_megallok g where g.megbizas_id = m.id and (g.gps_erkezes is not null or g.sofor_kesz_at is not null))
           ) > 0 as ertek from fuvar_megbizasok m where m.id=any($1::bigint[])`,
    uj: `select m.id::text as fuvar_id, exists(select 1 from fuvar_megallok g where g.megbizas_id = m.id and (g.sofor_kesz_at is not null or g.sofor_megerkezett_at is not null or g.gps_erkezes is not null)) as ertek from fuvar_megbizasok m where m.id=any($1::bigint[])` },
];

let varatlan = 0;
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Hiányzik a DATABASE_URL környezeti változó.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fuvarIds = (await pool.query<{ id: string }>(
    `select id::text from fuvar_megbizasok
      where coalesce(lerakas_datum, datum) >= current_date - 60
        and coalesce(datum, current_date) <= current_date + 365`
  )).rows.map((r) => r.id);
try {
  for (const o of olvasok) {
    const [regi, uj] = await Promise.all([
      pool.query(o.regi, [fuvarIds]), pool.query(o.uj, [fuvarIds]),
    ]);
    const kulcs = (r: Record<string, unknown>) => `${r.fuvar_id ?? r.id}/${r.megallo_index ?? ""}`;
    const a = new Map(regi.rows.map((r) => [kulcs(r), r]));
    const b = new Map(uj.rows.map((r) => [kulcs(r), r]));
    const kulcsok = new Set([...a.keys(), ...b.keys()]);
    let egyezik = 0; let elter = 0; let vart = 0; const peldak: unknown[] = [];
    // Az új tábla minden megállóra ad sort, a régi csak ott, ahol volt tény:
    // a tartalom nélküli sor (minden érték null/false) ugyanaz, mint a hiányzó
    // — a kód allekérdezésben null-t, a visszavonásnál „nem kész”-t lát.
    const ures = (r?: Record<string, unknown>) => !r || Object.entries(r).every(([m, v]) => ["fuvar_id", "id", "megallo_index"].includes(m) || v == null || v === false);
    // Időbélyeg ezredmásodpercre: a régi táblába JS Date (ms) kerül, az újba now() (µs).
    const ms = (v: unknown) => (typeof v === "string" && /^\d{4}-\d\d-\d\d[ T]\d/.test(v) ? new Date(v.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1")).getTime() : v instanceof Date ? v.getTime() : v);
    for (const k of kulcsok) {
      let x = a.get(k); let y = b.get(k);
      if (ures(x) && ures(y)) { egyezik++; continue; }
      if (!x && ures(y)) y = undefined; if (!y && ures(x)) x = undefined;
      // A kesz_by csak kész megállónál számít (a felület is csak ott írja ki);
      // a régi táblában a „Megérkeztem” is beírta a nevet kész nélkül.
      if (x && !x.kesz && "kesz_by" in x) x = { ...x, kesz_by: null };
      if (y && !y.kesz && "kesz_by" in y) y = { ...y, kesz_by: null };
      const mezok = new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})].filter((m) => !["fuvar_id", "id", "megallo_index"].includes(m)));
      const elteres = [...mezok].filter((m) => JSON.stringify(ms(x?.[m] ?? null)) !== JSON.stringify(ms(y?.[m] ?? null)));
      if (!x || !y) elteres.push("sor");
      if (!elteres.length) { egyezik++; continue; }
      const vartElteres = elteres.length === 1 && ((!x && y?.kezi_erkezes != null) || (x && !y && x.gps_tavozas != null));
      if (vartElteres) vart++;
      else { elter++; if (peldak.length < 10) peldak.push({ fuvar_id: (x ?? y)?.fuvar_id ?? (x ?? y)?.id, mezok: elteres.map((m) => ({ mezo: m, regi: m === "sor" ? x ?? null : x?.[m] ?? null, uj: m === "sor" ? y ?? null : y?.[m] ?? null })) }); }
    }
    console.log(`${o.nev}: egyező ${egyezik}, eltérő ${elter}, várt eltérés ${vart}`);
    for (const p of peldak) console.log(`  ${JSON.stringify(p)}`);
    varatlan += elter;
  }
} finally { await pool.end(); }
if (varatlan) process.exitCode = 1;
}
main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
