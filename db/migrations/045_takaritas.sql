-- Takarítás: használatlan táblák félretétele (2026-10-16,
-- docs/fuvarozas-1-hullam-terv.md D7).
--
-- Drop helyett átnevezés `regi_` előtaggal (db/migrations/README.md): ha
-- mégis kellene valami, egy `alter table regi_X rename to X` visszahozza.
--
-- Kód-audit (2026-10-16): az alábbi 11 táblára a lib/, app/, components/,
-- scripts/ (migrate.mjs is) és a db/schema.sql alatt nincs hivatkozás — csak a
-- létrehozó migráció (001, 011, 013) említi őket, és azok már nem futnak újra.
-- A fuvar_megbizasok.kalkulacio_id FK-ja az átnevezett táblára mutat tovább
-- (az oszlopot semmi nem írja).
--
-- KIMARADT: sofor_munkanap — a db/schema.sql minden indításkor
-- `create table if not exists`-szel létrehozná újra (üresen); előbb onnan
-- kell kivenni.
--
-- Idempotens: csak akkor nevez át, ha az eredeti megvan és a regi_ még nincs —
-- másodszori futásra semmit nem tesz.
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

do $$
declare
  t text;
begin
  foreach t in array array[
    'fuvar_kalkulaciok',
    'fuvar_napi_osszesito',
    'fuvar_riasztas',
    'fuvar_ut_minta',
    'fuvar_utvonal_cache',
    'viszonylat_stat',
    'push_elofizetes',
    'telegram_kotes',
    'seged_muvelet',
    'seged_tudas',
    'seged_uzenet'
  ] loop
    if to_regclass('public.' || t) is not null and to_regclass('public.regi_' || t) is null then
      execute format('alter table public.%I rename to %I', t, 'regi_' || t);
    end if;
  end loop;
end $$;
