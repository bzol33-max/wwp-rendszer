-- Telephelyenként aktív típusok (kipipálva) — a rendszertervben leírt kezdő beállítás.
insert into site_active_types (site_id, type_id)
select s.id, t.id from sites s, pallet_types t
where s.name = 'Szakoly' and t.name in
  ('EUR világos','EUR szürke','Vegyes EUR','H1 raklap','800x1200 használt','IBC','Gitterbox')
on conflict do nothing;

insert into site_active_types (site_id, type_id)
select s.id, t.id from sites s, pallet_types t
where s.name = 'Balkány' and t.name in
  ('EUR világos','EUR szürke','Vegyes EUR','H1 raklap')
on conflict do nothing;

insert into site_active_types (site_id, type_id)
select s.id, t.id from sites s, pallet_types t
where s.name = 'Nyíregyháza' and t.name in
  ('EUR világos','EUR szürke','Vegyes EUR','Csere')
on conflict do nothing;

-- Nyitókészlet + néhány demó mozgás, hogy ne 0-ról induljon minden.
insert into keszlet_movements (site_id, type_id, direction, qty, partner, created_at)
select s.id, t.id, 'be', v.qty, v.partner, now() - (v.days || ' days')::interval
from (values
  ('Szakoly', 'EUR világos', 722, 'Nyitókészlet', 13),
  ('Szakoly', 'EUR szürke', 363, 'Nyitókészlet', 13),
  ('Szakoly', 'H1 raklap', 200, 'Nyitókészlet', 13),
  ('Szakoly', 'EUR világos', 120, 'Keter Kft.', 0),
  ('Balkány', 'EUR szürke', 140, 'Nyitókészlet', 13),
  ('Balkány', 'H1 raklap', 90, 'Nyitókészlet', 13),
  ('Balkány', 'EUR világos', 200, 'HAPP Kft.', 4),
  ('Nyíregyháza', 'EUR világos', 1328, 'Nyitókészlet', 13),
  ('Nyíregyháza', 'EUR szürke', 600, 'Nyitókészlet', 13),
  ('Nyíregyháza', 'Vegyes EUR', 224, 'Nyitókészlet', 13)
) as v(site, type, qty, partner, days)
join sites s on s.name = v.site
join pallet_types t on t.name = v.type;

insert into keszlet_movements (site_id, type_id, direction, qty, partner, created_at)
select s.id, t.id, 'ki', 48, 'Fabrika Zrt.', now()
from sites s, pallet_types t
where s.name = 'Szakoly' and t.name = 'EUR szürke';

insert into keszlet_movements (site_id, type_id, direction, qty, target_site_id, created_at)
select s.id, t.id, 'mozgatas', 60, s2.id, now() - interval '1 day'
from sites s, sites s2, pallet_types t
where s.name = 'Szakoly' and s2.name = 'Balkány' and t.name = 'H1 raklap';
