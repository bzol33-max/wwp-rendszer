-- EGYSZERI kézi karbantartás — a scripts/migrate.mjs NEM futtatja.
-- Kézzel, a Railway Postgres konzoljába illesztve futtatandó.
--
-- MIÉRT: a Számla/Posta fülre egy bér fuvar akkor is bekerül, ha csak a
-- lerakás/felrakás dátuma múlt el (lásd getSzamlaPostaFuvarok), kilépni
-- viszont csak "Postázva" jelöléssel lehet. Amit sosem postáztak, az ezért
-- örökre ott ragad, és a lekérdezés `limit 200`-a mellett a régi, ellenőrizetlen
-- sorok ki is szorítják az újakat. Ez a script a felgyűlt hátralékot átteszi
-- az Archív fülre.
--
-- HOGYAN: az archiválás feltétele `postazva and postazva_at <= now() - 5 perc`.
-- A postazva_at-ot a fuvar SAJÁT dátumára állítjuk (nem now()-ra), így az
-- Archív fül `postazva_at desc` rendezése időrendben marad, és a sorok azonnal
-- átkerülnek, nem 5 perc múlva.

-- A HATÁRVONAL. Ez az egy sor szabályozza, meddig söpör a takarítás.
-- current_date        = minden, ami a dátuma elmúltával került a fülre
-- current_date - 30   = csak a 30 napnál régebbiek (óvatosabb)
-- Amit MA jelöltek teljesítettnek, azt egyik változat sem érinti.

-- 1. LÉPÉS — mennyit érintene? (csak olvas)
select
  count(*)                                              as erintett_sorok,
  min(coalesce(lerakas_datum, datum))                   as legregebbi,
  max(coalesce(lerakas_datum, datum))                   as legujabb,
  count(*) filter (where not teljesitve)                as sosem_teljesitett,
  count(*) filter (where szamla_szam is not null)       as van_szamlaszama
from fuvar_megbizasok
where tipus = 'sajat'
  and statusz <> 'torolt'
  and not postazva
  and coalesce(lerakas_datum, datum) < current_date;

-- 2. LÉPÉS — pontosan mely sorok? (csak olvas; nézd át, mielőtt írnál)
select
  id, datum, lerakas_datum, megrendelo, teljesitve, szamla_szam, ellenorzott
from fuvar_megbizasok
where tipus = 'sajat'
  and statusz <> 'torolt'
  and not postazva
  and coalesce(lerakas_datum, datum) < current_date
order by coalesce(lerakas_datum, datum) desc
limit 100;

-- 3. LÉPÉS — az archiválás. Csak a 2. lépés átnézése után futtasd.
-- A BEGIN után ellenőrizd a sorszámot; ha nem stimmel, ROLLBACK.
begin;

update fuvar_megbizasok
set postazva = true,
    postazva_at = coalesce(lerakas_datum, datum)::timestamptz
where tipus = 'sajat'
  and statusz <> 'torolt'
  and not postazva
  and coalesce(lerakas_datum, datum) < current_date;

-- Itt írja ki, hány sort módosított. Ha egyezik az 1. lépés számával:
commit;
-- Ha NEM egyezik, e helyett:  rollback;

-- VISSZAVONÁS, ha mégis rosszul sült el. A postazva_at-ból látszik, mit
-- nyúlt meg ez a script: nála a postazva_at pont a fuvar dátumának éjfele,
-- míg a kézzel postázottaknál a tényleges kattintás ideje.
--
-- update fuvar_megbizasok
-- set postazva = false, postazva_at = null
-- where tipus = 'sajat'
--   and postazva
--   and postazva_at = coalesce(lerakas_datum, datum)::timestamptz;
