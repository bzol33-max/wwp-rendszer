-- Kiegészítő számlák (Budaházi Zoltán, 2026-09-25): egy már kiszámlázott
-- fuvarhoz utólag kiállított számla (pl. kiállási díj — Ghibli N26/22824:
-- fő számla WLLWR-2026-310, kiegészítő WLLWR-2026-316, rendelésszáma
-- „N26/22824 kieg.”). A fő számla marad a `szamla_szam`-ban.
alter table fuvar_megbizasok add column if not exists kieg_szamla_szamok text[] not null default '{}';
