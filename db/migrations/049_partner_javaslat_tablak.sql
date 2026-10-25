-- Partner-adat javaslat táblák (audit 2026-10-25, A1).
--
-- Korábban a db/schema.sql-ben voltak, de a fuvar_partnerek táblára
-- hivatkoznak, amit csak a 001_fuvarozas2_sema.sql hoz létre — a schema.sql
-- viszont a migrációk ELŐTT fut, így üres adatbázison a migrate.mjs leállt.
-- Élesben a táblák már léteznek: itt minden 'if not exists', no-op.


-- Partner-adat javaslatok (lib/fuvarozas2/partner-javaslat.ts): a megbízás
-- PDF-jéből (a fejlécet képként is olvasva) és a korábbi számlák vevőcíméből
-- a partner HIÁNYZÓ adataira. Nem írja felül a partnert — ember fogadja el.
create table if not exists fuvar_partner_javaslat (
  id            bigserial primary key,
  partner_id    bigint not null references fuvar_partnerek(id) on delete cascade,
  mezo          text not null check (mezo in ('postazasi_cim', 'szamlazasi_email', 'papir_bekuldesi_hatarido_nap', 'fizetesi_hatarido_nap')),
  ertek         text not null,
  forras        text not null,           -- 'megbizas_pdf' | 'szamla'
  forras_leiras text,                    -- „Megbízás (poz 4173).pdf”, „WLLWR-2026-120”
  megbizas_id   bigint references fuvar_megbizasok(id) on delete set null,
  allapot       text not null default 'nyitott' check (allapot in ('nyitott', 'elfogadva', 'elvetve')),
  letrehozva_at timestamptz not null default now(),
  dontes_at     timestamptz,
  dontes_by     text,
  unique (partner_id, mezo, ertek)
);
create index if not exists idx_fuvar_partner_javaslat_nyitott on fuvar_partner_javaslat (partner_id) where allapot = 'nyitott';

-- Melyik megbízás-PDF-et olvastuk már ki partner-adatért (egyszer fut le iratonként).
create table if not exists fuvar_partner_kiolvasas (
  drive_file_id text primary key,
  partner_id    bigint references fuvar_partnerek(id) on delete cascade,
  megbizas_id   bigint references fuvar_megbizasok(id) on delete set null,
  eredmeny      jsonb,
  hiba          text,
  futott_at     timestamptz not null default now()
);
