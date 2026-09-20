-- Fuvarozás 2 — Levelek (E9a). A Gmail-figyelő ide írja a beérkező levelek
-- METAADATÁT (feladó, tárgy, snippet, csatolmánynevek), és csak a
-- megbízásnak/papírnak osztályozott levelek csatolmányát tölti fel.
--
-- Miért nincs OAuth-token tábla: a figyelő a felhasználó saját Google
-- fiókjában futó Apps Script (docs/gmail-fuvar-figyelo.gs), ami megosztott
-- titokkal POST-ol ide. Így nincs Gmail refresh token a rendszerben, és nem
-- kell a gmail.readonly „restricted scope" Google-hitelesítése sem (Testing
-- módban a refresh token 7 naponta lejárna). Ez az S17 határozat pontosítása.
create table if not exists fuvar_level (
  id                   bigserial primary key,
  gmail_message_id     text not null unique,
  gmail_thread_id      text,
  felado               text not null,
  felado_nev           text,
  felado_domain        text,
  cimzettek            text[] not null default '{}',
  targy                text,
  snippet              text,
  erkezett             timestamptz not null,
  szal_elso            boolean not null default true,
  csatolmany_nevek     text[] not null default '{}',
  -- Osztályozás (lib/fuvarozas2/level-osztalyozo.ts)
  osztaly              text not null,
  bizalom              integer not null default 0,
  indoklas             text[] not null default '{}',
  partner_kod          text,
  partner_id           bigint references fuvar_partnerek(id) on delete set null,
  hivatkozas           text,
  rendszam             text,
  -- Feldolgozás
  csatolmany_kell      boolean not null default false,
  csatolmany_megjott_at timestamptz,
  drive_file_id        text,
  drive_url            text,
  megbizas_id          bigint references fuvar_megbizasok(id) on delete set null,
  allapot              text not null default 'uj'
                         check (allapot in ('uj', 'feldolgozva', 'elvetve', 'megvalaszolva')),
  allapot_by           text,
  allapot_at           timestamptz,
  kezi_osztaly         text,          -- ha ember átsorolta, ez nyer
  letrehozva_at        timestamptz not null default now()
);
create index if not exists idx_fuvar_level_allapot on fuvar_level (allapot, erkezett desc);
create index if not exists idx_fuvar_level_osztaly on fuvar_level (coalesce(kezi_osztaly, osztaly), erkezett desc);
create index if not exists idx_fuvar_level_kert on fuvar_level (csatolmany_kell) where csatolmany_kell and csatolmany_megjott_at is null;
create index if not exists idx_fuvar_level_szal on fuvar_level (gmail_thread_id);

-- A figyelő életjele és utolsó futása (Rendszer-csempe, K22).
create table if not exists gmail_figyelo_allapot (
  kulcs         text primary key,
  ertek         jsonb not null default '{}'::jsonb,
  frissitve_at  timestamptz not null default now()
);
