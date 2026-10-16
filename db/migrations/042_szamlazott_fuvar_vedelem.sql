-- Számlázott fuvar fizikai törlésének tiltása (2026-10-16,
-- docs/ecofleet-telemetria-terv.md 4. pont).
--
-- MIÉRT: a fuvart a kód csak soft-delete-tel törli (statusz = 'torolt',
-- torolt_at — lib/megbizasok/torles.ts). Egy fizikai DELETE (kézi SQL-konzol,
-- jövőbeli takarító szkript) a fuvar_elszamolas-t is vinné (on delete
-- cascade), és a kiállított számla elveszítené a fuvarját. Ezt az adatbázis
-- szintjén zárjuk ki. A soft-delete (UPDATE) továbbra is engedélyezett.
--
-- „Számla tartozik hozzá” — ugyanaz a feltétel, mint a torolMegbizast
-- szamlas-ellenőrzése (lib/megbizasok/akciok.ts), kiegészítve a szamla_id-vel.
-- BEFORE trigger: az elszámolás-sor ekkor még létezik (a cascade utána jön).
--
-- Kód-audit (2026-10-16): a lib/, app/, scripts/ alatt nincs fizikai
-- `delete from fuvar_megbizasok` (csak a teszt); más tábla törlése nem
-- cascade-el ide (a fuvar_megbizasok FK-i no action / set null).
--
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

create or replace function fuvar_megbizasok_szamlazott_torles_tilt() returns trigger language plpgsql as $$
begin
  if coalesce(OLD.szamla_szam, '') <> ''
     or cardinality(OLD.kieg_szamla_szamok) > 0
     or exists (
       select 1 from fuvar_elszamolas e
        where e.megbizas_id = OLD.id
          and (coalesce(e.szamla_szam, '') <> '' or e.szamla_id is not null)
     )
  then
    raise exception 'Számlázott fuvar (id %) fizikailag nem törölhető — használj soft-delete-et (statusz = ''torolt'').', OLD.id
      using errcode = 'restrict_violation';
  end if;
  return OLD;
end $$;

drop trigger if exists trg_fuvar_megbizasok_szamlazott_torles_tilt on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_szamlazott_torles_tilt
  before delete on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_szamlazott_torles_tilt();
