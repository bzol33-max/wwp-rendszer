-- Használati napló (2026-10-11): melyik Fuvarozás-lapot (/fuvarozas2/**,
-- /m/**) ki és milyen gyakran nyitja meg — 2 hét adat után ebből döntünk,
-- mit lehet törölni / összevonni. Csak útvonal + néhány nézet-kulcs
-- (nezet, tab, het, m), jelszó/token soha. 60 napnál régebbi sorokat az
-- óránkénti kör törli (lib/fuvarozas2/modell-szinkron-scheduler.ts).
-- CSAK ADDITÍV.
create table if not exists oldal_megnyitas (
  id           bigserial primary key,
  user_id      uuid references users(id) on delete set null,
  felhasznalo  text not null,
  utvonal      text not null,
  parameter    text,
  letrehozva   timestamptz not null default now()
);
create index if not exists idx_oldal_megnyitas_letrehozva on oldal_megnyitas (letrehozva);
create index if not exists idx_oldal_megnyitas_dedup on oldal_megnyitas (felhasznalo, utvonal, letrehozva desc);
