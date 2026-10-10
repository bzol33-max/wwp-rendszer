-- Optimalizáló javaslatok (4. fázis, 2026-10-10). CSAK ADDITÍV: egy új tábla.
-- Egy fájl = egy tranzakció (scripts/migrate.mjs nyitja).
--
-- A lib/menet/optimalizalo.ts CSAK JAVASOL: egy kocsi napjára jobb sorrendet
-- ('sorrend'), vagy egy bejövő bérfuvarra kocsit és helyet ('hozzarendeles').
-- A javaslat 'nyitott', amíg ember nem dönt; az elfogadás a meglévő
-- átrendezés-úton (fuvar_menet verzió, indok, menet_esemeny napló) megy —
-- jóváhagyott menetet a gép magától SOHA nem ír át. Ha a bemenet (a munkák,
-- az ablakok, a sorrend, a menet verziója) változik, a nyitott javaslat
-- 'elavult' lesz (bemenet_ujjlenyomat).

create table if not exists optimalizalo_javaslat (
  id                   bigserial primary key,
  menet_id             bigint references fuvar_menet(id) on delete set null,
  jarmu_id             bigint references fuvar_jarmuvek(id),
  nap                  date not null,
  tipus                text not null check (tipus in ('sorrend', 'hozzarendeles')),
  bemenet_ujjlenyomat  text not null,
  -- A javasolt megbízás-sorrend / megbízás → kocsi (+ hely), és a mostani terv.
  javasolt             jsonb not null,
  -- A célfüggvény tagjai Ft-ban (uzemanyag, utdij, napi, keses_buntetes,
  -- varakozas_buntetes, hazaut, sajat_ertek, osszesen) a javaslatra és a
  -- mostani tervre (alap).
  celfuggveny          jsonb not null,
  megtakaritas_ft      numeric(12, 2),
  figyelmeztetesek     jsonb not null default '[]'::jsonb,
  allapot              text not null default 'nyitott'
                       check (allapot in ('nyitott', 'elfogadva', 'elutasitva', 'elavult')),
  dontotte             text,
  dontes_at            timestamptz,
  letrehozva_at        timestamptz not null default now()
);

create index if not exists idx_optimalizalo_javaslat_menet on optimalizalo_javaslat (menet_id, allapot);
create index if not exists idx_optimalizalo_javaslat_jarmu_nap on optimalizalo_javaslat (jarmu_id, nap, allapot);
-- Egy menetre típusonként legfeljebb egy nyitott javaslat.
create unique index if not exists uq_optimalizalo_javaslat_nyitott
  on optimalizalo_javaslat (menet_id, tipus) where allapot = 'nyitott' and menet_id is not null;

comment on table optimalizalo_javaslat is
  'Az optimalizáló javaslatai (lib/menet/optimalizalo.ts) — csak javaslat; elfogadás a menet átrendezés-útján (033).';
