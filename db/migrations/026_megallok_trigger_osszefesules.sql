-- A fuvar_megbizasok_megallok_trigger két, egymásról nem tudó változata
-- összefésülve (2026-10-06):
--   • 024_megallo_erkezes_varakozas_tukor: a várakozás kezdete is tény,
--     ilyenkor sem építjük újra a megállókat;
--   • 022_megallo_nap_koveti_datumot: ha már van tény, az érintetlen
--     megállók napja kövesse a megbízás új dátumát.
-- Élesen a 022 futott le később (a 024 már korábban), így a 024 bővítése
-- elveszett; friss adatbázison fordítva a 022-é veszne el. Ez a fájl
-- mindkettőt tartalmazza, és mindkét sorrendben ez marad érvényben.
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

create or replace function fuvar_megbizasok_megallok_trigger() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform fuvar_megallok_letrehoz_szovegbol(new.id);
  elsif (new.felrako is distinct from old.felrako or new.lerako is distinct from old.lerako
         or new.datum is distinct from old.datum or new.lerakas_datum is distinct from old.lerakas_datum) then
    -- Tényadat esetén a megállók és a régi hivatkozások indexei stabilak.
    if not exists (select 1 from fuvar_megallok g where g.megbizas_id = new.id
                   and (g.gps_erkezes is not null or g.sofor_kesz_at is not null
                        or g.sofor_megerkezett_at is not null or g.varakozas_kezdete is not null)) then
      delete from fuvar_megallok where megbizas_id = new.id;
      update fuvar_megallo_allapot set megallo_id = null where fuvar_id = new.id;
      perform fuvar_megallok_letrehoz_szovegbol(new.id);
      update fuvar_megallo_allapot a set megallo_id = g.id
      from fuvar_megallok g where a.fuvar_id = new.id and g.megbizas_id = new.id and g.sorszam = a.megallo_index + 1;
    elsif (new.datum is distinct from old.datum or new.lerakas_datum is distinct from old.lerakas_datum) then
      -- Van már tény: a sorrendhez nem nyúlunk, de a még érintetlen megállók
      -- napja kövesse az új dátumot (a megállónként eltérő nap marad).
      update fuvar_megallok g
         set tervezett_nap = case when g.tipus = 'felrako' then new.datum else coalesce(new.lerakas_datum, new.datum) end
       where g.megbizas_id = new.id
         and g.gps_erkezes is null and g.sofor_kesz_at is null
         and g.sofor_megerkezett_at is null and g.varakozas_kezdete is null
         and g.tervezett_nap is not distinct from
             (case when g.tipus = 'felrako' then old.datum else coalesce(old.lerakas_datum, old.datum) end);
    end if;
  end if;
  return null;
end $$;
