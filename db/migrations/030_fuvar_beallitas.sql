-- Fuvarozás — beállítások táblája (2. fázis, törzsadat, 2026-10-10).
--
-- A kódban szétszórt konstansok (napi költség, km-díj, fogyasztás, gázolaj-
-- tartalék, rakodási ráhagyás, GPS-késés, vezetési keret) egy helyre kerülnek.
-- ELŐZMÉNY MEGŐRZÉSE: egy érték módosítása ÚJ SORT szúr be (nem update) —
-- a kulcs aktuális értéke a legkésőbbi, már érvényes (ervenyes_tol <= now())
-- sor. Így visszakereshető, mikor mennyivel számolt a rendszer, és egy
-- jövőbeli dátummal előre is rögzíthető egy változás.
--
-- A kód (lib/beallitasok/fuvar.ts) a tábla hiányát is túléli: akkor a
-- kódbeli alapértékekkel számol — ugyanazokkal, amiket ez a fájl beír.
--
-- Tulajdonosi döntések (2026-10-10): alap fogyasztás 28 l/100 km, a mért
-- Ecofleet-érték csak 300 mért km fölött írja felül.

create table if not exists fuvar_beallitas (
  id             bigserial primary key,
  kulcs          text not null,
  ertek          jsonb not null,
  ervenyes_tol   timestamptz not null default now(),
  modositotta    text,
  modositva_at   timestamptz not null default now()
);

create index if not exists idx_fuvar_beallitas_kulcs_ervenyes
  on fuvar_beallitas (kulcs, ervenyes_tol desc, id desc);

insert into fuvar_beallitas (kulcs, ertek, ervenyes_tol, modositotta)
select v.kulcs, v.ertek, '2026-01-01 00:00:00+01'::timestamptz, 'migracio:030'
from (values
  ('fogyasztas_alap_l_100km',          '28'::jsonb),
  ('meres_min_km',                     '300'::jsonb),
  ('napi_koltseg_ft',                  '50000'::jsonb),
  ('sajat_fuvar_km_dij_ft',            '550'::jsonb),
  ('tankolasi_kedvezmeny_ft_l',        '50'::jsonb),
  ('gazolaj_ar_tartalek_ft',           '667'::jsonb),
  ('ures_indulas_figyelmeztetes_km',   '30'::jsonb),
  ('felrakas_rahagyas_perc',           '30'::jsonb),
  ('lerakas_rahagyas_perc',            '45'::jsonb),
  ('gps_kesei_perc',                   '10'::jsonb),
  ('gps_elavult_perc',                 '30'::jsonb),
  ('prioritas_sajat_vs_ber',           '1.0'::jsonb),
  ('sofor_napi_vezetes_max_perc',      '540'::jsonb),
  ('szunet_utan_perc',                 '270'::jsonb)
) as v(kulcs, ertek)
where not exists (select 1 from fuvar_beallitas b where b.kulcs = v.kulcs);
