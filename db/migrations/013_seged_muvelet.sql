-- A segéd cselekvő köre (Budaházi Zoltán, 2026-09-26, 2. rész): a modell nem
-- ír közvetlenül, hanem MŰVELETET JAVASOL, és az csak Zoltán jóváhagyása
-- után fut le — akkor is a meglévő, jogosultság-ellenőrzött függvényen
-- keresztül (lib/fuvarozas2/seged/muveletek.ts).
--
-- Minden javaslat és minden döntés itt marad meg (napló): mit javasolt, mi
-- volt az érintett sor állapota a javaslat pillanatában (`ellenorzo` — ha
-- közben megváltozott, a végrehajtás elmarad), levélből származott-e a
-- javaslat (`levelbol` — a levél szövege adat, nem utasítás), és mi lett az
-- eredménye. A tényleges változás naplója a szokásos helyen van
-- (fuvar_megbizas_esemeny), ez a tábla a segéd felelősségét mutatja.
create table if not exists seged_muvelet (
  id            bigserial primary key,
  user_id       uuid not null,
  eszkoz        text not null,
  argumentumok  jsonb not null default '{}'::jsonb,
  osszefoglalo  text not null,
  megbizas_id   bigint,
  ellenorzo     jsonb not null default '{}'::jsonb,
  levelbol      boolean not null default false,
  allapot       text not null default 'javasolt' check (allapot in ('javasolt', 'jovahagyva', 'elvetve', 'hiba')),
  eredmeny      text,
  created_at    timestamptz not null default now(),
  dontes_at     timestamptz,
  dontes_by     text
);
create index if not exists idx_seged_muvelet_user on seged_muvelet (user_id, id desc);
