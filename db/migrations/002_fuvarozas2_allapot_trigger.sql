-- Fuvarozás 2 — az `allapot` követi a régi jelölőket, amíg a régi kód él
-- (E6 kettős írás, második irány). A 001 triggere a jelleg/torolt_at-ot
-- tölti; ez az `allapot`-ot a 11.2 leképező tábla SQL-tükrével, ha:
--   - új sor jön allapot nélkül (régi addFuvar / Drive-import), vagy
--   - a régi jelölők egyike változik (setFuvarTeljesitve, setFuvarPostazva,
--     setFuvarokPapirokBeerkeztek, setFuvarSzamlaSzam, approveFuvar, GPS-
--     figyelő) ÉS ugyanaz az utasítás NEM írja az allapot-ot (az új kód
--     igen — akkor az új kód dönt, a trigger nem nyúl hozzá).
-- A TS-tükör: lib/fuvarozas/backfill-allapot.ts regiHelyUjAllapot(). Ha a
-- szabály változik, MINDKETTŐT ugyanúgy módosítsd (scripts/fuvarozas2-
-- backfill.ts --check őrzi, hogy egyeznek).
--
-- A cutover után (a régi kód törlésével, 7. kör) ez a trigger is megy.
create or replace function fuvar_megbizasok_allapot_regi_jelolokbol(r fuvar_megbizasok) returns text language sql stable as $$
  select case
    -- régi fül: archiv
    when (coalesce(r.szamla_szam, '') <> '' and r.postazva and coalesce(r.postazva_at, '-infinity'::timestamptz) <= now() - interval '5 minutes')
      or (r.tipus = 'ber' and (r.teljesitve or coalesce(r.lerakas_datum, r.datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(r.szamla_szam, '') <> ''))
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
  -- UPDATE: ha az utasítás maga írta az allapot-ot, az új kód döntött.
  if new.allapot is distinct from old.allapot then return new; end if;
  uj := fuvar_megbizasok_allapot_regi_jelolokbol(new);
  if uj is distinct from new.allapot then
    new.allapot := uj;
    new.allapot_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_fuvar_megbizasok_allapot_koveto on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_allapot_koveto
  before insert or update of teljesitve, postazva, postazva_at, szamla_szam, papirok_beerkeztek_at, ellenorzott, datum, lerakas_datum, tipus
  on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_allapot_koveto();

-- Napló: az állapotváltásról esemény, bárhonnan jött (régi kód / trigger /
-- új kód — az új kód a saját, részletesebb eseményét is beírja; a duplát a
-- reszletek.forras_trigger jelöli, a lista-nézet összevonja).
create or replace function fuvar_megbizasok_allapot_naplo() returns trigger language plpgsql as $$
begin
  -- Az új kód (lib/fuvarozas2) a saját, részletesebb eseményét írja; a
  -- tranzakcióban set_config('fuvarozas2.uj_kod','1',true)-val jelzi, hogy
  -- a trigger ne duplázza.
  if current_setting('fuvarozas2.uj_kod', true) = '1' then return null; end if;
  if tg_op = 'INSERT' then
    insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
    values (new.id, 'letrehozva', null, new.allapot, 'rendszer', new.created_by, '{"forras_trigger": true}'::jsonb);
  elsif new.allapot is distinct from old.allapot then
    insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
    values (new.id, 'modositva', old.allapot, new.allapot, 'rendszer', null, '{"forras_trigger": true}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists trg_fuvar_megbizasok_allapot_naplo on fuvar_megbizasok;
-- Minden update-en fut (nem csak `update of allapot`), mert a BEFORE trigger
-- által állított allapot nem számít az utasítás oszloplistájába.
create trigger trg_fuvar_megbizasok_allapot_naplo
  after insert or update on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_allapot_naplo();
