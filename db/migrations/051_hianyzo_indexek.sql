-- Hiányzó indexek (audit P5, 2026-10-25). Ma (néhány száz megbízás) mindegyik
-- érintett lekérdezés ezredmásodperces, de soronként seq scant végeznek
-- (EXPLAIN a teszt-másolaton), ami a megbízások számával négyzetesen nő.
-- A táblák kicsik: a sima (nem concurrently) create index itt pillanatnyi.

-- Megbízások lista (lib/megbizasok/repo.ts SOR_SQL): a szállítólevél-
-- al-lekérdezés soronként végigolvasta a szallitolevel_import-ot.
create index if not exists idx_szallitolevel_import_megbizas
  on szallitolevel_import (megbizas_id, kelt desc) where parositas_allapot = 'parositva';

-- Párosítatlan számlák és a 15 perces számla-szinkron
-- (lib/fuvarozas/megbizasok.ts getParositatlanFuvarszamlak, szinkronizalSzamlaSzamokat).
create index if not exists idx_fuvar_megbizasok_szamla_szam
  on fuvar_megbizasok (szamla_szam) where szamla_szam is not null and szamla_szam <> '';
create index if not exists idx_fuvar_megbizasok_kieg_szamla_szamok
  on fuvar_megbizasok using gin (kieg_szamla_szamok);
create index if not exists idx_fuvar_elszamolas_szamla_szam
  on fuvar_elszamolas (szamla_szam) where szamla_szam is not null;
create index if not exists idx_fuvar_import_naplo_fuvar
  on fuvar_import_naplo (fuvar_id) where fuvar_id is not null;

-- Drive-szinkron: a levelek a drive_file_id-n kapcsolódnak (drive-sync-core.ts).
create index if not exists idx_fuvar_level_drive_file
  on fuvar_level (drive_file_id) where drive_file_id is not null;

-- Készlet: telephely utolsó mozgásai (lib/keszlet/actions.ts getMovements).
create index if not exists idx_keszlet_movements_site_ido
  on keszlet_movements (site_id, created_at desc);
