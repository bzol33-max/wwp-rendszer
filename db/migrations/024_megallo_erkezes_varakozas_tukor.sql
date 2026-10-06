-- A sofőr érkezés- és várakozásjelzése eddig csak a régi táblában maradt,
-- ezért a Ma-vászon új modellű olvasója nem látta a 49 korábbi érkezést.
-- Pótoljuk a stabil megálló-kapcsolatot és a hiányzó tényeket, majd a régi
-- írók triggeres tükrét is bővítjük. (2026-10-06)
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

update fuvar_megallo_allapot a set megallo_id = g.id
from fuvar_megallok g
where a.megallo_id is null and g.megbizas_id = a.fuvar_id and g.sorszam = a.megallo_index + 1;

update fuvar_megallok g set
  sofor_megerkezett_at = coalesce(g.sofor_megerkezett_at, a.kezi_erkezes),
  varakozas_kezdete = coalesce(g.varakozas_kezdete, a.varakozas_kezdete),
  varakozas_vege = coalesce(g.varakozas_vege, a.varakozas_vege)
from fuvar_megallo_allapot a
where a.megallo_id = g.id;

create or replace function fuvar_megallo_allapot_tukor() returns trigger language plpgsql as $$
declare mid bigint;
begin
  -- Az új közös megálló-író már az új sort kezeli először; hagyjuk az
  -- explicit új értéket érvényesülni, és ne fussunk vissza a régi íráson.
  if current_setting('fuvarozas2.megallo_uj_kod', true) = '1' then return null; end if;
  mid := new.megallo_id;
  if mid is null then
    select id into mid from fuvar_megallok where megbizas_id = new.fuvar_id order by sorszam offset new.megallo_index limit 1;
    if mid is not null then update fuvar_megallo_allapot set megallo_id = mid where id = new.id; end if;
  end if;
  if mid is null then return null; end if;
  update fuvar_megallok set
    sofor_kesz_at = case when new.kesz then coalesce(new.kesz_at, sofor_kesz_at, now()) else null end,
    sofor_kesz_by = case when new.kesz then coalesce(new.kesz_by, sofor_kesz_by) else null end,
    gps_erkezes = coalesce(new.gps_erkezes, gps_erkezes),
    gps_tavozas = coalesce(new.gps_tavozas, gps_tavozas),
    sofor_megerkezett_at = coalesce(new.kezi_erkezes, sofor_megerkezett_at),
    varakozas_kezdete = coalesce(new.varakozas_kezdete, varakozas_kezdete),
    varakozas_vege = coalesce(new.varakozas_vege, varakozas_vege)
  where id = mid;
  return null;
end $$;

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
    end if;
  end if;
  return null;
end $$;
