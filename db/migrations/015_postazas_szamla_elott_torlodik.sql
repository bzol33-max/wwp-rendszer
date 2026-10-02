-- Számla ELŐTT tett „Postázva” jelölés nem számít (BHS Trans 330031897,
-- 2026-10-02).
--
-- Mi történt: a régi Posta-lista szeptember végén még a számlázatlan bér
-- fuvarokat is mutatta, és a BHS-fuvart 09-30-án postázottnak jelölték —
-- számla nélkül ez az állapotot nem változtatta (S1), tehát senki nem
-- látta. 10-01-jén megjött a számla, és a 002-es trigger a régi
-- jelölőkből (számla + postázva, 5 percnél régebben) egyből „lezárt”-ra
-- tette: a fuvar postázás nélkül tűnt el a Posta-listáról.
--
-- A szabály (Budaházi Zoltán): postára csak kiszámlázott fuvar megy. Ezért
-- ha a számlaszám MOST érkezik, és a „Postázva” jelölés már ELŐTTE ott
-- állt, a jelölés téves volt — töröljük, és a fuvar a postára várók közé
-- kerül. A 002 függvényét bővíti; az állapot-szabály (a TS-tükör,
-- lib/fuvarozas/backfill-allapot.ts) nem változik.
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
  -- Számla előtti postázás-jelölés: a számla megjöttekor törlődik.
  if coalesce(old.szamla_szam, '') = '' and coalesce(new.szamla_szam, '') <> ''
     and old.postazva and new.postazva and new.tipus = 'sajat' then
    new.postazva := false;
    new.postazva_at := null;
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
