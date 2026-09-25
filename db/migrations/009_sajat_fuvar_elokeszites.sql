-- Saját fuvar előkészítése (Budaházi Zoltán, 2026-09-25): a saját
-- fuvarokat előre beírja, módosítja, és ha minden biztos, egy gombbal
-- „kocsira adja” — onnantól olyan, mint egy megbízás, megy a sofőrnek.
--
-- Amíg `elokeszites`, a kiválasztott kocsi az `elokeszites_jarmu`-ban vár,
-- a `jarmu` üres: a sofőr appja és a GPS-figyelő a `jarmu` szerint válogat,
-- így az előkészítés alatti fuvart egyik sem látja.
alter table fuvar_megbizasok add column if not exists elokeszites boolean not null default false;
alter table fuvar_megbizasok add column if not exists elokeszites_jarmu text;
alter table fuvar_megbizasok add column if not exists kocsira_adva_at timestamptz;
