-- A megbízás felrakás/lerakás dátumának módosítása a még érintetlen
-- megállók tervezett napját is vigye (Endo-Star #301, 2026-10-06: a lerakás
-- napját 10.07.-re javítottuk, de a ravazdi lerakó „terv 10.06.” maradt,
-- mert a felrakón már volt GPS-érkezés, és a trigger ilyenkor semmit nem
-- épít újra — a Ma oldal így a ma estére „esedékes” lerakóra 02:37-es
-- ETA-t számolt, holnapra pedig „nincs fuvar”-t mutatott).
--
-- Tény nélküli megállónál a nap a fuvar dátumát követi — de csak ott, ahol
-- eddig is a fuvar régi dátuma volt; a megbízás szövegéből megállónként
-- kiolvasott, eltérő nap marad.

create or replace function fuvar_megbizasok_megallok_trigger() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform fuvar_megallok_letrehoz_szovegbol(new.id);
  elsif (new.felrako is distinct from old.felrako or new.lerako is distinct from old.lerako
         or new.datum is distinct from old.datum or new.lerakas_datum is distinct from old.lerakas_datum) then
    -- Csak akkor építjük újra, ha még nincs tény a megállókon (sofőr/GPS) —
    -- különben a diszpécser kézi rendezése kell (S11).
    if not exists (select 1 from fuvar_megallok g where g.megbizas_id = new.id
                   and (g.gps_erkezes is not null or g.sofor_kesz_at is not null or g.sofor_megerkezett_at is not null)) then
      delete from fuvar_megallok where megbizas_id = new.id;
      update fuvar_megallo_allapot set megallo_id = null where fuvar_id = new.id;
      perform fuvar_megallok_letrehoz_szovegbol(new.id);
      update fuvar_megallo_allapot a set megallo_id = g.id
      from fuvar_megallok g where a.fuvar_id = new.id and g.megbizas_id = new.id and g.sorszam = a.megallo_index + 1;
    elsif (new.datum is distinct from old.datum or new.lerakas_datum is distinct from old.lerakas_datum) then
      -- Van már tény: a sorrendhez nem nyúlunk, de a még érintetlen megállók
      -- napja kövesse az új dátumot.
      update fuvar_megallok g
         set tervezett_nap = case when g.tipus = 'felrako' then new.datum else coalesce(new.lerakas_datum, new.datum) end
       where g.megbizas_id = new.id
         and g.gps_erkezes is null and g.sofor_kesz_at is null and g.sofor_megerkezett_at is null
         and g.tervezett_nap is not distinct from
             (case when g.tipus = 'felrako' then old.datum else coalesce(old.lerakas_datum, old.datum) end);
    end if;
  end if;
  return null;
end $$;

-- Ami már elcsúszott: a futó (tegnaptól lerakandó) megbízások érintetlen
-- lerakói, amelyeken még a felrakás napja áll, holott a lerakás későbbi.
update fuvar_megallok g
   set tervezett_nap = m.lerakas_datum
  from fuvar_megbizasok m
 where g.megbizas_id = m.id
   and g.tipus = 'lerako'
   and m.torolt_at is null
   and m.lerakas_datum is not null and m.lerakas_datum > m.datum
   and m.lerakas_datum >= (now() at time zone 'Europe/Budapest')::date - 1
   and g.tervezett_nap = m.datum
   and g.gps_erkezes is null and g.sofor_kesz_at is null and g.sofor_megerkezett_at is null;
