-- Szakoly és Balkány: szétválogatáshoz szükséges típusok aktiválása
-- (2026-09-21). A "Vegyes" a mindenes halom — olyan szállítmány, amiben
-- EUR-on kívül színes és egyutas is van; a szétválogatáskor ezekre bomlik.
-- Az "EUR törött" azért kell, hogy a Vegyes EUR-ból kiválogatott törött
-- raklap is készletként látsszon, ne tűnjön el.
--
-- Egyszer futó lépés, nem a schema.sql-ben: ha valaki később a
-- Beállításokban kikapcsol egy típust, azt az induló migráció ne kapcsolja
-- vissza.
insert into site_active_types (site_id, type_id)
select s.id, t.id
from sites s, pallet_types t
where s.name in ('Szakoly', 'Balkány')
  and t.name in (
    'Vegyes',
    'EUR törött',
    'Színes',
    'Egyutas 80-as',
    'Egyutas 100-as',
    'Egyutas gyenge',
    'Gitterbox'
  )
on conflict do nothing;
