-- Timocom ajánlat a böngésző-gombból / beillesztésből (fuvarszervező pult,
-- B út, 2026-10-11). CSAK ADDITÍV: a radar_kiiras (001) eddig üres volt;
-- forras = 'timocom', kulso_azonosito = a Timocom ajánlat-azonosítója.
alter table radar_kiiras add column if not exists reszletek jsonb;
alter table radar_kiiras add column if not exists nyers_szoveg text;
alter table radar_kiiras add column if not exists url text;
alter table radar_kiiras add column if not exists rogzitette text;
create index if not exists idx_radar_kiiras_forras_letrehozva on radar_kiiras (forras, letrehozva_at desc);
