-- Élő ETA-napló (2026-10-11): minden még el nem ért megállóra a lánc
-- becslése, legfeljebb 10 percenként. A tényleges érkezés a
-- fuvar_megallok.gps_erkezes — a kettő különbségéből mérjük, mennyire
-- pontos az ETA (P50/P80 hiba előrejelzési távonként). CSAK ADDITÍV.
create table if not exists eta_naplo (
  id               bigserial primary key,
  megbizas_id      bigint not null references fuvar_megbizasok(id) on delete cascade,
  sorszam          integer not null,
  jarmu            text,
  becsles_at       timestamptz not null default now(),
  becsult_erkezes  timestamptz not null
);
create index if not exists idx_eta_naplo_megallo on eta_naplo (megbizas_id, sorszam, becsles_at desc);
