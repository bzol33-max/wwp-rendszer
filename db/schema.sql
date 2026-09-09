-- Well-Worn Pallet — Készlet modul séma
-- Egyszerű, kézzel írt SQL (nincs ORM-migráció-eszköz ráépítve egyelőre).

create table if not exists sites (
  id   smallserial primary key,
  name text not null unique
);

insert into sites (name) values ('Szakoly'), ('Balkány'), ('Nyíregyháza')
  on conflict (name) do nothing;

create table if not exists pallet_types (
  id            smallserial primary key,
  name          text not null unique,
  default_price integer, -- Ft/db, "Irányár" (lehet null, ha nincs egységesen árazva)
  sort_order    smallint
);

insert into pallet_types (name, default_price) values
  ('EUR világos', 1200),
  ('EUR szürke', 800),
  ('EUR új', null),
  ('800x1200 új', null),
  ('800x1200 használt', null),
  ('1000x1200 új', null),
  ('1000x1200 használt', null),
  ('Színes', null),
  ('Gitterbox', null),
  ('Raklap magasító', null),
  ('Emili raklap', null),
  ('1600-as', null),
  ('1700-as', null),
  ('670-es', null),
  ('740-es', null),
  ('IBC', null),
  ('Egyutas 80-as', null),
  ('Egyutas 100-as', null),
  ('Egyutas gyenge', null),
  ('Csere', 800),
  ('EUR törött', null),
  ('H1 raklap', null),
  ('1000x1200-as körtalpas', null),
  ('BIG-BAG', null),
  ('Vegyes EUR', 900)
  on conflict (name) do nothing;

-- Egységes típussorrend mindenhol az alkalmazásban: EUR-család, Színes,
-- Egyutas, Gitterbox, H1 raklap, a többi vegyes típus, majd IBC és BIG-BAG
-- mindig a legvégén.
alter table pallet_types add column if not exists sort_order smallint;

update pallet_types set sort_order = case name
  when 'EUR világos'              then 1
  when 'EUR szürke'                then 2
  when 'EUR új'                    then 3
  when 'EUR törött'                then 4
  when 'Csere'                     then 5
  when 'Vegyes EUR'                then 6
  when 'Színes'                    then 7
  when 'Egyutas 80-as'             then 8
  when 'Egyutas 100-as'            then 9
  when 'Egyutas gyenge'            then 10
  when 'Gitterbox'                 then 11
  when 'H1 raklap'                 then 12
  when '800x1200 új'               then 13
  when '800x1200 használt'         then 14
  when '1000x1200 új'              then 15
  when '1000x1200 használt'        then 16
  when '1000x1200-as körtalpas'    then 17
  when 'Raklap magasító'           then 18
  when 'Emili raklap'              then 19
  when '1600-as'                   then 20
  when '1700-as'                   then 21
  when '670-es'                    then 22
  when '740-es'                    then 23
  when 'IBC'                       then 24
  when 'BIG-BAG'                   then 25
  else 99
end;

-- Melyik típus aktív melyik telephelyen (kipipálható lista).
create table if not exists site_active_types (
  site_id smallint not null references sites(id),
  type_id smallint not null references pallet_types(id),
  primary key (site_id, type_id)
);

-- Szakoly / Balkány / Nyíregyháza-fő mozgások: be, ki, telephelyek közti mozgatás.
create table if not exists keszlet_movements (
  id             bigserial primary key,
  site_id        smallint not null references sites(id),
  type_id        smallint not null references pallet_types(id),
  direction      text not null check (direction in ('be', 'ki', 'mozgatas')),
  qty            integer not null check (qty > 0),
  partner        text,
  target_site_id smallint references sites(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_keszlet_movements_site on keszlet_movements (site_id, type_id);

-- Utólagos bővítés (2026-09-08): a "mozgatas" korábban csak a forrás telep
-- készletéből vonta le a mennyiséget, a cél telepen semmi nem történt — a
-- mennyiség egyszerűen eltűnt. A "mozgatas_be" a mozgatás célnál keletkező
-- párja (lásd lib/keszlet/actions.ts recordMovement): ugyanaz a mozgatás
-- egyszerre két sorral kerül rögzítésre — a forrásnál "mozgatas" (levonás),
-- a célnál "mozgatas_be" (jóváírás), a target_site_id mindkét soron a
-- másik telepre mutat.
alter table keszlet_movements drop constraint if exists keszlet_movements_direction_check;
alter table keszlet_movements add constraint keszlet_movements_direction_check
  check (direction in ('be', 'ki', 'mozgatas', 'mozgatas_be'));

-- Nyíregyháza Havi fül: készpénzes felvásárlás.
create table if not exists nyiregyhaza_purchases (
  id          bigserial primary key,
  type_id     smallint not null references pallet_types(id),
  qty         integer not null check (qty > 0),
  unit_price  integer not null,
  total       integer not null,
  seller      text not null,
  pending     boolean not null default false, -- nyitvatartáson túl leadva, kifizetésre vár
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

-- Utólagos oszlop: a felvásárláshoz tartozó mozgás visszavonhatóságához.
alter table keszlet_movements add column if not exists purchase_id bigint references nyiregyhaza_purchases(id);

-- Utólagos oszlop: fizetési mód — 'keszpenz' (kasszát csökkenti) vagy 'atutalas' (kasszát nem érinti).
alter table nyiregyhaza_purchases add column if not exists payment_method text not null default 'keszpenz';

-- Nyíregyháza kassza mozgásai (felvásárlás -, csere +, egyéb kiadás -).
create table if not exists kassza_movements (
  id          bigserial primary key,
  description text not null,
  amount      integer not null, -- előjeles, Ft
  purchase_id bigint references nyiregyhaza_purchases(id),
  created_at  timestamptz not null default now()
);

-- Nyíregyháza fül eseménynaplója: csere, szétválogatás, havi zárás.
create table if not exists keszlet_events (
  id         bigserial primary key,
  site_id    smallint not null references sites(id),
  kind       text not null check (kind in ('csere', 'szet', 'havi-zaras', 'mozgas')),
  details    text not null,
  effect     text not null,
  created_at timestamptz not null default now()
);
alter table keszlet_events add column if not exists purchase_id bigint references nyiregyhaza_purchases(id);

-- Leltár: típusonkénti számlálás, elfogadott/elutasított korrekcióval.
create table if not exists inventory_counts (
  id            bigserial primary key,
  site_id       smallint not null references sites(id),
  type_id       smallint not null references pallet_types(id),
  expected_qty  integer not null,
  counted_qty   integer not null,
  accepted      boolean not null,
  comment       text,
  created_at    timestamptz not null default now()
);

-- Felhasználó-bélyegző: ki rögzítette a tételt. A böngészőben eltárolt névvel
-- töltődik, nincs mögötte bejelentkezés/jogosultság — csak nyomon követhetőség.
alter table keszlet_movements add column if not exists created_by text;
alter table nyiregyhaza_purchases add column if not exists created_by text;
alter table kassza_movements add column if not exists created_by text;
alter table keszlet_events add column if not exists created_by text;
alter table inventory_counts add column if not exists created_by text;

-- Több típus egy mentésben (recordMovements) esetén az egy tranzakcióban
-- felvett keszlet_movements-sorokat és a hozzájuk tartozó (Nyíregyházán
-- keletkező, összevont) keszlet_events-sort egy közös, véletlen azonosító
-- köti össze — ez teszi lehetővé, hogy a "Legutóbbi mozgások" listából egy
-- tétel törlésekor az ÖSSZES hozzá tartozó mozgás-sor (nem csak az
-- esemény-napló bejegyzés) is eltűnjön, típusok számától függetlenül.
alter table keszlet_movements add column if not exists movement_group uuid;
alter table keszlet_events add column if not exists movement_group uuid;
create index if not exists idx_keszlet_movements_group on keszlet_movements (movement_group);

-- Kassza-tétel kategóriája: 'felvasarlas' = felvásárláshoz/cseréhez/kifizetésre
-- váró tétel kiegyenlítéséhez kötődő kiadás (ezek a Kassza mozgások nézetben
-- havonta egy összesítő sorba vonódnak), 'egyeb' = minden más (kézzel felvitt
-- kiadás, pl. számla, bevétel, nyitó kassza) — ezek egyenként látszanak.
alter table kassza_movements add column if not exists category text not null default 'egyeb';
update kassza_movements set category = 'felvasarlas' where purchase_id is not null and category = 'egyeb';
update kassza_movements set category = 'felvasarlas' where description like 'Kifizetés — %' and category = 'egyeb';

-- Fuvarozás — megbízások (saját fuvar vagy bérfuvar/alvállalkozó).
create table if not exists fuvar_megbizasok (
  id           bigserial primary key,
  tipus        text not null check (tipus in ('sajat', 'ber')),
  datum        date not null,
  felrako      text not null,
  lerako       text not null,
  megrendelo   text,
  aru          text,
  -- Saját fuvarnál a jármű rendszáma, bérfuvarnál az alvállalkozó (fuvarozó partner) neve.
  jarmu        text,
  alvallalkozo text,
  fuvardij     integer,
  koltseg      integer,
  statusz      text not null default 'uj' check (
    statusz in ('uj', 'tervezett', 'uton', 'lezarva', 'szamlazva', 'problemas', 'torolt')
  ),
  megjegyzes   text,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists idx_fuvar_megbizasok_tipus on fuvar_megbizasok (tipus, datum desc);

-- Kibővítés: PDF/e-mail alapú megbízás-felismeréshez (spec 8. pont) — a
-- rendszer előkészít egy fuvart, de "ellenorzott = false" amíg valaki
-- jóvá nem hagyja vagy nem módosítja. A dokumentum forrása (pl. Drive-link)
-- és néhány további mező is idekerül.
alter table fuvar_megbizasok add column if not exists idopont text;
alter table fuvar_megbizasok add column if not exists mennyiseg text;
alter table fuvar_megbizasok add column if not exists suly text;
alter table fuvar_megbizasok add column if not exists sofor text;
alter table fuvar_megbizasok add column if not exists dokumentum_url text;
alter table fuvar_megbizasok add column if not exists drive_file_id text;

-- Duplikáció-tisztítás (2026-09-09), a lenti egyedi index előfeltétele: a
-- drive-allapot végpont korábbi hibája miatt (a törölt sorok "eltűntek" a
-- Drive-automatika ismert-dokumentumok listájából, lásd
-- app/api/fuvarozas/drive-allapot/route.ts) egy már törölt megbízás
-- dokumentuma újra importálódhatott, duplikátumot létrehozva. Ha egy
-- dokumentum_url-hez több sor is tartozik, az elsőn (legkisebb id, az
-- eredeti importálás) kívül a többiről levesszük a dokumentum_url-t — EGYETLEN
-- más mezőt (statusz, fuvardíj stb.) sem módosítunk, egy sor sem törlődik,
-- csak a "honnan importálódott" hivatkozás egyértelműsödik, hogy az alábbi
-- egyedi index biztonságosan létrehozható legyen. Ismételt lefutáskor no-op.
update fuvar_megbizasok f
set dokumentum_url = null
where f.dokumentum_url is not null
  and f.id > (
    select min(f2.id) from fuvar_megbizasok f2 where f2.dokumentum_url = f.dokumentum_url
  );

-- Duplikálás elleni védelem: a Drive-automatika ugyanazt a dokumentumot
-- csak egyszer importálhatja be, akkor is, ha az egyik oldali
-- (drive-allapot) dedup-logika valamiért mégis "újnak" látná (pl. jövőbeli
-- hiba miatt) — az addFuvar insert "on conflict do nothing"-ot használ erre
-- az indexre, lásd lib/fuvarozas/megbizasok.ts.
create unique index if not exists idx_fuvar_megbizasok_dokumentum_url_unique
  on fuvar_megbizasok (dokumentum_url) where dokumentum_url is not null;
alter table fuvar_megbizasok add column if not exists forras text not null default 'kezi'
  check (forras in ('kezi', 'pdf_import'));
alter table fuvar_megbizasok add column if not exists ellenorzott boolean not null default true;

-- Egyszerűsített "Új saját fuvar" gyorsrögzítéshez (csak dátum, megrendelő,
-- lerakó) a felrakó mostantól nem kötelező.
alter table fuvar_megbizasok alter column felrako drop not null;

-- Bér fuvarok listaoszlopaihoz: a megbízás beérkezésének dátuma (elkülönítve
-- a felrakás dátumától, ami a "datum" oszlop), a lerakás dátuma (ha eltér a
-- felrakás dátumától), és a megbízásban szereplő fizetési határidő (napban).
alter table fuvar_megbizasok add column if not exists erkezett_datum date;
alter table fuvar_megbizasok add column if not exists lerakas_datum date;
alter table fuvar_megbizasok add column if not exists fizetesi_hatarido_nap integer;

-- A megbízó által adott hivatkozási szám a fuvarhoz — a sablonban
-- "pozíciószám", de a megbízók hívják fuvarszámnak, hivatkozási számnak vagy
-- megbízási számnak is; ugyanaz a mező. FONTOS a beérkező számlák
-- automatikus párosításához (lásd Kapcsolatok/Számla modul), ezért a rendszer
-- figyelmeztet, ha hiányzik. A "pozicioszam_nincs" jelöli, ha az adott
-- megbízónál valóban nincs ilyen szám (ekkor a figyelmeztetés nem jelenik meg
-- hamis szám kitalálása nélkül). NEM keverendő a kiállított számla saját
-- számával (az egy külön, később bekötendő mező lesz).
alter table fuvar_megbizasok add column if not exists pozicioszam text;
alter table fuvar_megbizasok add column if not exists pozicioszam_nincs boolean not null default false;

-- Számla/Posta fül: hová kell postázni a kiállított számlát ehhez a
-- fuvarhoz (ha a megbízó papíralapú számlát kér, és nem a székhelyére).
alter table fuvar_megbizasok add column if not exists postazasi_cim text;

-- A Számla/Posta nézethez: a megbízáshoz tartozó postázási cím (ahová a
-- kiállított számlát postán ki kell küldeni) — külön mező, mert eltérhet a
-- felrakó/lerakó címtől és megbízásonként is változhat ugyanannál a partnernél.
alter table fuvar_megbizasok add column if not exists postazasi_cim text;

-- Számla/Posta fül: jelölő, hogy a fuvar dokumentációja (számla + megbízás)
-- ténylegesen postára lett-e adva a megrendelőnek.
alter table fuvar_megbizasok add column if not exists postazva boolean not null default false;

-- Számla/Posta fül: a fuvarhoz kiállított SAJÁT számla sorszáma (nem
-- keverendő a "pozicioszam" mezővel, ami a megbízó hivatkozási száma).
alter table fuvar_megbizasok add column if not exists szamla_szam text;

-- Számla/Posta fül: mikor lett a "Postázva" jelölő bepipálva — ebből
-- számítjuk az 5 perces visszavonási ablakot, és ennek leteltével a sor
-- automatikusan (időalapon, külön oszlop/job nélkül) átkerül az Archív
-- fülre. A jelölő visszavonásakor (kipipálás törlése) nullázódik.
alter table fuvar_megbizasok add column if not exists postazva_at timestamptz;

-- Bér fuvarok — folyamatban fül: kézi "Teljesítve" jelölő. A fülek közti
-- automatikus mozgás alapból a lerakás dátumán múlik (lásd
-- getFolyamatbanSajatFuvarok / getSzamlaPostaFuvarok), de a valóságban egy
-- fuvar a rögzített (tervezett) dátum előtt is befejeződhet — ilyenkor ez a
-- jelölő azonnal átteszi a Számla/Posta fülre, A VALÓS lerakás dátum
-- meghamisítása (visszaírása) nélkül.
alter table fuvar_megbizasok add column if not exists teljesitve boolean not null default false;
alter table fuvar_megbizasok add column if not exists teljesitve_at timestamptz;

-- Fuvarozás — Kapcsolatok fül: a megbízásokból (és a hozzájuk tartozó
-- e-mailekből) kinyert cégenkénti kapcsolattartók. Egy céghez több
-- kapcsolattartó/telefon/e-mail sor is tartozhat.
create table if not exists fuvar_kapcsolatok (
  id             bigserial primary key,
  ceg            text not null,
  kapcsolattarto text,
  telefon        text,
  email          text,
  forras         text, -- pl. a drive dokumentum neve vagy e-mail, ahonnan származik
  created_at     timestamptz not null default now()
);
create index if not exists idx_fuvar_kapcsolatok_ceg on fuvar_kapcsolatok (ceg);

-- Kapcsolatok fül: szabad szöveges megjegyzés a kapcsolattartóhoz.
alter table fuvar_kapcsolatok add column if not exists megjegyzes text;

-- Számlák modul — kintlévőség-követő. FONTOS: ez a modul NEM állít ki
-- számlát, hanem a Számlázz.hu-ban (ahol a cég ténylegesen számláz)
-- kiállított kimenő számlákat tükrözi vissza egyetlen, központi
-- lekérdezéssel (lásd lib/szamlak/poll.ts) — más modulok (pl. Fuvarozás)
-- ebből a táblából olvasnak, NEM kérdezik le maguk a Számlázz.hu API-t,
-- hogy elkerüljük a háromszoros API-terhelést és az egymásnak ellentmondó
-- állapotokat.
create table if not exists szamla (
  id                bigserial primary key,
  -- A Számlázz.hu-beli sorszám, pl. "WLLWR-2026-283" — ebből bontjuk ki az
  -- előtagot/évet/sorszámot a lekérdezés-sorrendhez (lib/szamlak/poll.ts).
  szamlaszam        text not null unique,
  vevo_nev          text not null,
  rendelesszam      text,
  fizmod            text,
  penznem           text not null default 'HUF',
  teljesites_datum  date,
  kiallitas_datum   date not null,
  fizetesi_hatarido date,
  netto              numeric,
  afa                numeric,
  brutto             numeric not null,
  -- A tételek (megnevezés-lista) alapján automatikus kategorizálás
  -- (lib/szamlak/categorize.ts): 'fuvar' vagy 'raklap'; a 'raklap' a vevő
  -- neve alapján tovább bomlik alkategóriára.
  kategoria          text not null check (kategoria in ('fuvar', 'raklap')),
  alkategoria        text check (alkategoria in ('fabrika', 'keter', 'egyeb')),
  tetelek_szoveg     text, -- a tételek megnevezése, összefűzve (kategorizáláshoz és megjelenítéshez)
  -- A Számlázz.hu nem küld vissza fizetettségi státuszt ehhez a
  -- workflow-hoz — a "Fizetve" jelölés kézi, a dolgozó pipálja ki.
  fizetve            boolean not null default false,
  fizetve_datum      timestamptz,
  raw_xml            text, -- a lekérdezett teljes <szamla> XML válasz, hibakereséshez
  lekerdezve_at      timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  -- Rontott/sztornózott számlák automatikus felismerése (lib/szamlak/sztorno.ts):
  -- "sztorno" = ez a sor maga egy negatív összegű törlő/helyesbítő számla;
  -- "sztornozva" = EZT a (pozitív) számlát törölte/helyesbítette egy másik,
  -- negatív összegű számla; "sztornozo_szamla_id" a párja. Mindkét fél ki
  -- van zárva a Fizetve/Nyitott listákból és az összesítőből, hogy egy
  -- rontott számla ne szerepeljen tévesen "Fizetve"-ként.
  sztorno              boolean not null default false,
  sztornozva           boolean not null default false,
  sztornozo_szamla_id  bigint references szamla(id)
);
create index if not exists idx_szamla_kategoria on szamla (kategoria, alkategoria);
create index if not exists idx_szamla_fizetve on szamla (fizetve, fizetesi_hatarido);

-- Egyszeri migráció (2026-09-06): ha a szamla tábla korábban jött létre
-- ezen oszlopok nélkül, pótoljuk őket.
alter table szamla add column if not exists sztorno boolean not null default false;
alter table szamla add column if not exists sztornozva boolean not null default false;
alter table szamla add column if not exists sztornozo_szamla_id bigint references szamla(id);

-- Egy meg nem talált számlaszám nem jelenti azt, hogy soha nem is lesz — a
-- Számlázz.hu-ban egy sorszám lefoglalása megelőzheti a tényleges kiállítást.
-- Ezért minden "nem található" választ (hibakód 7) ide teszünk, és minden
-- további lekérdezési körben újra megvizsgáljuk, a fő kereső állásától
-- függetlenül, amíg "feladva" nem lesz (lásd lib/szamlak/poll.ts — kb. 400
-- napos határidő).
create table if not exists szamlak_poll_pending (
  szamlaszam     text primary key,
  eloszor_probalt_at timestamptz not null default now(),
  utoljara_probalt_at timestamptz not null default now(),
  probalkozasok  integer not null default 1,
  feladva        boolean not null default false
);

-- Állapot-tábla ELŐTAGONKÉNT egy sor: melyik évhez meddig jutott el az adott
-- számlatömb-előtag fő keresője (a legutóbb sikeresen ELÉRT sorszám, a
-- lyukakat a fenti pending tábla kezeli), és mikor futott le legutóbb egy
-- teljes kör. A cég több számlatömböt is használ Számlázz.hu-ban (pl.
-- "WLLWR", "WNYH"), ezért ELŐTAGONKÉNT FÜGGETLEN sorszám-kereső fut.
create table if not exists szamlak_poll_allapot (
  elotag            text primary key,
  ev                integer not null,
  utolso_sorszam    integer not null default 0,
  utolso_futas_at   timestamptz
);

-- Egyszeri migráció (2026-09-06): a tábla korábban egyetlen, "id=1"-hez
-- kötött sorból állt (egyetlen előtaggal, "WLLWR"). Ha még a régi alakban
-- van (nincs "elotag" oszlop), áttesszük "elotag" elsődleges kulcsra, a
-- meglévő haladást megőrizve.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'szamlak_poll_allapot' and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'szamlak_poll_allapot' and column_name = 'elotag'
  ) then
    alter table szamlak_poll_allapot add column elotag text;
    update szamlak_poll_allapot set elotag = 'WLLWR' where elotag is null;
    alter table szamlak_poll_allapot alter column elotag set not null;
    alter table szamlak_poll_allapot drop constraint if exists szamlak_poll_allapot_check;
    alter table szamlak_poll_allapot drop constraint if exists szamlak_poll_allapot_pkey;
    alter table szamlak_poll_allapot add constraint szamlak_poll_allapot_pkey primary key (elotag);
    alter table szamlak_poll_allapot drop column if exists id;
  end if;
end $$;

insert into szamlak_poll_allapot (elotag, ev, utolso_sorszam)
  values ('WLLWR', extract(year from now())::int, 0)
  on conflict (elotag) do nothing;
insert into szamlak_poll_allapot (elotag, ev, utolso_sorszam)
  values ('WNYH', extract(year from now())::int, 0)
  on conflict (elotag) do nothing;

-- Egyszeri, névvel azonosított javítások nyilvántartása (scripts/migrate.mjs),
-- hogy egy-egy javítás csak EGYSZER fusson le, ne minden deploy-nál újra.
create table if not exists alkalmazott_javitasok (
  kod text primary key,
  alkalmazva_at timestamptz not null default now()
);

-- Bejelentkezés / felhasználók (2026-09-07).
-- Egyszerű felhasználónév alapú belépés, bcrypt-hash-elt jelszóval.
-- A szerepkör-alapú jogosultságkezelés (Admin/Ügyvezető/Fuvarszervező/stb.)
-- későbbi fázis — egyelőre a "role" mező csak tájékoztató jellegű.
create extension if not exists pgcrypto;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  name          text not null,
  role          text not null default 'admin',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Modulonkénti (fuvarozás, készlet, számlák, dolgozók, járművek, beállítások)
-- megtekintési/szerkesztési jogosultság JSON-ban tárolva, pl.
-- {"keszlet": {"view": true, "edit": false}}. Hiányzó modulkulcs esetén az
-- alkalmazás mindkettőt (view+edit) engedélyezettnek tekinti — lásd
-- lib/auth/permissions.ts. Az "admin" szerepkör mindig mindenhez hozzáfér,
-- ettől a mezőtől függetlenül.
alter table users add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Dolgozók (Alkalmazottak) modul (2026-09-07). Egy dolgozónak a három
-- bérmező (weekly_wage/daily_wage/monthly_wage) közül pontosan EGY legyen
-- kitöltve — ez dönti el, melyik kártyatípust (heti/napi/fix havi) kapja a
-- felületen; a validáció az alkalmazás oldalán történik
-- (lib/dolgozok/actions.ts), nem adatbázis-constraint-tel.
create table if not exists alkalmazottak (
  id               bigserial primary key,
  name             text not null,
  position         integer not null default 0,
  weekly_wage      integer not null default 0,
  daily_wage       integer not null default 0,
  monthly_wage     integer not null default 0,
  fixed_deduction  integer not null default 0,
  -- Csak fix havi béreseknél számít: van-e a kártyán "Letiltás"/"Üzemanyag"
  -- beviteli mező (nem minden havi béres dolgozónál értelmezhető).
  show_letiltas    boolean not null default false,
  show_uzemanyag   boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Heti béresek: hónaponta 4 sor (1-4. hét), egyenként kipipálható.
create table if not exists alkalmazott_heti_ber (
  id           bigserial primary key,
  employee_id  bigint not null references alkalmazottak(id) on delete cascade,
  year         integer not null,
  month        integer not null check (month between 1 and 12),
  week_index   smallint not null check (week_index between 1 and 4),
  amount       integer not null default 0,
  paid         boolean not null default false,
  paid_at      timestamptz,
  paid_by      text,
  unique (employee_id, year, month, week_index)
);

-- Napi ÉS fix havi béresek: hónaponta 1 sor (közös tábla — a napi/fix havi
-- formula a rá vonatkozó oszlopokat használja, lásd lib/dolgozok/actions.ts).
create table if not exists alkalmazott_napi_havi_ber (
  id           bigserial primary key,
  employee_id  bigint not null references alkalmazottak(id) on delete cascade,
  year         integer not null,
  month        integer not null check (month between 1 and 12),
  days_count   integer not null default 0,
  utalas       integer not null default 0,
  eloleg       integer not null default 0,
  letiltas     integer not null default 0,
  uzemanyag    integer not null default 0,
  paid         boolean not null default false,
  paid_at      timestamptz,
  paid_by      text,
  unique (employee_id, year, month)
);

-- Előlegek — önálló, dolgozónkénti lista. A napi/fix havi kártya "Előleg"
-- mezője automatikusan létrehoz/frissít ide egy sort (auto_key azonosítja,
-- hónaponta egyet) — ez a sor csak a kártyán módosítható, ezért a kézi
-- törlés (lib/dolgozok/actions.ts:deleteAdvance) elutasítja. Minden más sor
-- kézzel felvitt, önálló előleg (lehet negatív is — az levonást jelent).
create table if not exists alkalmazott_elolegek (
  id           bigserial primary key,
  employee_id  bigint not null references alkalmazottak(id) on delete cascade,
  advance_date date not null default current_date,
  amount       integer not null,
  note         text,
  auto_key     text unique,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_alkalmazott_elolegek_employee on alkalmazott_elolegek (employee_id, advance_date desc);

-- A modul aktuális ("nyitott") hónapja — NEM a naptári hónap, lásd
-- lib/dolgozok/actions.ts:getPointer(). Egyetlen sor (id=1).
create table if not exists alkalmazottak_allapot (
  id     smallint primary key default 1 check (id = 1),
  year   integer not null,
  month  integer not null check (month between 1 and 12)
);

-- Jelenléti/üzenőfal modul (2026-09-07). Két kijelölt dolgozó napi
-- érkezés/távozás idejét rögzíti egyelőre kézzel (dolgozói bejelentkezés
-- még nincs kiépítve — lásd lib/jelenlet/actions.ts), plusz egy
-- telephelyenkénti feladat-üzenőfal.
alter table alkalmazottak add column if not exists jelenlet_aktiv boolean not null default false;

create table if not exists jelenletek (
  id             bigserial primary key,
  employee_id    bigint not null references alkalmazottak(id) on delete cascade,
  work_date      date not null,
  arrival_time   time,
  departure_time time,
  created_at     timestamptz not null default now()
);
create index if not exists idx_jelenletek_employee_date on jelenletek (employee_id, work_date desc);

-- (2026-09-08): egy napon belül TÖBBSZÖR is lehet érkezés/távozás (pl.
-- hazamegy, majd visszajön kamiont pakolni) — egy sor egy munkaidő-
-- szakaszt (session) jelent, nem a teljes napot, ezért a korábbi
-- (employee_id, work_date) UNIQUE megkötés megszűnik.
alter table jelenletek drop constraint if exists jelenletek_employee_id_work_date_key;

-- Sürgősség: 1 = piros/azonnali … 5 = zöld/ráér.
create table if not exists feladatok (
  id          bigserial primary key,
  task_date   date not null default current_date,
  site_id     smallint not null references sites(id),
  description text not null,
  urgency     smallint not null check (urgency between 1 and 5),
  repeat_freq text not null default 'egyszeri' check (repeat_freq in ('egyszeri', 'heti', 'ketheti', 'havi')),
  done        boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_feladatok_date on feladatok (done, task_date desc, id desc);

-- Dolgozói bejelentkezés (2026-09-08): egy user account egy alkalmazottak
-- sorhoz köthető — ez teszi lehetővé, hogy a saját (mobil) /erkezes nézet
-- admin kiválasztás nélkül tudja, melyik dolgozó jelenlét-sorát írja.
alter table users add column if not exists employee_id bigint references alkalmazottak(id);

-- Feladatokhoz fűzött megjegyzések (pl. a dolgozó beírja, mit végzett el).
create table if not exists feladat_megjegyzesek (
  id         bigserial primary key,
  feladat_id bigint not null references feladatok(id) on delete cascade,
  author     text,
  comment    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_feladat_megjegyzesek_feladat on feladat_megjegyzesek (feladat_id, created_at);

-- Elvégzés dátuma (2026-09-08): eddig a "kész" pipa (done) egy időpontot
-- sem rögzített, ezért a kész feladatok csak lecsúsztak a lista aljára,
-- nyomon követhetetlenül — lásd lib/jelenlet/actions.ts:toggleFeladatDone,
-- ami mostantól ezt is beállítja/törli. Az Archívum fül (app/jelenlet/
-- archivum) ez alapján, heti bontásban listázza a kész feladatokat.
alter table feladatok add column if not exists elvegzes_datum date;
update feladatok set elvegzes_datum = task_date where done = true and elvegzes_datum is null;

-- Szabadság / Betegszabadság (2026-09-08): egy jelenletek-sor eddig
-- mindig egy munkaidő-szakaszt (érkezés/távozás) jelentett — a day_type
-- mostantól azt is lehetővé teszi, hogy egy sor egy egész napos távollétet
-- jelöljön (arrival/departure nélkül). A note szabad szöveges megjegyzés,
-- bármelyik gombhoz (érkezés/távozás/szabadság/betegszabadság) írható a
-- saját (mobil) /erkezes nézeten — lásd lib/jelenlet/actions.ts.
alter table jelenletek add column if not exists day_type text not null default 'munka'
  check (day_type in ('munka', 'szabadsag', 'beteg'));
alter table jelenletek add column if not exists note text;
