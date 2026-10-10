-- Törzsadatok: telephely-pontok, pótkocsik, jármű-kiegészítések, sofőr-profil,
-- jármű-okmányok (2. fázis, 2026-10-10). CSAK ADDITÍV: új táblák és új
-- oszlopok, egyetlen régi oszlop sem törlődik és nem nevezünk át.
--
-- Tulajdonosi döntés (2026-10-10): a flotta 4 kamionos lesz — a 4. jármű a
-- /jarmuvek felületen kerül fel, itt NEM találunk ki rendszámot vagy sort.
-- JANI (DAF XG) rendszám és GPS nélküli, de teljes értékű jármű.

-- ---------------------------------------------------------------------------
-- 1. Telephely-pontok. A `sites` tábla a Készlet modult hajtja (telephelyenkénti
--    készlet) — ezért a szakolyi parkoló NEM lesz új `sites` sor, hanem egy
--    'parkolo' típusú pont a Szakoly telephely alatt.
create table if not exists telephely_pont (
  id             bigserial primary key,
  site_id        smallint references sites(id),
  nev            text not null unique,
  cim            text not null,
  lat            double precision,
  lon            double precision,
  tipus          text not null default 'telephely' check (tipus in ('telephely', 'parkolo', 'raktar')),
  indulasi_pont  boolean not null default false,
  aktiv          boolean not null default true,
  sorrend        integer not null default 0,
  created_at     timestamptz not null default now()
);
-- Egyszerre legfeljebb egy aktív indulási pont (a kalkulátor telephelye).
create unique index if not exists uq_telephely_pont_indulasi
  on telephely_pont ((true)) where indulasi_pont and aktiv;

insert into telephely_pont (site_id, nev, cim, tipus, indulasi_pont, sorrend)
select s.id, v.nev, v.cim, v.tipus, v.indulasi, v.sorrend
from (values
  ('Szakoly',     'Szakoly (telephely)',     'Szakoly, Rákóczi utca 26',   'telephely', true,  1),
  ('Balkány',     'Balkány (telephely)',     'Balkány, Bocskai utca 11',   'telephely', false, 2),
  ('Nyíregyháza', 'Nyíregyháza (telephely)', 'Nyíregyháza, Tünde út 20/A', 'telephely', false, 3),
  ('Szakoly',     'Szakoly (parkoló)',       'Szakoly, Létai utca',        'parkolo',   false, 4)
) as v(site_nev, nev, cim, tipus, indulasi, sorrend)
left join sites s on s.name = v.site_nev
on conflict (nev) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Pótkocsik. Schmitz Mega: 33 raklaphely normál (660 EUR raklap) / 28
--    forgatva (812 EUR raklap).
create table if not exists fuvar_potkocsik (
  id                    bigserial primary key,
  rendszam              text not null unique,
  tipus                 text,
  raklaphely_normal     integer check (raklaphely_normal is null or raklaphely_normal >= 0),
  raklaphely_forgatott  integer check (raklaphely_forgatott is null or raklaphely_forgatott >= 0),
  raklap_db_normal      integer check (raklap_db_normal is null or raklap_db_normal >= 0),
  raklap_db_forgatott   integer check (raklap_db_forgatott is null or raklap_db_forgatott >= 0),
  aktiv                 boolean not null default true,
  megjegyzes            text,
  created_at            timestamptz not null default now()
);

insert into fuvar_potkocsik (rendszam, tipus, raklaphely_normal, raklaphely_forgatott, raklap_db_normal, raklap_db_forgatott)
values
  ('AOTY-474', 'Schmitz Mega', 33, 28, 660, 812),
  ('XZV-926',  'Schmitz Mega', 33, 28, 660, 812)
on conflict (rendszam) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Jármű-kiegészítések (fuvar_jarmuvek, 001-es migráció).
alter table fuvar_jarmuvek add column if not exists potkocsi_id bigint references fuvar_potkocsik(id);
alter table fuvar_jarmuvek add column if not exists euro_osztaly text;
alter table fuvar_jarmuvek add column if not exists hugo_kategoria text default 'J5';
alter table fuvar_jarmuvek add column if not exists ossztomeg_t numeric(5,2);
alter table fuvar_jarmuvek add column if not exists alap_telephely_pont_id bigint references telephely_pont(id);
alter table fuvar_jarmuvek add column if not exists megjegyzes text;
-- A sofőr rövid, a megbízásokon és a felületen használt neve ("Gergő",
-- "Micó") — a törzsadat hivatalos nevéből nem képezhető ("Takács Miklós").
alter table fuvar_jarmuvek add column if not exists sofor_becenev text;

-- JANI legyen meg és aktív (GPS nélkül — ha valaki már bekötötte, marad).
insert into fuvar_jarmuvek (kod, cimke, vontato_rendszam, potkocsi_rendszam, irasvaltozatok, szin, ecofleet_object_id)
values ('JANI', 'DAF XG (Gyártás alatt)', null, null, '{}', 'green', null)
on conflict (kod) do nothing;
update fuvar_jarmuvek set aktiv = true where kod = 'JANI';

update fuvar_jarmuvek set sofor_becenev = v.becenev
from (values ('AOPU-427', 'Gergő'), ('NMZ-492', 'Micó'), ('JANI', 'Jani')) as v(kod, becenev)
where fuvar_jarmuvek.kod = v.kod and fuvar_jarmuvek.sofor_becenev is null;

-- A sofőr-hozzárendelés (001-es migráció) újra, ha akkor még nem volt meg az
-- alkalmazott: a dolgozói bejelentkezés → kocsi összerendelése mostantól a
-- DB-ből (sofor_id) jön, nem a kódbeli névlistából.
update fuvar_jarmuvek j set sofor_id = a.id
from alkalmazottak a
where j.sofor_id is null
  and ((j.kod = 'AOPU-427' and a.name = 'Vadon Gergő')
    or (j.kod = 'NMZ-492' and a.name in ('Takács Micó', 'Takács Miklós')));

update fuvar_jarmuvek set fogyasztas_l_100km = 28 where fogyasztas_l_100km is null;
update fuvar_jarmuvek set hugo_kategoria = 'J5' where hugo_kategoria is null;

update fuvar_jarmuvek j set potkocsi_id = p.id
from fuvar_potkocsik p
where j.potkocsi_id is null
  and ((j.kod = 'AOPU-427' and p.rendszam = 'AOTY-474') or (j.kod = 'NMZ-492' and p.rendszam = 'XZV-926'));

-- Ma minden számítás a szakolyi telephelyről indul — ez lesz az alap.
update fuvar_jarmuvek j set alap_telephely_pont_id = t.id
from telephely_pont t
where j.alap_telephely_pont_id is null and t.nev = 'Szakoly (telephely)';

-- ---------------------------------------------------------------------------
-- 4. Sofőr-profil: a lejáró okmányok dátumai (alkalmazottanként egy sor).
create table if not exists sofor_profil (
  alkalmazott_id     bigint primary key references alkalmazottak(id) on delete cascade,
  jogositvany_lejar  date,
  gki_lejar          date,
  tachokartya_szam   text,
  tachokartya_lejar  date,
  adr_lejar          date,
  megjegyzes         text,
  frissitve_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Jármű- és pótkocsi-okmányok lejárattal. Pontosan az egyikhez tartozik.
--    dokumentum_id: későbbi irat-tárhoz (szándékosan még idegen kulcs nélkül).
create table if not exists jarmu_okmany (
  id             bigserial primary key,
  jarmu_id       bigint references fuvar_jarmuvek(id) on delete cascade,
  potkocsi_id    bigint references fuvar_potkocsik(id) on delete cascade,
  tipus          text not null check (tipus in ('kgfb', 'casco', 'arufuvarozoi', 'muszaki', 'lizing', 'tacho_kalibralas', 'egyeb')),
  szam           text,
  partner        text,
  lejarat        date,
  dokumentum_id  bigint,
  megjegyzes     text,
  created_at     timestamptz not null default now(),
  constraint jarmu_okmany_egy_targy check ((jarmu_id is null) <> (potkocsi_id is null))
);
create index if not exists idx_jarmu_okmany_lejarat on jarmu_okmany (lejarat);
