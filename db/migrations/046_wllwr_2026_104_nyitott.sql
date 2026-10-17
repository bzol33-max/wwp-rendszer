-- WLLWR-2026-104 visszaállítása NYITOTTRA (2026-10-17, Budaházi Zoltán).
--
-- PERPUSZ HUNGARY Kft., 138 db használt egyutas raklap, bruttó 385 572 Ft,
-- kiállítva 2026.04.16., fizetési határidő 2026.05.18. — NINCS kifizetve.
--
-- A db/szamla-fizetve-import.json tévesen tartalmazta (kifizetve: null), így
-- az egyszeri fizetve-import a kiállítás dátumával kifizetettnek jelölte, és
-- kiesett a nyitott számlák közül. A JSON-t NEM módosítjuk: az import a fájl
-- tartalma szerint fut egyszer (egyszerFajlonkent), egy módosítás az egész
-- listát újra ráfuttatná, a kézzel visszavont jelöléseket is felülírva.
--
-- Ha a sor valamiért még nincs a szamla táblában, a pending listába tesszük,
-- így a következő Számlázz.hu-szinkron kör behúzza (nyitottként).

update szamla
   set fizetve = false,
       fizetve_datum = null
 where szamlaszam = 'WLLWR-2026-104';

insert into szamlak_poll_pending (szamlaszam)
select 'WLLWR-2026-104'
 where not exists (select 1 from szamla where szamlaszam = 'WLLWR-2026-104')
on conflict (szamlaszam) do update set feladva = false;
