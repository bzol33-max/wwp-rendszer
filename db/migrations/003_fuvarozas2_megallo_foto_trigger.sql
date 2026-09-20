-- Fuvarozás 2 — a régi kód megálló- és fotó-írásai az új modellbe (E7b,
-- kettős írás harmadik iránya). Amíg a sofőr-nézet és a GPS-figyelő a régi
-- fuvar_megallo_allapot sorokat írja, ezek a triggerek viszik át:
--   1. új megbízás (régi addFuvar / import) → fuvar_megallok sorok a
--      felrako/lerako szövegből (a TS bontsMegallokra elsődleges
--      elválasztói: „ + ”, „;”, sorvég — a gondolatjeles városlista-bontást
--      a cutover előtti backfill újrafuttatása pótolja);
--   2. fuvar_megallo_allapot insert/update → a megfelelő fuvar_megallok sor
--      (megallo_id, vagy index szerint) kesz/gps mezői;
--   3. fuvar_dokumentumok 'fuvarlevel' → teljesitve → szamlazhato (11.1/7)
--      + 'foto_megerkezett' esemény.

create or replace function fuvar_megallok_letrehoz_szovegbol(p_megbizas_id bigint) returns integer language plpgsql as $$
declare r fuvar_megbizasok; n integer := 0; c text;
begin
  select * into r from fuvar_megbizasok where id = p_megbizas_id;
  if not found then return 0; end if;
  if exists (select 1 from fuvar_megallok where megbizas_id = p_megbizas_id) then return 0; end if;
  for c in select trim(x) from regexp_split_to_table(coalesce(r.felrako, ''), '\s*\+\s*|;\s*|\n+') x where trim(x) <> '' loop
    n := n + 1;
    insert into fuvar_megallok (megbizas_id, sorszam, tipus, cim_nyers, tervezett_nap, ablak_tol, ablak_ig)
    values (p_megbizas_id, n, 'felrako', c, r.datum, r.felrakas_ablak_tol, r.felrakas_ablak_ig);
  end loop;
  for c in select trim(x) from regexp_split_to_table(coalesce(r.lerako, ''), '\s*\+\s*|;\s*|\n+') x where trim(x) <> '' loop
    n := n + 1;
    insert into fuvar_megallok (megbizas_id, sorszam, tipus, cim_nyers, tervezett_nap, ablak_tol, ablak_ig)
    values (p_megbizas_id, n, 'lerako', c, coalesce(r.lerakas_datum, r.datum), r.lerakas_ablak_tol, r.lerakas_ablak_ig);
  end loop;
  return n;
end $$;

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
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_fuvar_megbizasok_megallok on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_megallok
  after insert or update of felrako, lerako, datum, lerakas_datum on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_megallok_trigger();

create or replace function fuvar_megallo_allapot_tukor() returns trigger language plpgsql as $$
declare mid bigint;
begin
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
    gps_tavozas = coalesce(new.gps_tavozas, gps_tavozas)
  where id = mid;
  return null;
end $$;
drop trigger if exists trg_fuvar_megallo_allapot_tukor on fuvar_megallo_allapot;
create trigger trg_fuvar_megallo_allapot_tukor
  after insert or update on fuvar_megallo_allapot
  for each row execute function fuvar_megallo_allapot_tukor();

create or replace function fuvar_dokumentumok_foto_trigger() returns trigger language plpgsql as $$
declare a text;
begin
  if new.tipus <> 'fuvarlevel' then return null; end if;
  insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek)
  values (new.fuvar_id, 'foto_megerkezett', 'sofor', new.feltoltotte, jsonb_build_object('dokumentum_id', new.id, 'fajlnev', new.fajlnev));
  select allapot into a from fuvar_megbizasok where id = new.fuvar_id;
  if a = 'teljesitve' then
    perform set_config('fuvarozas2.uj_kod', '1', true);
    update fuvar_megbizasok set allapot = 'szamlazhato', allapot_at = now() where id = new.fuvar_id and jelleg = 'ber';
    if found then
      insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
      values (new.fuvar_id, 'szamlazhato', 'teljesitve', 'szamlazhato', 'rendszer', null, jsonb_build_object('atmenet', 7, 'dokumentum_id', new.id));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_fuvar_dokumentumok_foto on fuvar_dokumentumok;
create trigger trg_fuvar_dokumentumok_foto
  after insert on fuvar_dokumentumok
  for each row execute function fuvar_dokumentumok_foto_trigger();
