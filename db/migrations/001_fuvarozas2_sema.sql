-- Fuvarozás 2 — séma (E4, 2026-09-19). Egyszer fut, egy tranzakcióban.
--
-- ELV: minden új tábla és oszlop a RÉGIEK MELLÉ kerül. Egyetlen régi oszlop
-- sem törlődik, nem nevezünk át, a régi kód változatlanul fut tovább
-- (átállás-ellenőrzés 1. fejezet: az adat szintjén marad a háló). A régi
-- oszlopok a cutover után 4 hétig maradnak; az átnevezés (`regi_` előtag) és
-- a törlés a 7. „takarítás" kör külön migrációja lesz.
--
-- Forrás: claude/fuvarozas-logikai-ujratervezes.md 2. fejezet (entitások),
-- claude/fuvarozas-atallas-ellenorzes.md 3. (S9, S10, S14, S15), 4. (T7,
-- T10, T11, T19), 11.1 (állapotok), 11.3 (fuvar_dokumentumok, timestamptz).
--
-- A hivatkozott, MÁR LÉTEZŐ táblák: fuvar_megbizasok, fuvar_megallo_allapot,
-- fuvar_dokumentumok, fuvar_kapcsolatok, fuvar_helyszin_koordinata, szamla,
-- alkalmazottak, users.

-- ---------------------------------------------------------------------------
-- 1. Járművek törzse (5. fejezet: a harmadik kocsi ne konstansból jöjjön).
--    A lib/fuvarozas/vehicles.ts SAJAT_JARMUVEK listája marad a kód
--    forrása, amíg az olvasás át nem áll — ez a tábla ugyanazt tartalmazza.
create table if not exists fuvar_jarmuvek (
  id                  bigserial primary key,
  kod                 text not null unique,           -- 'AOPU-427', 'NMZ-492', 'JANI'
  cimke               text not null,                  -- 'AOPU-427/AOTY-474'
  vontato_rendszam    text,
  potkocsi_rendszam   text,
  irasvaltozatok      text[] not null default '{}',   -- 'NZM-492' (Duvenbeck elírás)
  szin                text not null default 'blue',
  ecofleet_object_id  text,
  sofor_id            bigint references alkalmazottak(id),
  aktiv               boolean not null default true,
  fogyasztas_l_100km  numeric(5,2),                   -- Ecofleet 14 napos átlag, ha van
  napi_fix_ft         integer,                        -- amortizáció+biztosítás+lízing / munkanap
  created_at          timestamptz not null default now()
);
insert into fuvar_jarmuvek (kod, cimke, vontato_rendszam, potkocsi_rendszam, irasvaltozatok, szin, ecofleet_object_id)
values
  ('AOPU-427', 'AOPU-427/AOTY-474', 'AOPU-427', 'AOTY-474', '{}', 'blue', '1144376'),
  ('NMZ-492',  'NMZ-492/XZV-926',  'NMZ-492',  'XZV-926',  '{NZM-492}', 'yellow', '369485'),
  ('JANI',     'DAF XG (gyártás alatt)', null, null, '{}', 'green', null)
on conflict (kod) do nothing;
update fuvar_jarmuvek j set sofor_id = a.id
from alkalmazottak a
where j.sofor_id is null
  and ((j.kod = 'AOPU-427' and a.name = 'Vadon Gergő')
    or (j.kod = 'NMZ-492' and a.name in ('Takács Micó', 'Takács Miklós')));

-- ---------------------------------------------------------------------------
-- 2. Partner-törzs (2.1). A megbízásokon szabad szövegként álló megrendelő
--    egy sorhoz kötődik; a fuvaronként találgatott határidők és címek innen
--    jönnek snapshotként.
create table if not exists fuvar_partnerek (
  id                          bigserial primary key,
  nev                         text not null,
  nev_kulcs                   text not null unique,   -- normalizaltCegKulcs(nev)
  nevvaltozatok               text[] not null default '{}',
  adoszam                     text,
  szekhely                    text,
  szamlazasi_cim              text,
  postazasi_cim               text,
  szamlazasi_email            text,
  fizetesi_hatarido_nap       integer,
  papir_bekuldesi_hatarido_nap integer,
  papir_kotelezo              boolean not null default true,
  szamlan_kert_szam           text not null default 'pozicioszam'
                                check (szamlan_kert_szam in ('pozicioszam', 'reise_id', 'hivatkozas')),
  hivatkozas_formatum         text,                   -- regex, opcionális
  sablon_azonosito            text,                   -- 'duvenbeck', 'ab-speed', 'happ', ...
  szamla_email_sablon         text,                   -- 9. fejezet: partnerenkénti felülírás
  megbizas_pdf_csatolva       boolean not null default false,
  szamla_email_nem_kell       boolean not null default false,  -- 11.1 13. él
  posta_nem_kell              boolean not null default false,  -- 11.1 13. él
  rakodas_varakozas_szunet    boolean not null default false,  -- 7.3/2: a kapuban töltött idő szünet-e
  portal_url                  text,
  portal_pin_titkositva       text,                   -- 5. fejezet: Duvenbeck PIN titkosítva
  email_domainek              text[] not null default '{}',
  megjegyzes                  text,
  created_at                  timestamptz not null default now(),
  frissitve_at                timestamptz not null default now()
);
alter table fuvar_kapcsolatok add column if not exists partner_id bigint references fuvar_partnerek(id);
create index if not exists idx_fuvar_kapcsolatok_partner on fuvar_kapcsolatok (partner_id);

-- ---------------------------------------------------------------------------
-- 3. A megbízás új oszlopai (2.2) — a régiek MELLÉ.
alter table fuvar_megbizasok add column if not exists partner_id bigint references fuvar_partnerek(id);
-- Jelleg HELYES irányban: ber = számlázandó megbízás, sajat = belső áru.
-- A mai tipus fordítva van (tipus='sajat' → „Bér fuvarok" fül). Backfill most,
-- a kettős írást a kód végzi az átállásig; a 7. körben a tipus megy.
alter table fuvar_megbizasok add column if not exists jelleg text
  check (jelleg in ('ber', 'sajat'));
update fuvar_megbizasok set jelleg = case tipus when 'sajat' then 'ber' else 'sajat' end
where jelleg is null;
alter table fuvar_megbizasok add column if not exists hivatkozas_kanonikus text;
alter table fuvar_megbizasok add column if not exists hivatkozas_nyers text;
alter table fuvar_megbizasok add column if not exists hivatkozas_masodlagos text;
alter table fuvar_megbizasok add column if not exists hivatkozas_nincs boolean not null default false;
alter table fuvar_megbizasok add column if not exists jarmu_id bigint references fuvar_jarmuvek(id);
alter table fuvar_megbizasok add column if not exists sofor_id bigint references alkalmazottak(id);
-- Állapot (11.1) — NULL az E6 backfillig; a kód addig nem olvassa.
alter table fuvar_megbizasok add column if not exists allapot text
  check (allapot in ('ellenorzesre_var', 'tervezett', 'folyamatban', 'teljesitve',
                     'szamlazhato', 'szamlazva', 'email_elment', 'postazva', 'lezart'));
alter table fuvar_megbizasok add column if not exists allapot_at timestamptz;
alter table fuvar_megbizasok add column if not exists hianylista jsonb not null default '[]'::jsonb;
-- Soft delete külön oszlopban (S9) — az allapot érintetlen marad.
alter table fuvar_megbizasok add column if not exists torolt_at timestamptz;
alter table fuvar_megbizasok add column if not exists torolt_by text;
update fuvar_megbizasok set torolt_at = coalesce(torolt_at, now()) where statusz = 'torolt' and torolt_at is null;
-- Forrás-lista egy helyen (S14): a mai check constraint bővítve.
alter table fuvar_megbizasok drop constraint if exists fuvar_megbizasok_forras_check;
alter table fuvar_megbizasok add constraint fuvar_megbizasok_forras_check
  check (forras in ('kezi', 'pdf_import', 'drive_import', 'gmail_import', 'szallitolevel', 'kalkulacio'));
alter table fuvar_megbizasok add column if not exists kulso_azonosito text;  -- szállítólevél bizonylatszám stb.
alter table fuvar_megbizasok add column if not exists kalkulacio_id bigint;   -- FK lent, a tábla után
-- Üzleti kulcs (B6): csak nem törölt, hivatkozással bíró sorokon; a
-- duplikátumok rendezése az E5 kézi lépés — addig az index NEM jön létre
-- (különben a migráció elhasalna a mai duplikátumokon). Az E6 backfill
-- migrációja hozza létre, miután a migracio_hiba = 0.

-- ---------------------------------------------------------------------------
-- 4. Megállók (2.3) — a fuvar_megallo_allapot indexes sorai helyett saját
--    sor, geokód-snapshottal.
create table if not exists fuvar_megallok (
  id                    bigserial primary key,
  megbizas_id           bigint not null references fuvar_megbizasok(id) on delete cascade,
  sorszam               integer not null,
  tipus                 text not null check (tipus in ('felrako', 'lerako')),
  hely_tipus            text not null default 'egyeb'
                          check (hely_tipus in ('sajat_telephely', 'partner_telephely', 'vevo', 'egyeb')),
  cim_nyers             text not null,
  telepules             text,
  lat                   double precision,
  lon                   double precision,
  cim_pontossag         text check (cim_pontossag in ('cim', 'telepules')),
  geokod_forras         text,
  tervezett_nap         date,
  ablak_tol             timestamptz,
  ablak_ig              timestamptz,
  sofor_megerkezett_at  timestamptz,
  sofor_kesz_at         timestamptz,
  sofor_kesz_by         text,
  varakozas_kezdete     timestamptz,
  varakozas_vege        timestamptz,
  gps_erkezes           timestamptz,
  gps_tavozas           timestamptz,
  gps_bizonytalan       boolean not null default false,
  felvasarlas_id        bigint,                       -- Készlet felvásárlás-tétel (8.3/2)
  megjegyzes            text,
  created_at            timestamptz not null default now(),
  unique (megbizas_id, sorszam)
);
create index if not exists idx_fuvar_megallok_gps_erkezes on fuvar_megallok (gps_erkezes);
create index if not exists idx_fuvar_megallok_tervezett_nap on fuvar_megallok (tervezett_nap);
-- A régi indexes állapot-sor megkapja az új megálló azonosítóját (S11:
-- egyszer, snapshotként, az E6 backfillben) — addig NULL.
alter table fuvar_megallo_allapot add column if not exists megallo_id bigint references fuvar_megallok(id);

-- ---------------------------------------------------------------------------
-- 5. Elszámolás (2.4) — 1:1, csak bér fuvarnál. Csak ADAT (időbélyegek,
--    snapshotok), az állapot a megbízáson van (S2).
create table if not exists fuvar_elszamolas (
  megbizas_id             bigint primary key references fuvar_megbizasok(id) on delete cascade,
  papirok_beerkeztek_at   timestamptz,
  papirok_beerkeztek_by   text,
  papir_hatarido          date,                       -- utolsó lerakó elhagyva + partner nap
  szamla_id               bigint references szamla(id),
  szamla_szam             text,
  szamla_kelte            date,
  fizetesi_hatarido_nap   integer,                    -- snapshot a partnerből
  fizetesi_esedekesseg    date,
  fizetve_at              date,
  postazasi_cim           text,                       -- snapshot a partnerből, felülírható
  szamlazasi_email        text,                       -- snapshot; a megbízáson kért cím nyer
  email_piszkozat_id      text,                       -- Gmail draft id
  email_elment_at         timestamptz,
  email_elment_by         text,
  email_szal_id           text,                       -- Gmail thread id
  postazva_at             timestamptz,
  postazva_by             text,
  created_at              timestamptz not null default now(),
  frissitve_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Eseménynapló (2.5) — minden átmenet és ténybeírás. Zárt esemény-lista
--    (5. fejezet + 11.3). A kliens által generált uuid az idempotencia (T10).
create table if not exists fuvar_megbizas_esemeny (
  id            bigserial primary key,
  megbizas_id   bigint not null references fuvar_megbizasok(id) on delete cascade,
  megallo_id    bigint references fuvar_megallok(id) on delete set null,
  esemeny       text not null check (esemeny in (
                  'letrehozva', 'importalva', 'jovahagyva', 'megerkezett', 'megallo_kesz',
                  'varakozas', 'gond', 'teljesitve', 'foto_megerkezett', 'szamlazhato',
                  'szamla_parositva', 'szamla_email_piszkozat', 'szamla_email_elkuldve',
                  'papir_beerkezett', 'postazva', 'lezart', 'visszaallitas', 'torolve',
                  'visszaallitva_torlesbol', 'modositva', 'hozzarendeles', 'koltseg',
                  'eta_elorejelzes', 'seged_muvelet', 'radar_ajanlas', 'radar_elvetve',
                  'migracio')),
  allapot_elott text,
  allapot_utan  text,
  forras        text not null check (forras in ('rendszer', 'ember', 'gps', 'sofor', 'migracio', 'import', 'szamla_szinkron', 'gmail', 'seged')),
  ki            text,
  mikor         timestamptz not null default now(),
  reszletek     jsonb not null default '{}'::jsonb,
  kliens_uuid   uuid
);
create unique index if not exists idx_fuvar_megbizas_esemeny_kliens_uuid
  on fuvar_megbizas_esemeny (kliens_uuid) where kliens_uuid is not null;
create index if not exists idx_fuvar_megbizas_esemeny_megbizas on fuvar_megbizas_esemeny (megbizas_id, mikor desc);

-- ---------------------------------------------------------------------------
-- 7. Dokumentumok (11.3): fuvarlevél-fotó Drive nélkül is (Telegram/PWA),
--    tartalom-hash a duplikálás ellen (S10).
alter table fuvar_dokumentumok alter column drive_file_id drop not null;
alter table fuvar_dokumentumok add column if not exists tartalom_hash text;
create unique index if not exists idx_fuvar_dokumentumok_tartalom_hash
  on fuvar_dokumentumok (tartalom_hash) where tartalom_hash is not null;
alter table fuvar_dokumentumok add column if not exists tarolas text not null default 'drive'
  check (tarolas in ('drive', 'telegram', 'db'));
alter table fuvar_dokumentumok add column if not exists telegram_file_id text;
alter table fuvar_dokumentumok add column if not exists meret_byte integer;
alter table fuvar_dokumentumok add column if not exists feltoltotte text;
alter table fuvar_dokumentumok add column if not exists megallo_id bigint references fuvar_megallok(id) on delete set null;
-- tipus: 'megbizas' | 'rakomanylista' | 'fuvarlevel' | 'szamla' | 'egyeb'
alter table fuvar_dokumentumok drop constraint if exists fuvar_dokumentumok_tipus_check;
alter table fuvar_dokumentumok add constraint fuvar_dokumentumok_tipus_check
  check (tipus is null or tipus in ('megbizas', 'rakomanylista', 'fuvarlevel', 'szamla', 'egyeb')) not valid;
-- NOT VALID: a meglévő sorokat nem ellenőrzi (ha élesben van váratlan érték,
-- a migráció ne álljon meg rajta), az új sorokra érvényes.

-- ---------------------------------------------------------------------------
-- 8. Migrációs hibák (S12): amit a backfill nem tud leképezni. Kapu: 0 nyitott.
create table if not exists fuvar_migracio_hiba (
  id            bigserial primary key,
  megbizas_id   bigint references fuvar_megbizasok(id) on delete cascade,
  tipus         text not null,        -- 'partner_hianyzik', 'felrako_ures', 'orphan_megallo_index', ...
  leiras        text not null,
  reszletek     jsonb not null default '{}'::jsonb,
  letrehozva_at timestamptz not null default now(),
  rendezve_at   timestamptz,
  rendezte      text
);
create index if not exists idx_fuvar_migracio_hiba_nyitott on fuvar_migracio_hiba (rendezve_at) where rendezve_at is null;

-- ---------------------------------------------------------------------------
-- 9. Árfolyam és költség-tételek (S15).
create table if not exists arfolyam (
  nap       date not null,
  penznem   text not null,
  ft        numeric(10,4) not null,
  forras    text not null default 'mnb',
  primary key (nap, penznem)
);
create table if not exists fuvar_megbizas_koltseg (
  id            bigserial primary key,
  megbizas_id   bigint not null references fuvar_megbizasok(id) on delete cascade,
  esemeny_id    bigint references fuvar_megbizas_esemeny(id) on delete set null,
  tipus         text not null check (tipus in ('utdij', 'uzemanyag', 'sofor', 'napi_fix', 'varakozasi_potdij', 'kiallasi_dij', 'egyeb', 'bevetel_potdij')),
  osszeg        numeric(12,2) not null,
  penznem       text not null default 'Ft',
  arfolyam_nap  date,
  megjegyzes    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_fuvar_megbizas_koltseg_megbizas on fuvar_megbizas_koltseg (megbizas_id);

-- ---------------------------------------------------------------------------
-- 10. Kalkuláció (2.6) — a Kalkulátor csempéi DB-ben, több ajánlat + kör.
create table if not exists fuvar_kalkulaciok (
  id                  bigserial primary key,
  keszult_at          timestamptz not null default now(),
  keszitette          text,
  nev                 text,
  forras              text,                          -- 'timocom', 'telefon', 'email', 'kezi'
  kor_id              bigint,                        -- több ajánlat egy körben (self-ref lent)
  jarmu_id            bigint references fuvar_jarmuvek(id),
  megallok            jsonb not null default '[]'::jsonb,   -- [{cimke, lat, lon, szerep, rakott}]
  szakaszok           jsonb not null default '[]'::jsonb,   -- HU-GO szakasz-snapshotok
  tav_km              numeric(8,1),
  menetido_perc       integer,
  utdij_ft            integer,
  geometria           text,                          -- polyline
  gazolaj_ar_ft_l     numeric(8,2),
  fogyasztas_l_100km  numeric(5,2),
  uzemanyag_ft        integer,
  sofor_ft            integer,
  napi_fix_ft         integer,
  ures_km             numeric(8,1),
  onkoltseg_ft        integer,
  onkoltseg_ft_km     numeric(8,1),
  kinalt_dij_ft       integer,
  ajanlat_ft          integer,
  margin_pct          numeric(5,1),
  verdikt             text,                          -- 'jo' | 'elfogadhato' | 'nem'
  megbizas_id         bigint references fuvar_megbizasok(id) on delete set null,
  torolt_at           timestamptz
);
alter table fuvar_kalkulaciok add constraint fuvar_kalkulaciok_kor_fk
  foreign key (kor_id) references fuvar_kalkulaciok(id) on delete set null;
alter table fuvar_megbizasok add constraint fuvar_megbizasok_kalkulacio_fk
  foreign key (kalkulacio_id) references fuvar_kalkulaciok(id) on delete set null;

-- HU-GO útvonal-cache (T1, T16: a jármű-paraméterek a kulcsban).
create table if not exists fuvar_utvonal_cache (
  kulcs           text primary key,                  -- sha256(honnan|hova|params)
  honnan_lat      double precision not null,
  honnan_lon      double precision not null,
  hova_lat        double precision not null,
  hova_lon        double precision not null,
  parameterek     jsonb not null default '{}'::jsonb,
  tav_m           integer not null,
  ido_s           integer not null,
  utdij_ft        integer,
  geometria       text,
  valasz          jsonb,
  letrehozva_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. GPS-tanulás: tripek tartósan (7.3/1b, T2, T6).
create table if not exists fuvar_ut_minta (
  id              bigserial primary key,
  jarmu_id        bigint references fuvar_jarmuvek(id),
  indulas_at      timestamptz not null,
  erkezes_at      timestamptz not null,
  honnan_cella    text,                              -- ~10 km rács
  hova_cella      text,
  honnan_lat      double precision,
  honnan_lon      double precision,
  hova_lat        double precision,
  hova_lon        double precision,
  tav_km          numeric(8,1),
  hugo_perc       integer,
  ptv_perc        integer,
  tenyleges_perc  integer not null,
  napszak         text,
  hetvege         boolean,
  ecofleet_trip_id text unique,
  created_at      timestamptz not null default now()
);
create index if not exists idx_fuvar_ut_minta_jarmu_idopont on fuvar_ut_minta (jarmu_id, indulas_at desc);
create index if not exists idx_fuvar_ut_minta_cella on fuvar_ut_minta (honnan_cella, hova_cella, napszak);

-- ---------------------------------------------------------------------------
-- 12. Külső adatforrások a Kimutatáshoz (8.2, 8.3).
create table if not exists utdij_tranzakcio (
  id                bigserial primary key,
  jarmu_id          bigint references fuvar_jarmuvek(id),
  rendszam          text,
  idopont           timestamptz not null,
  szakasz           text,
  kategoria         text,
  brutto_ft         integer not null,
  kulso_azonosito   text not null unique,
  megbizas_id       bigint references fuvar_megbizasok(id) on delete set null,
  forras_fajl       text,
  importalva_at     timestamptz not null default now()
);
create index if not exists idx_utdij_tranzakcio_jarmu_idopont on utdij_tranzakcio (jarmu_id, idopont);
create table if not exists szallitolevel_import (
  id                bigserial primary key,
  bizonylatszam     text not null unique,
  kelt              date not null,
  vevo              text,
  szallitasi_cim    text,
  rendszam          text,
  sofor             text,
  tetelek           jsonb not null default '[]'::jsonb,
  raklap_db         integer,
  megbizas_id       bigint references fuvar_megbizasok(id) on delete set null,
  parositas_allapot text not null default 'nyitott' check (parositas_allapot in ('nyitott', 'javasolt', 'parositva', 'elvetve')),
  forras_fajl       text,
  importalva_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 13. Értesítés-infrastruktúra (T11, T19) és Telegram-kötés (S18).
create table if not exists push_elofizetes (
  id            bigserial primary key,
  user_id       uuid references users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  eszkoz        text,
  letrehozva_at timestamptz not null default now(),
  utolso_siker_at timestamptz,
  hiba_szam     integer not null default 0
);
create table if not exists telegram_kotes (
  user_id       uuid primary key references users(id) on delete cascade,
  chat_id       text not null unique,
  kotve_at      timestamptz not null default now(),
  kotes_kod     text,
  kotes_kod_ig  timestamptz
);
create table if not exists fuvar_riasztas (
  id            bigserial primary key,
  kulcs         text not null,                       -- szabály + tárgy, pl. 'gps_eltunt:NMZ-492'
  szabaly       text not null,
  sulyossag     text not null check (sulyossag in ('info', 'figyelmeztetes', 'sulyos')),
  megbizas_id   bigint references fuvar_megbizasok(id) on delete cascade,
  jarmu_id      bigint references fuvar_jarmuvek(id),
  cimzett_kor   text not null default 'vezeto',      -- 'vezeto' | 'szabina' | 'sofor' | 'mind'
  szoveg        text not null,
  reszletek     jsonb not null default '{}'::jsonb,
  eloszor_at    timestamptz not null default now(),
  utoljara_at   timestamptz not null default now(),
  ismetles      integer not null default 1,
  nyugtazva_at  timestamptz,
  nyugtazta     text,
  megoldva_at   timestamptz
);
create unique index if not exists idx_fuvar_riasztas_nyitott_kulcs on fuvar_riasztas (kulcs) where megoldva_at is null;

-- ---------------------------------------------------------------------------
-- 14. Radar (10.3).
create table if not exists radar_kiiras (
  id              bigserial primary key,
  forras          text not null,                     -- 'timocom_email', 'timocom_chat', 'telefon', 'email'
  kulso_azonosito text,
  megbizo_jelolt  text,
  partner_id      bigint references fuvar_partnerek(id),
  honnan          text,
  hova            text,
  honnan_lat      double precision,
  honnan_lon      double precision,
  hova_lat        double precision,
  hova_lon        double precision,
  felrakas_nap    date,
  lerakas_nap     date,
  suly_t          numeric(6,2),
  raklap_db       integer,
  ar_ft           integer,
  ar_penznem      text,
  tav_km          numeric(8,1),
  ft_km           numeric(8,1),
  pontszam        integer,
  indoklas        text,
  javasolt_jarmu_id bigint references fuvar_jarmuvek(id),
  allapot         text not null default 'nyitott' check (allapot in ('nyitott', 'ajanlva', 'hozzarendelve', 'elvetve', 'lejart')),
  gmail_message_id text,
  letrehozva_at   timestamptz not null default now(),
  frissitve_at    timestamptz not null default now()
);
create unique index if not exists idx_radar_kiiras_kulso on radar_kiiras (forras, kulso_azonosito) where kulso_azonosito is not null;
create table if not exists partner_pontszam (
  partner_id        bigint not null references fuvar_partnerek(id) on delete cascade,
  nap               date not null,
  ft_km             numeric(8,1),
  fizetesi_nap      integer,
  keses_nap         numeric(6,1),
  papir_nap         numeric(6,1),
  varakozas_perc    integer,
  fuvar_db          integer,
  pontszam          integer,
  primary key (partner_id, nap)
);
create table if not exists viszonylat_stat (
  nap               date not null,
  honnan_cella      text not null,
  hova_cella        text not null,
  fuvar_db          integer not null default 0,
  ft_km             numeric(8,1),
  ures_vissza_db    integer not null default 0,
  primary key (nap, honnan_cella, hova_cella)
);

-- ---------------------------------------------------------------------------
-- 15. Indexek a lekérdezésekhez (T7).
create index if not exists idx_fuvar_megbizasok_jelleg_allapot on fuvar_megbizasok (jelleg, allapot) where torolt_at is null;
create index if not exists idx_fuvar_megbizasok_partner on fuvar_megbizasok (partner_id);
create index if not exists idx_fuvar_megbizasok_jarmu_datum on fuvar_megbizasok (jarmu_id, datum desc);
create index if not exists idx_fuvar_elszamolas_szamla on fuvar_elszamolas (szamla_id);

-- ---------------------------------------------------------------------------
-- 16. Napi anyagosított összesítő a Kimutatáshoz (T7) — worker tölti.
create table if not exists fuvar_napi_osszesito (
  nap               date not null,
  jarmu_id          bigint not null references fuvar_jarmuvek(id),
  jelleg            text not null check (jelleg in ('ber', 'sajat', 'ures')),
  km                numeric(8,1) not null default 0,
  fuvar_db          integer not null default 0,
  bevetel_ft        integer not null default 0,
  megtakaritas_ft   integer not null default 0,
  utdij_ft          integer not null default 0,
  uzemanyag_ft      integer not null default 0,
  sofor_ft          integer not null default 0,
  napi_fix_ft       integer not null default 0,
  frissitve_at      timestamptz not null default now(),
  primary key (nap, jarmu_id, jelleg)
);

-- ---------------------------------------------------------------------------
-- 17. Kettős írás adatbázis-szinten: amíg a régi kód a `tipus`-t és a
--     `statusz`-t írja, a `jelleg` és a `torolt_at` ebből töltődik (a régi
--     kódhoz nem nyúlunk — CLAUDE.md). A cutover után az új kód közvetlenül
--     írja, a trigger a 7. körben megy a `tipus`/`statusz` oszloppal együtt.
create or replace function fuvar_megbizasok_kettos_iras() returns trigger language plpgsql as $$
begin
  if new.jelleg is null or (tg_op = 'UPDATE' and new.tipus is distinct from old.tipus) then
    new.jelleg := case new.tipus when 'sajat' then 'ber' else 'sajat' end;
  end if;
  if new.statusz = 'torolt' then
    if new.torolt_at is null then new.torolt_at := now(); end if;
  elsif tg_op = 'UPDATE' and old.statusz = 'torolt' and new.statusz <> 'torolt' then
    new.torolt_at := null;
    new.torolt_by := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_fuvar_megbizasok_kettos_iras on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_kettos_iras
  before insert or update of tipus, statusz, jelleg on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_kettos_iras();
