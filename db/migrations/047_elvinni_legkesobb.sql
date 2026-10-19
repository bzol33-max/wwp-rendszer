-- Rugalmas saját fuvar („Elvinni való”) határideje (2026-10-19, Budaházi Zoltán):
-- a saját fuvar töltelék — nem fix napra kerül, hanem a „legkorabban” és a
-- „legkesobb” közti ablakban oda, ahol a kocsinak útba esik. A határidő
-- miatt nem maradhat hetekig tallonban: előtte sárga, az utolsó napokon
-- piros jelzés (lib/megbizasok/elvinni-szabalyok.ts → elvinniSurgosseg).
alter table fuvar_megbizasok add column if not exists legkesobb date;

-- A már nyitott elvinni valók alapértéke: legkorábban (vagy a rögzítés napja) + 7 nap.
update fuvar_megbizasok
   set legkesobb = coalesce(legkorabban, created_at::date) + 7
 where jelleg = 'sajat' and elokeszites and idopont_nyitott and torolt_at is null and legkesobb is null;
