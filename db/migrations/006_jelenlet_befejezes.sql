-- Jelenléti/üzenőfal modul befejezése (2026-09-20) — egyszeri adatlépések.
-- A séma (oszlopok, indexek) a db/schema.sql-ben van, az minden induláskor
-- lefut. Ide csak az kerül, ami NEM idempotens: meglévő sorok átjelölése és
-- a próbálkozásból maradt szemét takarítása. A futtatót lásd
-- scripts/migrate.mjs:futtasdSqlMigraciokatOnce — egy tranzakció, egyszer.

-- 1. A korábban felvitt sofőr-gondjelzések átjelölése. A jelezGondot
--    mostantól maga írja a forrást, de a már bent lévő sorokat a leírás
--    állandó előtagjáról ismerjük fel (lásd lib/fuvarozas/sofor.ts). Ezzel
--    kikerülnek a telephelyi üzenőfalról és annak archívumából is, a
--    Fuvarozás/Áttekintés viszont továbbra is megtalálja őket.
update feladatok set forras = 'sofor_gond'
 where forras = 'jelenlet' and description like 'Sofőr jelzés (%';

-- 2. A dolgozói mobil kipróbálásából maradt jelenlét-sorok törlése
--    (Budaházi Zoltán: "próba volt"). 2026-09-08-án egyetlen napra nyolc sor
--    keletkezett: azonos percben nyitott és zárt szakaszok, egy máig nyitva
--    maradt szakasz, valamint szabadság ÉS betegszabadság ugyanarra a napra.
--    Ez nem valódi munkaidő, a szabadság-sor pedig a keretből is levonódna.
delete from jelenletek
 where work_date = date '2026-09-08'
   and employee_id in (select id from alkalmazottak where name = 'Bodogán Gabi');

-- 3. Az admin "Új szakasz" gombja üres sort szúrt be (se érkezés, se
--    távozás), ami a lista alján lógott és semmit nem jelentett. A gomb
--    mostantól nem hoz létre üres sort; a meglévő darabokat töröljük.
delete from jelenletek
 where arrival_time is null and departure_time is null and day_type = 'munka';

-- 4. Szabadságkeret indulása a 2026. augusztusi bérjegyzékről: az ott
--    szereplő "Felhasználható" napok száma, 2026-08-31-i fordulónappal. A
--    Profil ebből vonja le a fordulónap UTÁN rögzített szabadság-napokat,
--    így a szeptembertől jelentett szabadság automatikusan fogyaszt.
update alkalmazottak set szabadsag_keret_nap = 14, szabadsag_keret_datum = date '2026-08-31'
 where name = 'Bodogán Gabi';
update alkalmazottak set szabadsag_keret_nap = 15, szabadsag_keret_datum = date '2026-08-31'
 where name = 'Vadon Gabi';
