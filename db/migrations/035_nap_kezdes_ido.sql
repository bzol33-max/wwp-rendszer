-- Menetterv: a nap kezdete (2026-10-10). Ha egy menet egyik megállójának
-- sincs időablaka (pl. JANI saját fuvarjai), az idő-lánc innen indul; és ha
-- az első időzített megálló elé más feladat kerül (átrendezés), a kocsi
-- ennél korábban nem indul — így a lekésett ablak figyelmeztetést ad.
-- Szöveges érték ("HH:MM"), ezért nem a számos fuvar_beallitas-kulcsok
-- közt van (lib/beallitasok/fuvar-alap.ts); a kód (lib/menet/generalas.ts)
-- hiányzó sornál / táblánál is 06:00-val számol. Csak additív.

insert into fuvar_beallitas (kulcs, ertek, ervenyes_tol, modositotta)
select 'nap_kezdes_ido', '"06:00"'::jsonb, '2026-01-01 00:00:00+01'::timestamptz, 'migracio:035'
where not exists (select 1 from fuvar_beallitas where kulcs = 'nap_kezdes_ido');
