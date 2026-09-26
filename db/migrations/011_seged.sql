-- Beépített segéd a Megbízások oldalon (Budaházi Zoltán, 2026-09-26): a
-- jobb oldali kocsi-panel helyén. Két tábla:
--   • seged_tudas   — amit Zoltán megtanít neki („Olivér a címeket e-mailben
--                     küldi”). Minden válasznál a modell elé kerül. Csak
--                     jóváhagyással kerül be; törölhető (torolve_at).
--   • seged_uzenet  — a beszélgetés, felhasználónként, hogy újratöltés után
--                     is megmaradjon.
create table if not exists seged_tudas (
  id          bigserial primary key,
  szoveg      text not null,
  forras      text not null default 'ember' check (forras in ('ember', 'seged_javaslat')),
  letrehozta  text,
  created_at  timestamptz not null default now(),
  torolve_at  timestamptz
);

create table if not exists seged_uzenet (
  id          bigserial primary key,
  user_id     uuid not null,
  szerep      text not null check (szerep in ('user', 'assistant')),
  tartalom    text not null,
  eszkozok    text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_seged_uzenet_user on seged_uzenet (user_id, id desc);
