-- Saját fuvar a naptártól magától nem lép előre (2026-10-10).
--
-- MIÉRT: egy bérfuvar után a kocsi KÖVETKEZŐ saját fuvarja "magától"
-- lezárult / archívba került, vagy a bérfuvar előtt "folyamatban"-ra ugrott.
-- A követő trigger (002 → 019 → 025) minden jelölő-változásnál a régi
-- naptár-szabályból számolt: saját fuvarnál (tipus='ber') a
-- coalesce(lerakas_datum, datum) < ma → 'teljesitve', datum <= ma →
-- 'folyamatban'. A "Kocsira adom" (ellenorzott = true), az ütemezés és a
-- módosítás (datum) ezt a sort írja, így egy múltbeli napra tett saját fuvar
-- azonnal teljesítve lett (fotóval lezárt), egy mai pedig folyamatban — a
-- sofőr bármilyen jelzése nélkül.
--
-- MOSTANTÓL: saját fuvarnál, ha nincs se teljesítés-jelölés, se számla, se
-- szállítólevél-fotó, és a megállóin sincs tény (GPS-érkezés/-távozás, sofőr
-- megérkezett/kész, várakozás), a régi jelölők nem léptetik előre:
-- ellenőrzésre vár/tervezett marad (az ellenorzott szerint), a folyamatban
-- folyamatban. Előre az első megálló-tény (025, 5. él), a sofőr utolsó
-- "Indulok"-ja (teljesitve) és a fotó (019, 12. él) viszi.
-- Változatlan: bérfuvar-szabályok, a lezárt saját fuvar nem nyílik újra
-- (019), az elindult fuvar nem lép vissza (025), a hátrafelé lépés (datum
-- későbbre írva, tény nélkül) ugyanúgy, mint eddig.
--
-- A TS-tükör: lib/fuvarozas/backfill-allapot.ts sajatNaptarFek()
-- (scripts/teszt-backfill-allapot.ts).
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

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
  -- Elindult (megálló-tényes) fuvar nem lép vissza tervezettre/ellenőrzésre (025).
  if old.allapot = 'folyamatban' and uj in ('tervezett', 'ellenorzesre_var')
     and exists (select 1 from fuvar_megallok g where g.megbizas_id = new.id
                 and (g.gps_erkezes is not null or g.sofor_megerkezett_at is not null
                      or g.sofor_kesz_at is not null or g.varakozas_kezdete is not null)) then
    return new;
  end if;
  -- Saját fuvar tény nélkül a naptártól nem lép előre (029).
  if new.tipus = 'ber'
     and old.allapot in ('ellenorzesre_var', 'tervezett', 'folyamatban')
     and uj in ('folyamatban', 'teljesitve') and uj is distinct from old.allapot
     and not coalesce(new.teljesitve, false)
     and coalesce(new.szamla_szam, '') = ''
     and not exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = new.id and d.tipus = 'fuvarlevel')
     and not exists (select 1 from fuvar_megallok g where g.megbizas_id = new.id
                     and (g.gps_erkezes is not null or g.gps_tavozas is not null
                          or g.sofor_megerkezett_at is not null or g.sofor_kesz_at is not null
                          or g.varakozas_kezdete is not null)) then
    uj := case when old.allapot = 'folyamatban' then 'folyamatban'
               when new.ellenorzott then 'tervezett'
               else 'ellenorzesre_var' end;
  end if;
  if uj is distinct from new.allapot then
    new.allapot := uj;
    new.allapot_at := now();
  end if;
  return new;
end $$;
