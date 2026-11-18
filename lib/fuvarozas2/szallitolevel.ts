// Számlázz.hu-s szállítólevél ↔ saját fuvar párosítás — betöltés és írás.
// A döntés: lib/fuvarozas2/szallitolevel-parositas.ts. A szállítóleveleket a
// Számlák modul húzza be a `szallitolevel_import` táblába (lib/szamlak/poll.ts);
// itt csak ebből a táblából dolgozunk, a Számlázz.hu-t nem kérdezzük.
//
// NEM "use server": a számla-szinkron (rendszer-kontextusban) hívja.

import { query, withTransaction } from "@/lib/db";
import { parositSzallitoleveleket } from "@/lib/fuvarozas2/szallitolevel-parositas";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";

/** `napok`: hány napra visszamenőleg (az óránkénti kör 60; a kézi pótlás júliustól többet kér). */
export async function szinkronizalSzallitoleveleket(napok = 60): Promise<number> {
  const szallitolevelek = await query<{ bizonylatszam: string; kelt: string; vevo: string | null; rendszam: string | null }>(
    `select bizonylatszam, to_char(kelt, 'YYYY-MM-DD') as kelt, vevo, rendszam
     from szallitolevel_import
     where parositas_allapot = 'nyitott' and megbizas_id is null and kelt >= current_date - $1::int`,
    [napok]
  );
  if (szallitolevelek.length === 0) return 0;

  // Saját fuvar = jelleg 'sajat'. Az előkészítés
  // alattiak is: a szállítólevelet előre állítják ki.
  const fuvarok = await query<{ id: string; datum: string; jarmu_rendszam: string | null; kinek: string | null; hova: string | null; lezart_nap: string | null }>(
    `select m.id::text, to_char(m.datum, 'YYYY-MM-DD') as datum,
       coalesce(j.kod, nullif(m.elokeszites_jarmu, ''), nullif(m.jarmu, '')) as jarmu_rendszam,
       coalesce(p.nev, m.megrendelo) as kinek, m.lerako as hova,
       case when m.allapot = 'lezart' then to_char(m.allapot_at, 'YYYY-MM-DD') end as lezart_nap
     from fuvar_megbizasok m
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join fuvar_partnerek p on p.id = m.partner_id
     where m.jelleg = 'sajat' and m.torolt_at is null and m.datum >= current_date - $1::int
       and not exists (select 1 from szallitolevel_import s where s.megbizas_id = m.id and s.parositas_allapot = 'parositva')`,
    [napok]
  );

  const parok = parositSzallitoleveleket(
    fuvarok.map((f) => ({ id: f.id, datum: f.datum, jarmuRendszam: f.jarmu_rendszam, kinek: f.kinek, hova: f.hova, lezartNap: f.lezart_nap })),
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

/** A saját fuvar felrakója, ha a szállítólevél nem mondja: a szakolyi telephely (a kézi saját fuvarok így vannak). */
const SAJAT_FELRAKO = "Szakoly, Rákóczi utca 26";

export type SzlPotlasSor = { id: string | null; bizonylatszam: string; kelt: string; vevo: string | null; partner: string | null; raklap: number | null; tetelek: string | null; jarmu: string | null; ok: string };

/**
 * Saját fuvarok a szállítólevelekből (2026-11-18, tulajdonos: „júliustól tedd be a
 * saját fuvarokat, szállító számmal, típussal, dbszámmal”). Előbb a meglévő
 * saját fuvarokhoz párosít (ugyanaz a döntés, mint az óránkénti körben, csak
 * hosszabb ablakkal), aztán ami nyitott maradt és `tolIso` óta kelt, ahhoz
 * saját fuvart hoz létre: dátum = kelt, vevő = partner (névváltozatokkal is),
 * kocsi a rendszámból, áru = tételek, mennyiség = raklap db, kulső azonosító =
 * a szállítólevél száma, állapot lezárt (a múltban történt). Próba módban csak
 * a tervet adja vissza.
 */
export async function sajatFuvarokSzallitolevelekbol(tolIso: string, alkalmaz: boolean, ki: string): Promise<{ parositva: number; sorok: SzlPotlasSor[] }> {
  const ma = new Date();
  const tol = new Date(`${tolIso}T00:00:00Z`);
  const napok = Math.max(60, Math.ceil((ma.getTime() - tol.getTime()) / 86_400_000) + 7);
  const parositva = alkalmaz ? await szinkronizalSzallitoleveleket(napok) : 0;

  const nyitott = await query<{ bizonylatszam: string; kelt: string; vevo: string | null; szallitasi_cim: string | null; rendszam: string | null; raklap_db: number | null; tetelek: { nev: string; mennyiseg: number | null }[] | null }>(
    `select bizonylatszam, to_char(kelt, 'YYYY-MM-DD') as kelt, vevo, szallitasi_cim, rendszam, raklap_db, tetelek
     from szallitolevel_import
     where parositas_allapot = 'nyitott' and megbizas_id is null and kelt >= $1::date
     order by kelt, bizonylatszam`,
    [tolIso]
  );
  const partnerek = await query<{ id: string; nev: string; nevvaltozatok: string[]; szekhely: string | null; postazasi_cim: string | null }>(
    `select id::text, nev, nevvaltozatok, szekhely, postazasi_cim from fuvar_partnerek`
  );
  // A meglévő, szállítólevél nélküli saját fuvarok a kezdő nap -7-től: ha a
  // vevőhöz ±7 napon belül van ilyen, nem hozunk létre újat (a párosítás ±3
  // napja nem fogta meg, de lehet ugyanaz az út) — kézi döntés.
  const meglevo = await query<{ id: string; datum: string; partner_id: string | null; megrendelo: string | null; lerako: string | null }>(
    `select m.id::text, to_char(m.datum, 'YYYY-MM-DD') as datum, m.partner_id::text, m.megrendelo, m.lerako
     from fuvar_megbizasok m
     where m.jelleg = 'sajat' and m.torolt_at is null and m.datum >= $1::date - 7
       and not exists (select 1 from szallitolevel_import s where s.megbizas_id = m.id and s.parositas_allapot = 'parositva')`,
    [tolIso]
  );
  const napSzam = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86_400_000);
  const sorok: SzlPotlasSor[] = [];
  for (const sz of nyitott) {
    const partner = sz.vevo ? partnerek.find((p) => partnerEgyezik(sz.vevo!, [p.nev, ...p.nevvaltozatok])) ?? null : null;
    const jarmu = findJarmuInSzoveg(sz.rendszam);
    const tetelek = (sz.tetelek ?? []).map((t) => `${t.nev}${t.mennyiseg != null ? ` ${t.mennyiseg} db` : ""}`).join(", ") || null;
    const sor: SzlPotlasSor = { id: null, bizonylatszam: sz.bizonylatszam, kelt: sz.kelt, vevo: sz.vevo, partner: partner?.nev ?? null, raklap: sz.raklap_db, tetelek, jarmu: jarmu?.kod ?? null, ok: "" };
    if (!sz.vevo) { sor.ok = "kihagyva: nincs vevő a szállítólevélen"; sorok.push(sor); continue; }
    // Saját kocsi nélkül nem a mi fuvarunk (a vevő vitte el, vagy más fuvarozó) — nem lesz belőle saját fuvar.
    if (!jarmu) { sor.ok = "kihagyva: nincs saját kocsi a szállítólevélen (a vevő vitte?)"; sorok.push(sor); continue; }
    const hasonlo = meglevo.filter((m) => Math.abs(napSzam(m.datum) - napSzam(sz.kelt)) <= 7
      && ((partner && m.partner_id === partner.id) || (m.megrendelo && partnerEgyezik(m.megrendelo, [sz.vevo!, ...(partner ? [partner.nev, ...partner.nevvaltozatok] : [])])) || (m.lerako && partnerEgyezik(m.lerako, [sz.vevo!]))));
    if (hasonlo.length > 0) { sor.ok = `kihagyva: van hasonló saját fuvar ±7 napon belül (#${hasonlo.map((m) => m.id).join(", #")}) — kézzel párosítsd`; sorok.push(sor); continue; }
    if (!alkalmaz) { sor.ok = "létrehozható"; sorok.push(sor); continue; }
    const hova = sz.szallitasi_cim?.trim() || partner?.postazasi_cim || partner?.szekhely || sz.vevo;
    const aru = (sz.tetelek ?? []).map((t) => t.nev).filter(Boolean).join(", ") || null;
    try {
      const id = await withTransaction(async (tx) => {
        await tx(`select set_config('fuvarozas2.uj_kod', '1', true)`);
        const [uj] = await tx<{ id: string }>(
          `insert into fuvar_megbizasok (tipus, datum, felrako, lerako, megrendelo, partner_id, aru, mennyiseg, jarmu, forras, ellenorzott, statusz, allapot, allapot_at, kulso_azonosito, megjegyzes, created_by)
           values ('ber', $1, $2, $3, $4, $5, $6, $7, $8, 'szallitolevel', true, 'lezarva', 'lezart', $1::date, $9, $10, $11)
           returning id::text`,
          [sz.kelt, SAJAT_FELRAKO, hova, partner?.nev ?? sz.vevo, partner?.id ?? null, aru, sz.raklap_db ? `${sz.raklap_db} db` : null, jarmu?.kod ?? null,
           sz.bizonylatszam, `Szállítólevélből pótolva (${sz.bizonylatszam}): ${tetelek ?? ""}`.trim(), ki]
        );
        await tx(
          `update szallitolevel_import set megbizas_id = $2, parositas_allapot = 'parositva' where bizonylatszam = $1 and parositas_allapot = 'nyitott'`,
          [sz.bizonylatszam, uj.id]
        );
        await tx(
          `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'letrehozva', 'szamla_szinkron', $2, $3)`,
          [uj.id, ki, JSON.stringify({ szallitolevel: sz.bizonylatszam, raklap_db: sz.raklap_db, potlas: true })]
        );
        return uj.id;
      });
      await frissitsdFuvarozas2Modellt(id);
      sor.id = id;
      sor.ok = "létrehozva";
      console.log(`[szallitolevel] pótlás: #${id} ← ${sz.bizonylatszam} (${sz.vevo}, ${sz.raklap_db ?? "?"} db)`);
    } catch (err) {
      sor.ok = `hiba: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    }
    sorok.push(sor);
  }
  return { parositva, sorok };
}
