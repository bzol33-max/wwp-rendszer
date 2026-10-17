// Kezdőlap · Napi napló (C6 terv, 2026-10-17): egy nap / hét / hónap
// összefoglalója a meglévő táblákból — felvásárlás (Nyíregyháza), telepi
// be- és kiszállítás, számlák, nyitott feladatok, szabadságok.
//
// Szándékosan NEM "use server": ezek a függvények csak a szerveroldali
// kezdőlapról hívódnak, a jogosultságot a lap ellenőrzi blokkonként
// (session.can(...).view), így kliens felől nem érhetők el akcióként.
// Új adatforrást nem hoz létre, csak olvas.

import { query } from "@/lib/db";

export type NaploIdoszak = "nap" | "het" | "ho";

export type NaploHatarok = {
  idoszak: NaploIdoszak;
  nap: string;
  ma: string;
  kezdet: string;
  veg: string;
  elozo: string;
  kovetkezo: string;
};

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Az URL-ből jövő nap és időszak → érvényes határok (Budapest szerinti naptári nap). */
export async function naploHatarok(napBe?: string, idoszakBe?: string): Promise<NaploHatarok> {
  const idoszak: NaploIdoszak = idoszakBe === "het" || idoszakBe === "ho" ? idoszakBe : "nap";
  const nap = napBe && DATUM.test(napBe) ? napBe : null;
  const [r] = await query<{ nap: string; ma: string; kezdet: string; veg: string; elozo: string; kovetkezo: string }>(
    `with n as (select coalesce($2::date, (now() at time zone 'Europe/Budapest')::date) as d)
     select d::text as nap,
            ((now() at time zone 'Europe/Budapest')::date)::text as ma,
            (case $1 when 'nap' then d when 'het' then date_trunc('week', d)::date else date_trunc('month', d)::date end)::text as kezdet,
            (case $1 when 'nap' then d
                     when 'het' then (date_trunc('week', d) + interval '6 days')::date
                     else (date_trunc('month', d) + interval '1 month' - interval '1 day')::date end)::text as veg,
            (case $1 when 'nap' then d - 1 when 'het' then d - 7 else (d - interval '1 month')::date end)::text as elozo,
            (case $1 when 'nap' then d + 1 when 'het' then d + 7 else (d + interval '1 month')::date end)::text as kovetkezo
       from n`,
    [idoszak, nap]
  );
  return { idoszak, ...r };
}

// ---------------------------------------------------------------------------
// Felvásárlás — Nyíregyháza
// ---------------------------------------------------------------------------

export type FelvasarlasNaplo = {
  tipusok: { tipus: string; db: number; osszeg: number; atlag: number }[];
  ossz: { db: number; osszeg: number };
  keszpenz: number;
  atutalas: number;
  eladok: number;
  kassza: { nyito: number; zaro: number; be: number; felvasarlas: number; egyeb: number };
  /** Kifizetésre váró (nyitvatartáson túl leadott) tételek — időszaktól függetlenül, a mostani állapot. */
  fuggo: { db: number; osszeg: number; eladok: string[] };
};

export async function getFelvasarlasNaplo(h: NaploHatarok): Promise<FelvasarlasNaplo> {
  const [tipusok, fej, kassza, fuggo] = await Promise.all([
    query<{ tipus: string; db: number; osszeg: number }>(
      `select t.name as tipus, sum(p.qty)::int as db, sum(p.total)::bigint::float8 as osszeg
         from nyiregyhaza_purchases p join pallet_types t on t.id = p.type_id
        where (p.created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date
        group by t.name, t.sort_order
        order by t.sort_order nulls last, t.name`,
      [h.kezdet, h.veg]
    ),
    query<{ keszpenz: number; atutalas: number; eladok: number }>(
      `select coalesce(sum(total) filter (where payment_method <> 'atutalas'), 0)::float8 as keszpenz,
              coalesce(sum(total) filter (where payment_method = 'atutalas'), 0)::float8 as atutalas,
              count(distinct lower(trim(seller)))::int as eladok
         from nyiregyhaza_purchases
        where (created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date`,
      [h.kezdet, h.veg]
    ),
    query<{ nyito: number; zaro: number; be: number; felvasarlas: number; egyeb: number }>(
      `select coalesce(sum(amount) filter (where (created_at at time zone 'Europe/Budapest')::date < $1::date), 0)::float8 as nyito,
              coalesce(sum(amount) filter (where (created_at at time zone 'Europe/Budapest')::date <= $2::date), 0)::float8 as zaro,
              coalesce(sum(amount) filter (where amount > 0 and (created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date), 0)::float8 as be,
              coalesce(-sum(amount) filter (where amount < 0 and category = 'felvasarlas' and (created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date), 0)::float8 as felvasarlas,
              coalesce(-sum(amount) filter (where amount < 0 and coalesce(category, 'egyeb') <> 'felvasarlas' and (created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date), 0)::float8 as egyeb
         from kassza_movements`,
      [h.kezdet, h.veg]
    ),
    query<{ db: number; osszeg: number; eladok: string[] | null }>(
      `select count(*)::int as db, coalesce(sum(total), 0)::float8 as osszeg,
              array_agg(distinct seller) as eladok
         from nyiregyhaza_purchases where pending and paid_at is null`
    ),
  ]);
  const t = tipusok.map((r) => ({ ...r, atlag: r.db > 0 ? Math.round(r.osszeg / r.db) : 0 }));
  return {
    tipusok: t,
    ossz: { db: t.reduce((s, r) => s + r.db, 0), osszeg: t.reduce((s, r) => s + r.osszeg, 0) },
    keszpenz: fej[0]?.keszpenz ?? 0,
    atutalas: fej[0]?.atutalas ?? 0,
    eladok: fej[0]?.eladok ?? 0,
    kassza: kassza[0] ?? { nyito: 0, zaro: 0, be: 0, felvasarlas: 0, egyeb: 0 },
    fuggo: { db: fuggo[0]?.db ?? 0, osszeg: fuggo[0]?.osszeg ?? 0, eladok: (fuggo[0]?.eladok ?? []).filter(Boolean) },
  };
}

// ---------------------------------------------------------------------------
// Telepek — be- és kiszállítás
// ---------------------------------------------------------------------------

export type TelepNaplo = {
  telep: string;
  nyito: number;
  be: number;
  ki: number;
  zaro: number;
  tipusok: { tipus: string; nyito: number; be: number; ki: number; zaro: number }[];
  /** Elfogadásra váró, ide tartó telepközi mozgatás (most). */
  utonIde: number;
};

export type MozgasSor = {
  ido: string;
  telep: string;
  irany: "be" | "ki" | "mozgatas" | "mozgatas_be";
  tipus: string;
  db: number;
  partner: string | null;
  masikTelep: string | null;
  elfogadva: boolean;
};

export type TelepekNaplo = { telepek: TelepNaplo[]; mozgasok: MozgasSor[]; mozgasDb: number };

// Ugyanaz a szabály, mint a Készlet modul getStock-jában: a "mozgatas_be" csak
// az átvétel (elfogadva_at) után számít a cél telep készletébe; a "Csere"
// tranzakciótípus, nem készlet.
const HATAS = `case when m.direction = 'be' then m.qty
                    when m.direction = 'mozgatas_be' and m.elfogadva_at is not null then m.qty
                    when m.direction in ('ki', 'mozgatas') then -m.qty else 0 end`;
const HATAS_NAP = `((case when m.direction = 'mozgatas_be' then m.elfogadva_at else m.created_at end) at time zone 'Europe/Budapest')::date`;

export async function getTelepekNaplo(h: NaploHatarok): Promise<TelepekNaplo> {
  const [sorok, uton, mozgasok, mozgasDb] = await Promise.all([
    query<{ telep: string; tipus: string; nyito: number; be: number; ki: number; zaro: number }>(
      `select s.name as telep, t.name as tipus,
              coalesce(sum(${HATAS}) filter (where ${HATAS_NAP} < $1::date), 0)::int as nyito,
              coalesce(sum(${HATAS}) filter (where ${HATAS} > 0 and ${HATAS_NAP} between $1::date and $2::date), 0)::int as be,
              coalesce(-sum(${HATAS}) filter (where ${HATAS} < 0 and ${HATAS_NAP} between $1::date and $2::date), 0)::int as ki,
              coalesce(sum(${HATAS}) filter (where ${HATAS_NAP} <= $2::date), 0)::int as zaro
         from keszlet_movements m
         join sites s on s.id = m.site_id
         join pallet_types t on t.id = m.type_id
        where t.name <> 'Csere'
        group by s.id, s.name, t.name, t.sort_order
        order by s.id, t.sort_order nulls last, t.name`,
      [h.kezdet, h.veg]
    ),
    query<{ telep: string; db: number }>(
      `select s.name as telep, coalesce(sum(m.qty), 0)::int as db
         from keszlet_movements m join sites s on s.id = m.site_id
        where m.direction = 'mozgatas_be' and m.elfogadva_at is null
        group by s.name`
    ),
    query<MozgasSor>(
      `select to_char(m.created_at at time zone 'Europe/Budapest', 'MM.DD. HH24:MI') as ido,
              s.name as telep, m.direction as irany, t.name as tipus, m.qty as db,
              nullif(trim(m.partner), '') as partner, ts.name as "masikTelep",
              (m.direction <> 'mozgatas_be' or m.elfogadva_at is not null) as elfogadva
         from keszlet_movements m
         join sites s on s.id = m.site_id
         join pallet_types t on t.id = m.type_id
         left join sites ts on ts.id = m.target_site_id
        where t.name <> 'Csere'
          and (m.created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date
          and m.purchase_id is null
          and m.direction <> 'mozgatas_be'
        order by m.created_at desc
        limit 40`,
      [h.kezdet, h.veg]
    ),
    query<{ db: number }>(
      `select count(*)::int as db from keszlet_movements m join pallet_types t on t.id = m.type_id
        where t.name <> 'Csere' and m.purchase_id is null and m.direction <> 'mozgatas_be'
          and (m.created_at at time zone 'Europe/Budapest')::date between $1::date and $2::date`,
      [h.kezdet, h.veg]
    ),
  ]);
  const utonMap = new Map(uton.map((u) => [u.telep, u.db]));
  const telepMap = new Map<string, TelepNaplo>();
  for (const r of sorok) {
    let tp = telepMap.get(r.telep);
    if (!tp) {
      tp = { telep: r.telep, nyito: 0, be: 0, ki: 0, zaro: 0, tipusok: [], utonIde: utonMap.get(r.telep) ?? 0 };
      telepMap.set(r.telep, tp);
    }
    tp.nyito += r.nyito; tp.be += r.be; tp.ki += r.ki; tp.zaro += r.zaro;
    if (r.nyito || r.be || r.ki || r.zaro) tp.tipusok.push({ tipus: r.tipus, nyito: r.nyito, be: r.be, ki: r.ki, zaro: r.zaro });
  }
  return { telepek: [...telepMap.values()], mozgasok, mozgasDb: mozgasDb[0]?.db ?? 0 };
}

// ---------------------------------------------------------------------------
// Számlák (a szamla tükörtábla — a Számlázz.hu-t csak a Számlák modul kérdezi)
// ---------------------------------------------------------------------------

export type SzamlaNaplo = {
  kiallitva: { db: number; osszeg: number };
  befolyt: { db: number; osszeg: number };
  esedekes: { db: number; osszeg: number };
  lejart: { db: number; osszeg: number; sorok: { vevo: string; szamlaszam: string; osszeg: number; nap: number }[] };
};

export async function getSzamlaNaplo(h: NaploHatarok): Promise<SzamlaNaplo> {
  const [r] = await query<{
    kidb: number; kiossz: number; bedb: number; beossz: number; esdb: number; esossz: number; ledb: number; leossz: number;
  }>(
    `select count(*) filter (where kiallitas_datum between $1::date and $2::date)::int as kidb,
            coalesce(sum(brutto) filter (where kiallitas_datum between $1::date and $2::date), 0)::float8 as kiossz,
            count(*) filter (where fizetve and (fizetve_datum at time zone 'Europe/Budapest')::date between $1::date and $2::date)::int as bedb,
            coalesce(sum(brutto) filter (where fizetve and (fizetve_datum at time zone 'Europe/Budapest')::date between $1::date and $2::date), 0)::float8 as beossz,
            count(*) filter (where not fizetve and fizetesi_hatarido between $1::date and $2::date)::int as esdb,
            coalesce(sum(brutto) filter (where not fizetve and fizetesi_hatarido between $1::date and $2::date), 0)::float8 as esossz,
            count(*) filter (where not fizetve and fizetesi_hatarido < $3::date)::int as ledb,
            coalesce(sum(brutto) filter (where not fizetve and fizetesi_hatarido < $3::date), 0)::float8 as leossz
       from szamla
      where not sztorno and not sztornozva and penznem = 'HUF'`,
    [h.kezdet, h.veg, h.ma]
  );
  const lejartSorok = await query<{ vevo: string; szamlaszam: string; osszeg: number; nap: number }>(
    `select vevo_nev as vevo, szamlaszam, brutto::float8 as osszeg, ($1::date - fizetesi_hatarido)::int as nap
       from szamla
      where not sztorno and not sztornozva and not fizetve and fizetesi_hatarido < $1::date
      order by fizetesi_hatarido asc limit 6`,
    [h.ma]
  );
  return {
    kiallitva: { db: r?.kidb ?? 0, osszeg: r?.kiossz ?? 0 },
    befolyt: { db: r?.bedb ?? 0, osszeg: r?.beossz ?? 0 },
    esedekes: { db: r?.esdb ?? 0, osszeg: r?.esossz ?? 0 },
    lejart: { db: r?.ledb ?? 0, osszeg: r?.leossz ?? 0, sorok: lejartSorok },
  };
}

// ---------------------------------------------------------------------------
// Feladatok és szabadság (Jelenléti modul táblái)
// ---------------------------------------------------------------------------

export type FeladatSor = { id: string; leiras: string; nap: string; telep: string; surgosseg: number; keso: boolean };

export async function getNyitottFeladatok(h: NaploHatarok): Promise<{ sorok: FeladatSor[]; db: number }> {
  const [sorok, db] = await Promise.all([
    query<FeladatSor>(
      `select f.id::text, f.description as leiras, f.task_date::text as nap, s.name as telep,
              f.urgency as surgosseg, (f.task_date < $1::date) as keso
         from feladatok f join sites s on s.id = f.site_id
        where not f.done and f.task_date <= $2::date
        order by f.urgency asc, f.task_date asc, f.id desc
        limit 8`,
      [h.ma, h.veg]
    ),
    query<{ db: number }>(`select count(*)::int as db from feladatok where not done and task_date <= $1::date`, [h.veg]),
  ]);
  return { sorok, db: db[0]?.db ?? 0 };
}

export type SzabadsagSor = { id: string; nev: string; tol: string; ig: string; tipus: "szabadsag" | "beteg"; allapot: "kert" | "jovahagyva" };

/** Szabadság és betegség a nap körül: a hónap eleje és a nap + 14 nap között (a mini naptárhoz és a listához). */
export async function getSzabadsagok(h: NaploHatarok): Promise<SzabadsagSor[]> {
  return query<SzabadsagSor>(
    `select i.id::text, a.name as nev, i.tol::text, i.ig::text, i.tipus, i.allapot
       from szabadsag_igenyek i join alkalmazottak a on a.id = i.employee_id
      where i.allapot in ('kert', 'jovahagyva')
        and i.ig >= date_trunc('month', $1::date)::date
        and i.tol <= greatest(($1::date + 14), (date_trunc('month', $1::date) + interval '1 month' - interval '1 day')::date)
      order by i.tol, a.name`,
    [h.nap]
  );
}
