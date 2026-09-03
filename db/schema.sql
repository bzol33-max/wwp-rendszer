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
  default_price integer -- Ft/db, "Irányár" (lehet null, ha nincs egységesen árazva)
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
