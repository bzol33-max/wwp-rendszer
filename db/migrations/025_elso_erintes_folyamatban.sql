-- Az első megálló-érintés a megbízást "folyamatban"-ra lépteti (allapotgep.ts
-- 5. él: tervezett → folyamatban, 4. él: ellenorzesre_var → folyamatban,
-- auto-jóváhagyással). (2026-10-06)
--
-- MIÉRT: a #293 (Lösung, AOPU-427) 10-05-én 14:56-kor érte el Sárvárt, a
-- GPS-érkezés és a sofőr jelölései is beíródtak a fuvar_megallok sorba, a
-- megbízás mégis végig "tervezett" maradt, és a végén egy lépésben ugrott
-- "tervezett → teljesitve (régi jelölőből)". Az 5. élt ugyanis SEMMI nem
-- hajtotta végre: a megálló-írók (lib/megbizasok/megallo.ts gpsErintesTx,
-- megerkezettTx, megalloKeszTx, varakozasTx) csak a megálló-sort írják, a
-- 002/019-es követő trigger pedig csak a régi jelölők (teljesitve, datum,
-- ellenorzott…) változásakor számol — a "datum <= ma → folyamatban" ága egy
-- előre felvett fuvarnál sosem fut le, mert az idő múlása nem UPDATE.
--
-- A megálló-tény itt, a fuvar_megallok triggerében lépteti az állapotot, így
-- minden író (GPS-figyelő, sofőr mobil, GPS lap pipája, a régi tábla 003/024
-- tükre) ugyanígy hat. Az esemény a többi átmenethez hasonlóan a
-- fuvar_megbizas_esemeny-be kerül ('megerkezett', atmenet 4/5, megallo_id).
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

create or replace function fuvar_megallok_elso_erintes() returns trigger language plpgsql as $$
declare
  a text;
  forras text;
  ki text;
  kivalto text;
  elozo text;
  -- Az OLD mezőit csak UPDATE-nél olvassuk (INSERT-nél nincs OLD).
  o_gps timestamptz;
  o_erk timestamptz;
  o_kesz timestamptz;
  o_var timestamptz;
begin
  if tg_op = 'UPDATE' then
    o_gps := old.gps_erkezes; o_erk := old.sofor_megerkezett_at; o_kesz := old.sofor_kesz_at; o_var := old.varakozas_kezdete;
  end if;
  -- Csak az első tény számít: az adott jelölés eddig üres volt.
  if not ((o_gps is null and new.gps_erkezes is not null)
       or (o_erk is null and new.sofor_megerkezett_at is not null)
       or (o_kesz is null and new.sofor_kesz_at is not null)
       or (o_var is null and new.varakozas_kezdete is not null)) then
    return null;
  end if;

  select allapot into a from fuvar_megbizasok where id = new.megbizas_id and torolt_at is null;
  if a is null or a not in ('tervezett', 'ellenorzesre_var') then return null; end if;

  -- A kézi jelölés erősebb bizonyíték (és ismert, ki tette) — azt írjuk a naplóba, ha ez volt az új tény.
  if o_kesz is null and new.sofor_kesz_at is not null then
    forras := 'sofor'; ki := new.sofor_kesz_by; kivalto := 'sofor_kesz';
  elsif o_erk is null and new.sofor_megerkezett_at is not null then
    forras := 'sofor'; kivalto := 'sofor_megerkezett';
  elsif o_var is null and new.varakozas_kezdete is not null then
    forras := 'sofor'; kivalto := 'varakozas';
  else
    forras := 'gps'; kivalto := 'gps_erkezes';
  end if;

  -- A naplózó trigger (002) ne írjon mellé egy "régi jelölőből" duplát; a
  -- jelzőt utána visszaállítjuk, hogy a tranzakció későbbi (pl. ugyanabban
  -- a hívásban jövő teljesitve) váltása rendesen naplózódjon.
  elozo := current_setting('fuvarozas2.uj_kod', true);
  perform set_config('fuvarozas2.uj_kod', '1', true);
  update fuvar_megbizasok set allapot = 'folyamatban', allapot_at = now(), ellenorzott = true
   where id = new.megbizas_id and allapot = a;
  if found then
    insert into fuvar_megbizas_esemeny (megbizas_id, megallo_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
    values (new.megbizas_id, new.id, 'megerkezett', a, 'folyamatban', forras, ki,
            jsonb_build_object('atmenet', case when a = 'tervezett' then 5 else 4 end, 'kivalto', kivalto,
                               'megallo_sorszam', new.sorszam, 'automatikus', true));
  end if;
  perform set_config('fuvarozas2.uj_kod', coalesce(elozo, ''), true);
  return null;
end $$;

drop trigger if exists trg_fuvar_megallok_elso_erintes on fuvar_megallok;
create trigger trg_fuvar_megallok_elso_erintes
  after insert or update of gps_erkezes, sofor_megerkezett_at, sofor_kesz_at, varakozas_kezdete on fuvar_megallok
  for each row execute function fuvar_megallok_elso_erintes();

-- A követő trigger (019) egy már elindult fuvart ne tegyen vissza
-- tervezettre/ellenőrzésre: ha a dátumot utólag későbbre írják (a sofőr egy
-- nappal korábban ért oda), a régi "datum > ma → tervezett" ág visszaléptetné.
-- A 14. él (Visszaállítás) GPS-érintés után amúgy sem engedett. A függvény
-- többi része változatlanul a 019-es.
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
  if uj is distinct from new.allapot then
    new.allapot := uj;
    new.allapot_at := now();
  end if;
  return new;
end $$;

-- Utólagos pótlás: a most is "tervezett", de már érintett megbízások (a
-- lejárt, teljesítetlenek is — a "Lejárt" figyelő folyamatban-ként is
-- számolja őket). Az ellenőrzésre várókat szándékosan NEM hagyjuk jóvá
-- visszamenőleg: azokat ember nézze meg; előre a trigger viszi őket (4. él).
-- Ismételt futásnál nincs mit tenni.
-- A 002-es naplózó trigger itt se duplázzon (a jelzőt utána töröljük).
select set_config('fuvarozas2.uj_kod', '1', true);
with erintett as (
  select f.id, f.allapot as elotte,
         (select g.id from fuvar_megallok g
           where g.megbizas_id = f.id
             and (g.gps_erkezes is not null or g.sofor_megerkezett_at is not null
                  or g.sofor_kesz_at is not null or g.varakozas_kezdete is not null)
           order by g.sorszam limit 1) as megallo_id
  from fuvar_megbizasok f
  where f.torolt_at is null and f.allapot = 'tervezett'
),
valtott as (
  update fuvar_megbizasok f set allapot = 'folyamatban', allapot_at = now()
  from erintett e
  where f.id = e.id and e.megallo_id is not null
  returning f.id, e.elotte, e.megallo_id
)
insert into fuvar_megbizas_esemeny (megbizas_id, megallo_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
select v.id, v.megallo_id, 'megerkezett', v.elotte, 'folyamatban', 'rendszer', null,
       jsonb_build_object('atmenet', 5, 'kivalto', 'potlas_025', 'automatikus', true)
from valtott v;
select set_config('fuvarozas2.uj_kod', '', true);
