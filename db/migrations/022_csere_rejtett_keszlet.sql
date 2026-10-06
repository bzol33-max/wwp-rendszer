-- Készlet, 2026-10-06: a 2026-09-18 előtti rejtett "Csere" készlet átírása.
--
-- A Csere elve: behoznak X db EUR világosat (fehér), kiadunk X db EUR
-- szürkét, a kassza −X × egységár. Készletben: világos +X, szürke −X — a
-- "Csere" maga nem készlettétel, a felület (getStock) ki is szűri.
--
-- Két régi kódváltozat ehelyett "Csere" típusú beérkezést írt:
--   * 2026-09-02/03: a Havi fülön rögzített Csere-vétel (b10419e előtt);
--   * 2026-09-03 – 09-18: a kifizetésre váró Csere-tétel MÓDOSÍTÁSA
--     (c9eec66 előtt) — ez a jó világos+/szürke− párt ráadásul törölte is.
-- Ezek a sorok azóta láthatatlanul ott ülnek: az appban ennyivel kevesebb a
-- fehér és több a szürke, mint a telepen (2026-10-06-i bejelentés).
--
-- A javítás minden vételből származó rejtett "Csere" beérkezést világos +db /
-- szürke −db párra ír át, az eredeti időponttal, felvásárlás-azonosítóval és
-- rögzítővel (a felvásárlás törlése így továbbra is az egész hatást vonja
-- vissza). Ha a rejtett tétel UTÁN volt az adott telepen leltár az adott
-- típusra (elfogadott korrekció, vagy egyező számolás), az a különbséget már
-- kiegyenlítette — ott az adott oldalt NEM írjuk be újra, különben duplán
-- javítanánk. A leltári korrekció / szétválogatás címkéjű "Csere" sorok nem
-- vételek, azok átírás nélkül kerülnek ki.
--
-- Visszavonhatóság: a kivett eredeti sorok a regi_csere_rejtett_mozgasok
-- táblába kerülnek (ld. db/migrations/README.md: drop helyett mentés).

create table if not exists regi_csere_rejtett_mozgasok as
  select * from keszlet_movements where false;

create temp table _rejtett_csere on commit drop as
select m.id, m.site_id, m.direction, m.qty, m.purchase_id, m.created_at, m.created_by, m.movement_group,
  (m.direction = 'be' and coalesce(m.partner, '') not in ('Leltári korrekció', 'Szétválogatás')) as vetel,
  m.created_at > coalesce((
    select max(ic.created_at) from inventory_counts ic
    where ic.site_id = m.site_id
      and ic.type_id = (select id from pallet_types where name = 'EUR világos')
      and (ic.accepted or ic.counted_qty = ic.expected_qty)
  ), '-infinity') as feher_kell,
  m.created_at > coalesce((
    select max(ic.created_at) from inventory_counts ic
    where ic.site_id = m.site_id
      and ic.type_id = (select id from pallet_types where name = 'EUR szürke')
      and (ic.accepted or ic.counted_qty = ic.expected_qty)
  ), '-infinity') as szurke_kell
from keszlet_movements m
join pallet_types t on t.id = m.type_id
where t.name = 'Csere';

insert into keszlet_movements (site_id, type_id, direction, qty, partner, purchase_id, created_at, created_by, movement_group)
select site_id, (select id from pallet_types where name = 'EUR világos'), 'be', qty, 'Csere',
  purchase_id, created_at, created_by, movement_group
from _rejtett_csere where vetel and feher_kell;

insert into keszlet_movements (site_id, type_id, direction, qty, partner, purchase_id, created_at, created_by, movement_group)
select site_id, (select id from pallet_types where name = 'EUR szürke'), 'ki', qty, 'Csere',
  purchase_id, created_at, created_by, movement_group
from _rejtett_csere where vetel and szurke_kell;

-- Nyom a "Legutóbbi mozgások" listában, hogy látszódjon, mi változott.
insert into keszlet_events (site_id, kind, details, effect, created_by)
select site_id, 'mozgas',
  format('Csere-javítás: %s db régi (2026-09-18 előtti) csere átírva fehér+/szürke− párra', sum(qty) filter (where vetel)),
  format('EUR világos +%s · EUR szürke −%s',
    coalesce(sum(qty) filter (where vetel and feher_kell), 0),
    coalesce(sum(qty) filter (where vetel and szurke_kell), 0)),
  'Rendszer'
from _rejtett_csere
group by site_id
having coalesce(sum(qty) filter (where vetel), 0) > 0;

insert into regi_csere_rejtett_mozgasok
select * from keszlet_movements where id in (select id from _rejtett_csere);

delete from keszlet_movements where id in (select id from _rejtett_csere);
