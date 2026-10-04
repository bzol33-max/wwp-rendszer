-- Saját fuvar csak a sofőr fotójával zárul le (Budaházi Zoltán, 2026-10-04).
--
-- Eddig a régi jelölőkből számoló trigger (002) a saját fuvart (tipus='ber')
-- lezártnak vette, amint teljesítve lett VAGY elmúlt a lerakás napja — papír
-- nélkül. Mostantól a sofőr lefotózza a leigazolt szállítólevelet, és a
-- fuvar ettől zárul le: fotó nélkül "teljesitve" (fotóra vár) marad. A
-- Számlázz.hu-s szállítólevél-párosítás NEM zár le (az nem leigazolt papír).
-- Kézi lezárás (valtAllapot kezi) továbbra is lehet, naplózva.
--
-- A meglévő lezárt saját fuvarok lezártak maradnak: a követő trigger egy
-- lezárt saját fuvart nem állít vissza a régi jelölőkből (2026-10-04-én mind
-- a 20 korábbi saját fuvar lezárt volt, 18 fotó nélkül).
--
-- A TS-tükör: lib/fuvarozas/backfill-allapot.ts (scripts/teszt-backfill-allapot.ts).

create or replace function fuvar_megbizasok_allapot_regi_jelolokbol(r fuvar_megbizasok) returns text language sql stable as $$
  select case
    -- saját fuvar (tipus='ber'): lezárt csak fuvarlevél/szállítólevél-fotóval
    when r.tipus = 'ber'
      and (r.teljesitve or coalesce(r.lerakas_datum, r.datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(r.szamla_szam, '') <> '')
      then case
        when exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = r.id and d.tipus = 'fuvarlevel') then 'lezart'
        else 'teljesitve' end
    -- régi fül: archiv (bér fuvar: számla + postázva, 5 percnél régebben)
    when coalesce(r.szamla_szam, '') <> '' and r.postazva and coalesce(r.postazva_at, '-infinity'::timestamptz) <= now() - interval '5 minutes'
      then 'lezart'
    -- régi fül: szamla_posta (csak tipus='sajat' = bér fuvar)
    when (r.teljesitve or coalesce(r.lerakas_datum, r.datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(r.szamla_szam, '') <> '')
      then case
        when coalesce(r.szamla_szam, '') <> '' and r.postazva then 'postazva'
        when coalesce(r.szamla_szam, '') <> '' then 'szamlazva'
        when exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = r.id and d.tipus = 'fuvarlevel') then 'szamlazhato'
        else 'teljesitve' end
    -- régi fül: folyamatban
    when not r.ellenorzott then 'ellenorzesre_var'
    when r.datum > (now() at time zone 'Europe/Budapest')::date then 'tervezett'
    else 'folyamatban'
  end
$$;

create or replace function fuvar_megbizasok_allapot_koveto() returns trigger language plpgsql as $$
declare uj text;
begin
  if tg_op = 'INSERT' then
    if new.allapot is null then
      new.allapot := fuvar_megbizasok_allapot_regi_jelolokbol(new);
      new.allapot_at := coalesce(new.allapot_at, now());
    end if;
    return new;
  end if;
  -- Számla előtti postázás-jelölés: a számla megjöttekor törlődik (015).
  if coalesce(old.szamla_szam, '') = '' and coalesce(new.szamla_szam, '') <> ''
     and old.postazva and new.postazva and new.tipus = 'sajat' then
    new.postazva := false;
    new.postazva_at := null;
  end if;
  -- UPDATE: ha az utasítás maga írta az allapot-ot, az új kód döntött.
  if new.allapot is distinct from old.allapot then return new; end if;
  -- Lezárt saját fuvart a régi jelölők nem nyitnak újra (019).
  if old.allapot = 'lezart' and new.tipus = 'ber' then return new; end if;
  uj := fuvar_megbizasok_allapot_regi_jelolokbol(new);
  if uj is distinct from new.allapot then
    new.allapot := uj;
    new.allapot_at := now();
  end if;
  return new;
end $$;

-- A fotó: bér fuvarnál teljesítve → számlázható (7. él, változatlan), saját
-- fuvarnál teljesítve → lezárt (12. él, a sofőr fotója a leigazolt papír).
create or replace function fuvar_dokumentumok_foto_trigger() returns trigger language plpgsql as $$
declare a text; j text;
begin
  if new.tipus <> 'fuvarlevel' then return null; end if;
  insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek)
  values (new.fuvar_id, 'foto_megerkezett', 'sofor', new.feltoltotte, jsonb_build_object('dokumentum_id', new.id, 'fajlnev', new.fajlnev));
  select allapot, jelleg into a, j from fuvar_megbizasok where id = new.fuvar_id;
  if a = 'teljesitve' and j = 'ber' then
    perform set_config('fuvarozas2.uj_kod', '1', true);
    update fuvar_megbizasok set allapot = 'szamlazhato', allapot_at = now() where id = new.fuvar_id;
    insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
    values (new.fuvar_id, 'szamlazhato', 'teljesitve', 'szamlazhato', 'rendszer', null, jsonb_build_object('atmenet', 7, 'dokumentum_id', new.id));
  elsif a = 'teljesitve' and j = 'sajat' then
    perform set_config('fuvarozas2.uj_kod', '1', true);
    update fuvar_megbizasok set allapot = 'lezart', allapot_at = now() where id = new.fuvar_id;
    insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
    values (new.fuvar_id, 'lezart', 'teljesitve', 'lezart', 'rendszer', null, jsonb_build_object('atmenet', 12, 'dokumentum_id', new.id, 'szallitolevel_foto', true));
  end if;
  return null;
end $$;
