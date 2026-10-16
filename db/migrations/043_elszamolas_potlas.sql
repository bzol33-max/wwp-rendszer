-- Fuvarozás 2.0 — 1. hullám, A/1 + A/4 (docs/fuvarozas-1-hullam-terv.md, 2026-10-16).
--
-- 1. Elszámolás-sor pótlás. A Rendszer lap „Átállási kapuk” sora „elszámolás
--    nélkül N”-et mutatott: teljesített (vagy tovább lépett) bérfuvar, amihez
--    nincs fuvar_elszamolas sor. A sort eddig csak néhány app-út írta
--    (lib/megbizasok/akciok.ts, allapot-akcio.ts); a GPS-figyelő, a sofőr
--    „Indulok”-ja és a régi jelölők (teljesitve = true → BEFORE trigger
--    számolja az allapot-ot) nem. Innentől egy trigger biztosítja.
--
--    MIÉRT NEM `AFTER UPDATE OF allapot`: az app `teljesitve = true`-t ír, és
--    az allapot-ot a BEFORE trigger (fuvar_megbizasok_allapot_koveto) állítja
--    — a Postgres az `OF oszlop` szűrőt a SET-listából dönti el, így az ilyen
--    trigger épp a fő úton nem sülne el. Ezért AFTER INSERT OR UPDATE, és a
--    feltétel a függvényben van (olcsó mezővizsgálat, csak utána exists).
--
--    A mezőket a fuvarozas2-backfill mintájára a fuvar_megbizasok régi
--    oszlopaiból tölti (az olvasók úgyis coalesce(e.x, m.x)-et néznek), a
--    számlát a szamla táblából párosítja szám szerint. Meglévő sorhoz nem nyúl
--    (on conflict do nothing).
--
-- 2. rendszer_eletjel: a háttér-figyelők életjele (kulcs → utolsó kör + adat).
--    A teljesítés-figyelő minden 5 perces kör végén ide ír; a Rendszer lap
--    ebből dönti el, fut-e egyáltalán (nem a GPS-írások korából).
--
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.
-- Idempotens: create … if not exists, create or replace, drop trigger if exists.

create table if not exists rendszer_eletjel (
  kulcs text primary key,
  utolso_kor timestamptz not null,
  adat jsonb
);

create or replace function fuvar_megbizasok_elszamolas_potlas() returns trigger
language plpgsql as $$
begin
  if new.jelleg is distinct from 'ber'
     or new.torolt_at is not null
     or new.allapot is null
     or new.allapot not in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart') then
    return null;
  end if;
  if exists (select 1 from fuvar_elszamolas e where e.megbizas_id = new.id) then
    return null;
  end if;
  insert into fuvar_elszamolas (megbizas_id, papirok_beerkeztek_at, szamla_id, szamla_szam, szamla_kelte,
                                fizetesi_hatarido_nap, postazasi_cim, postazva_at)
  select new.id, new.papirok_beerkeztek_at, sz.id, nullif(new.szamla_szam, ''), sz.kiallitas_datum,
         new.fizetesi_hatarido_nap, new.postazasi_cim, case when new.postazva then new.postazva_at end
  from (select 1) x
  left join szamla sz on sz.szamlaszam = nullif(new.szamla_szam, '')
  on conflict (megbizas_id) do nothing;
  return null;
end;
$$;

drop trigger if exists trg_fuvar_megbizasok_elszamolas_potlas on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_elszamolas_potlas
  after insert or update on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_elszamolas_potlas();

-- Egyszeri pótlás a már meglévő sorokra (ugyanaz a feltétel és leképezés).
insert into fuvar_elszamolas (megbizas_id, papirok_beerkeztek_at, szamla_id, szamla_szam, szamla_kelte,
                              fizetesi_hatarido_nap, postazasi_cim, postazva_at)
select m.id, m.papirok_beerkeztek_at, sz.id, nullif(m.szamla_szam, ''), sz.kiallitas_datum,
       m.fizetesi_hatarido_nap, m.postazasi_cim, case when m.postazva then m.postazva_at end
from fuvar_megbizasok m
left join szamla sz on sz.szamlaszam = nullif(m.szamla_szam, '')
where m.jelleg = 'ber'
  and m.torolt_at is null
  and m.allapot in ('teljesitve','szamlazhato','szamlazva','email_elment','postazva','lezart')
  and not exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id)
on conflict (megbizas_id) do nothing;
