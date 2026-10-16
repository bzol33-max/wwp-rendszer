-- Fuvarozás 2.0 — 1. hullám, C: „Megnyertük → megbízás” (2026-10-16,
-- docs/fuvarozas-1-hullam-terv.md). Additív és idempotens (kétszer futtatva
-- is ugyanaz), begin/commit nélkül — a migrate.mjs egy tranzakcióban futtatja.
--
-- 1. A Timocom-ajánlat (radar_kiiras) állapota bővül: 'nyert', 'vesztett'.
-- 2. Az eredmény adatai: amit ajánlottunk / amennyiért elvittük (ajanlott_ar
--    + ajanlott_penznem), mikor dőlt el (eredmeny_at), és a megnyert
--    ajánlatból létrehozott megbízás (megbizas_id; a megbízás törlése nem
--    viszi magával az ajánlatot, csak a kapcsolatot üríti).
-- 3. A megbízás forrása lehet 'timocom'.

alter table radar_kiiras drop constraint if exists radar_kiiras_allapot_check;
alter table radar_kiiras add constraint radar_kiiras_allapot_check
  check (allapot in ('nyitott', 'ajanlva', 'hozzarendelve', 'elvetve', 'lejart', 'nyert', 'vesztett'));

alter table radar_kiiras add column if not exists ajanlott_ar numeric(12,2);
alter table radar_kiiras add column if not exists ajanlott_penznem text;
alter table radar_kiiras add column if not exists eredmeny_at timestamptz;
alter table radar_kiiras add column if not exists megbizas_id bigint;

alter table radar_kiiras drop constraint if exists radar_kiiras_ajanlott_penznem_check;
alter table radar_kiiras add constraint radar_kiiras_ajanlott_penznem_check
  check (ajanlott_penznem is null or ajanlott_penznem in ('HUF', 'EUR'));

alter table radar_kiiras drop constraint if exists radar_kiiras_megbizas_id_fkey;
alter table radar_kiiras add constraint radar_kiiras_megbizas_id_fkey
  foreign key (megbizas_id) references fuvar_megbizasok(id) on delete set null;

create index if not exists idx_radar_kiiras_megbizas on radar_kiiras (megbizas_id) where megbizas_id is not null;

alter table fuvar_megbizasok drop constraint if exists fuvar_megbizasok_forras_check;
alter table fuvar_megbizasok add constraint fuvar_megbizasok_forras_check
  check (forras in ('kezi', 'pdf_import', 'drive_import', 'gmail_import', 'szallitolevel', 'kalkulacio', 'timocom'));
