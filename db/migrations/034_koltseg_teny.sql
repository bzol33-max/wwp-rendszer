-- Költségek és tények (5. fázis, 2026-10-10). CSAK ADDITÍV: új oszlopok és
-- új tábla; régi oszlop nem törlődik, nem nevezünk át.
--
-- Minden szám kétféle lehet: TÉNY ('teny' — mért vagy számlázott: Ecofleet
-- km/liter, HU-GO tranzakció, tankolási bizonylat) vagy BECSLÉS ('becsles' —
-- tárolt HU-GO-kalkuláció, alap fogyasztás × NAV-ár, napi költség aránya).
-- A Kimutatás mindkettőt felirattal mutatja (lib/fuvarozas2/koltseg-szamitas.ts).

-- ---------------------------------------------------------------------------
-- 1. Megbízásonkénti költségsorok: forrás (tény/becslés), menet-hivatkozás,
--    és az óránkénti újraszámolás idempotens kulcsa.
alter table fuvar_megbizas_koltseg
  add column if not exists forras text not null default 'becsles'
    check (forras in ('teny', 'becsles'));
-- A menetterv (fuvar_menet_feladat, 032–033) párhuzamosan készül, ezért itt
-- SZÁNDÉKOSAN nincs idegen kulcs; a kapcsolat a menetterv bevezetése után
-- egy külön migrációban kaphat FK-t.
alter table fuvar_megbizas_koltseg add column if not exists menet_feladat_id bigint;
comment on column fuvar_megbizas_koltseg.menet_feladat_id is
  'A menetterv feladat-sora (fuvar_menet_feladat.id) — FK nélkül, mert a menetterv táblái párhuzamosan készültek (034).';
alter table fuvar_megbizas_koltseg add column if not exists letrehozva_at timestamptz not null default now();
-- A gép által számolt sor (óránkénti kör) — csak ezekre él az egyediség,
-- a kézi tételekből (pl. több várakozási pótdíj) lehet több is.
alter table fuvar_megbizas_koltseg add column if not exists szamitott boolean not null default false;
-- Mennyiség (km, liter) és a számítás részletei (ár, arány, forrás-címke).
alter table fuvar_megbizas_koltseg add column if not exists mennyiseg numeric(12,2);
alter table fuvar_megbizas_koltseg add column if not exists reszletek jsonb;
create unique index if not exists uq_fuvar_megbizas_koltseg_szamitott
  on fuvar_megbizas_koltseg (megbizas_id, tipus, forras) where szamitott;

-- ---------------------------------------------------------------------------
-- 2. Tankolások: az Oplusz-kút bizonylat-értesítője (Gmail-figyelő), kézi
--    rögzítés, vagy import. A tranzakciószám az idempotencia kulcsa.
create table if not exists tankolas (
  id               bigserial primary key,
  jarmu_id         bigint references fuvar_jarmuvek(id),
  rendszam_nyers   text,
  idopont          timestamptz not null,
  liter            numeric(10,2),
  osszeg_ft        numeric(12,2) not null,
  tranzakcio_szam  text not null unique,
  forras           text not null default 'kezi' check (forras in ('oplusz_email', 'kezi', 'import')),
  level_id         text,
  rogzitette       text,
  letrehozva_at    timestamptz not null default now()
);
create index if not exists idx_tankolas_jarmu_idopont on tankolas (jarmu_id, idopont);

-- ---------------------------------------------------------------------------
-- 3. HU-GO útdíj-tranzakciók: a portál-export importjához a megtett km és a
--    nettó összeg (ha az export tartalmazza). A tábla (001) eddig üres volt.
alter table utdij_tranzakcio add column if not exists tav_km numeric(8,2);
alter table utdij_tranzakcio add column if not exists netto_ft integer;
alter table utdij_tranzakcio add column if not exists rendszam_nyers text;
create index if not exists idx_utdij_tranzakcio_idopont on utdij_tranzakcio (idopont);
