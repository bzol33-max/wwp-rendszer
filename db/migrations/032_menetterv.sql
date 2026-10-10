-- Menetterv (3. fázis, 2026-10-10). CSAK ADDITÍV: új táblák, régi oszlop nem
-- változik. Egy fájl = egy tranzakció (scripts/migrate.mjs nyitja).
--
-- Tulajdonosi döntés (2026-10-10): a `fuvar_menet` + `menet_feladat` lesz a
-- kocsinkénti, naponkénti feladat-sorrend EGYETLEN forrása. Amíg egy menet
-- 'javaslat' (a gép számolja óránként), a nézetek a közös napi-sorrend
-- szabályát követik; a jóváhagyott (jovahagyott / folyamatban / lezart) menet
-- sorrendjét követi minden nézet (Ma, GPS lap, sofőr app, GPS-figyelő,
-- Tervezés) — lásd lib/menet/.

-- ---------------------------------------------------------------------------
-- 1. Menet: egy kocsi egy napja.
create table if not exists fuvar_menet (
  id             bigserial primary key,
  jarmu_id       bigint not null references fuvar_jarmuvek(id),
  nap            date not null,
  allapot        text not null default 'javaslat'
                 check (allapot in ('javaslat', 'jovahagyott', 'folyamatban', 'lezart')),
  -- Optimista zár: minden módosítás növeli; a felület a látott verziót küldi vissza.
  verzio         integer not null default 1,
  jovahagyta     text,
  jovahagyva_at  timestamptz,
  letrehozva_at  timestamptz not null default now(),
  modositva_at   timestamptz,
  constraint fuvar_menet_jarmu_nap_uq unique (jarmu_id, nap)
);
create index if not exists idx_fuvar_menet_nap on fuvar_menet (nap, allapot);

-- ---------------------------------------------------------------------------
-- 2. A menet feladatai sorrendben. Az üres pozicionálás külön feladat.
create table if not exists menet_feladat (
  id                          bigserial primary key,
  menet_id                    bigint not null references fuvar_menet(id) on delete cascade,
  sorszam                     integer not null,
  feladat_tipus               text not null
                              check (feladat_tipus in ('sajat_aru', 'berfuvar', 'ures_pozicionalas', 'telephelyi_rakodas', 'varakozas')),
  megbizas_id                 bigint references fuvar_megbizasok(id) on delete set null,
  kiindulo_cim                text,
  cel_cim                     text,
  kiindulo_telephely_pont_id  bigint references telephely_pont(id),
  cel_telephely_pont_id       bigint references telephely_pont(id),
  tervezett_indulas           timestamptz,
  tervezett_erkezes           timestamptz,
  ures_km                     numeric,
  rakott_km                   numeric,
  km_forras                   text check (km_forras is null or km_forras in ('hugo', 'becsles')),
  raklap_db                   integer,
  figyelmeztetesek            jsonb not null default '[]'::jsonb,
  lezarva_at                  timestamptz,
  -- Átrendezéskor a sorszámok egy tranzakción belül cserélődnek — a
  -- tranzakció végén ellenőrzött egyediség ezt engedi.
  constraint menet_feladat_sorszam_uq unique (menet_id, sorszam) deferrable initially deferred,
  constraint menet_feladat_megbizas_uq unique (menet_id, megbizas_id)
);
create index if not exists idx_menet_feladat_megbizas on menet_feladat (megbizas_id) where megbizas_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Menet-napló: jóváhagyás, átrendezés (indokkal, régi/új sorrenddel),
--    feladat-lezárás, visszavonás, javaslat-frissítés.
create table if not exists menet_esemeny (
  id          bigserial primary key,
  menet_id    bigint not null references fuvar_menet(id) on delete cascade,
  esemeny     text not null,
  verzio      integer,
  ki          text,
  mikor       timestamptz not null default now(),
  ok          text,
  reszletek   jsonb not null default '{}'::jsonb
);
create index if not exists idx_menet_esemeny_menet on menet_esemeny (menet_id, mikor desc);

-- ---------------------------------------------------------------------------
-- 4. Mező-szintű változásnapló (ki, mit, mikor, miről mire). Első írói: a
--    bérfuvar-szerkesztő és a kocsi-hozzárendelés (lib/megbizasok/akciok.ts),
--    valamint a menet-akciók.
create table if not exists fuvar_valtozas (
  id      bigserial primary key,
  tabla   text not null,
  sor_id  text not null,
  mezo    text not null,
  regi    text,
  uj      text,
  ki      text,
  mikor   timestamptz not null default now(),
  ok      text
);
create index if not exists idx_fuvar_valtozas_sor on fuvar_valtozas (tabla, sor_id, mikor desc);
