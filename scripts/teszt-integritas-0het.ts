// A 0. heti integritás-javítások tesztje (docs/ecofleet-telemetria-terv.md 4. pont):
// kalibráció-gyorsítótár döntése, jarmu_id szerkesztéskor, és a 042-es
// számlázott-fuvar törlésvédelem (az utóbbi csak TESZT_DATABASE_URL-lel).
// Futtatás: npx tsx scripts/teszt-integritas-0het.ts
//           TESZT_DATABASE_URL=postgres://postgres@localhost:5433/wwp npx tsx scripts/teszt-integritas-0het.ts
//
// A döntőfüggvények külön tiszta fájlban vannak (nem az actions.ts /
// akciok.ts-ben), mert azok "server-only" / "use server" modulok, amelyek
// tsx alatt nem importálhatók (DB, next/cache, server-only).

import pg from "pg";
import { kalibracioGyorsitotarazhato } from "@/lib/fuvarozas/kalibracio-dontes";
import { ujJarmuId } from "@/lib/megbizasok/jarmu-dontes";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// ── 1. kalibracioGyorsitotarazhato ─────────────────────────────────────────
eq("0 minta → nem gyorsítótárazható", kalibracioGyorsitotarazhato(0, false), false);
eq("hiba volt → nem gyorsítótárazható", kalibracioGyorsitotarazhato(5, true), false);
eq("0 minta + hiba → nem", kalibracioGyorsitotarazhato(0, true), false);
eq("5 minta, hiba nélkül → igen", kalibracioGyorsitotarazhato(5, false), true);
eq("1 minta, hiba nélkül → igen", kalibracioGyorsitotarazhato(1, false), true);

// ── 2. ujJarmuId ───────────────────────────────────────────────────────────
{
  const r = ujJarmuId(7, "NMZ-492", "NMZ-492", null);
  eq("változatlan kocsi-szöveg, nem oldható fel → régi jarmu_id marad", r, { jarmuId: 7, figyelmeztetes: null });
}
{
  const r = ujJarmuId(7, "NMZ-492", "NMZ-492", 7);
  eq("változatlan kocsi-szöveg, feloldva ugyanarra", r, { jarmuId: 7, figyelmeztetes: null });
}
{
  const r = ujJarmuId(7, " NMZ-492 ", "NMZ-492", null);
  eq("csak szóközben eltér → változatlannak számít", r, { jarmuId: 7, figyelmeztetes: null });
}
{
  const r = ujJarmuId(7, "NMZ-492", "AOPU-427", 9);
  eq("változott + feloldva → új id, nincs figyelmeztetés", r, { jarmuId: 9, figyelmeztetes: null });
}
{
  const r = ujJarmuId(null, null, "AOPU-427", 9);
  eq("korábban nem volt kocsi, most feloldva → új id", r, { jarmuId: 9, figyelmeztetes: null });
}
{
  const r = ujJarmuId(7, "NMZ-492", "XYZ-999 ismeretlen", null);
  eq("változott + nem oldható fel → null", r.jarmuId, null);
  all("változott + nem oldható fel → van figyelmeztetés", typeof r.figyelmeztetes === "string" && r.figyelmeztetes.length > 0);
}
{
  eq("üres új szöveg → null, figyelmeztetés nélkül", ujJarmuId(7, "NMZ-492", "", null), { jarmuId: null, figyelmeztetes: null });
  eq("null új szöveg → null, figyelmeztetés nélkül", ujJarmuId(7, "NMZ-492", null, null), { jarmuId: null, figyelmeztetes: null });
  eq("csak szóköz új szöveg → null, figyelmeztetés nélkül", ujJarmuId(7, "NMZ-492", "   ", null), { jarmuId: null, figyelmeztetes: null });
}
{
  // Változatlan szöveg, de a feloldás MÁS kocsit talál (pl. törzs-javítás után): a feloldott nyer.
  eq("változatlan szöveg, más feloldás → a feloldott id", ujJarmuId(7, "NMZ-492", "NMZ-492", 8), { jarmuId: 8, figyelmeztetes: null });
}

// ── 3. 042 trigger (csak valódi adatbázissal) ──────────────────────────────
async function dbTeszt(url: string) {
  const kliens = new pg.Client({ connectionString: url });
  await kliens.connect();
  const ujFuvar = async (lerako: string, szamlaSzam: string | null = null) => {
    const { rows } = await kliens.query<{ id: string }>(
      `insert into fuvar_megbizasok (tipus, datum, lerako, szamla_szam) values ('sajat', '2026-10-16', $1, $2) returning id::text`,
      [lerako, szamlaSzam]
    );
    return rows[0].id;
  };
  /** Mentési pontban próbál törölni; hibánál visszagörget a mentési pontig (a fő tranzakció él tovább). */
  const torolhet = async (id: string): Promise<{ sikerult: boolean; hiba: string | null }> => {
    await kliens.query("savepoint torles");
    try {
      const r = await kliens.query(`delete from fuvar_megbizasok where id = $1`, [id]);
      await kliens.query("release savepoint torles");
      return { sikerult: r.rowCount === 1, hiba: null };
    } catch (e) {
      await kliens.query("rollback to savepoint torles");
      return { sikerult: false, hiba: e instanceof Error ? e.message : String(e) };
    }
  };
  try {
    await kliens.query("begin");
    const { rows: trg } = await kliens.query(
      `select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'fuvar_megbizasok'::regclass and not t.tgisinternal
          and (t.tgtype & 8) = 8 and (t.tgtype & 2) = 2` // DELETE + BEFORE
    );
    all("van BEFORE DELETE trigger a fuvar_megbizasok táblán (042 alkalmazva?)", trg.length > 0);

    // a) fuvar_megbizasok.szamla_szam
    const a = await ujFuvar("TESZT-042-a", "TESZT-SZ-1");
    const ra = await torolhet(a);
    eq("szamla_szam-os fuvar fizikai törlése tiltva", ra.sikerult, false);
    all(`a tiltás hibaüzenetet ad (${ra.hiba})`, !!ra.hiba);

    // b) fuvar_megbizasok.kieg_szamla_szamok
    const b = await ujFuvar("TESZT-042-b");
    await kliens.query(`update fuvar_megbizasok set kieg_szamla_szamok = array['TESZT-KIEG-1'] where id = $1`, [b]);
    eq("kiegészítő számlás fuvar fizikai törlése tiltva", (await torolhet(b)).sikerult, false);

    // c) fuvar_elszamolas.szamla_szam
    const c = await ujFuvar("TESZT-042-c");
    await kliens.query(`insert into fuvar_elszamolas (megbizas_id, szamla_szam) values ($1, 'TESZT-ELSZ-1')`, [c]);
    eq("elszámolás-számlás fuvar fizikai törlése tiltva", (await torolhet(c)).sikerult, false);

    // d) fuvar_elszamolas.szamla_id (számlaszám nélkül is)
    const d = await ujFuvar("TESZT-042-d");
    const { rows: sz } = await kliens.query<{ id: string }>(
      `insert into szamla (szamlaszam, vevo_nev, kiallitas_datum, brutto, kategoria)
       values ('TESZT-042-SZAMLA', 'Teszt Kft.', '2026-10-16', 1000, 'fuvar') returning id::text`
    );
    await kliens.query(`insert into fuvar_elszamolas (megbizas_id, szamla_id) values ($1, $2)`, [d, sz[0].id]);
    eq("szamla_id-s fuvar fizikai törlése tiltva", (await torolhet(d)).sikerult, false);

    // e) számla nélküli fuvar (elszámolás-sorral, de üres számlaszámmal is) törölhető
    const e = await ujFuvar("TESZT-042-e");
    eq("számla nélküli fuvar fizikailag törölhető", (await torolhet(e)).sikerult, true);
    const f = await ujFuvar("TESZT-042-f", "");
    await kliens.query(`insert into fuvar_elszamolas (megbizas_id, szamla_szam) values ($1, '')`, [f]);
    eq("üres számlaszámú fuvar fizikailag törölhető", (await torolhet(f)).sikerult, true);

    // g) a soft-delete (statusz='torolt') számlás fuvaron is megy
    const { rowCount } = await kliens.query(
      `update fuvar_megbizasok set statusz = 'torolt', torolt_at = now(), torolt_by = 'teszt' where id = $1`, [a]
    );
    eq("számlás fuvar soft-delete-je engedélyezett", rowCount, 1);
    const { rows: g } = await kliens.query<{ statusz: string; van: boolean }>(
      `select statusz, torolt_at is not null as van from fuvar_megbizasok where id = $1`, [a]
    );
    eq("soft-delete után statusz + torolt_at", g[0], { statusz: "torolt", van: true });
  } finally {
    await kliens.query("rollback").catch(() => {});
    await kliens.end();
  }
}

async function main() {
  const url = process.env.TESZT_DATABASE_URL;
  if (!url) {
    console.log("  (042 trigger DB-teszt kihagyva: nincs TESZT_DATABASE_URL)");
    return;
  }
  await dbTeszt(url);
}

main().then(
  () => {
    console.log(`\nIntegritás (0. hét) teszt: ${ok} rendben, ${bad} hiba`);
    if (bad > 0) process.exit(1);
  },
  (e) => {
    console.error(e);
    console.log(`\nIntegritás (0. hét) teszt: ${ok} rendben, ${bad + 1} hiba`);
    process.exit(1);
  }
);
