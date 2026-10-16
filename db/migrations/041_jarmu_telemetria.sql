-- Ecofleet telemetria tény-réteg (2026-10-16, docs/ecofleet-telemetria-terv.md 3. pont).
-- CSAK ADDITÍV, idempotens. A tranzakciót a scripts/migrate.mjs nyitja.
-- Jármű-azonosítás kizárólag fuvar_jarmuvek.ecofleet_object_id alapján
-- (lib/jarmu-telemetria/gyujto.ts) — rendszám-szöveg alapján soha.

-- Tachó-pillanatok (2 percenként a getLastData tcoData-jából). 30 napnál
-- régebbi sorokat a gyűjtő naponta törli.
create table if not exists jarmu_tacho_pillanat (
  id                       bigserial primary key,
  jarmu_id                 bigint references fuvar_jarmuvek(id) on delete cascade,
  ecofleet_object_id       text not null,
  adat_idopont             timestamptz,
  rogzitve                 timestamptz not null default now(),
  allapot                  text,
  napi_hatra_perc          int,
  heti_hatra_perc          int,
  heti_vezetes_perc        int,
  muszak_hatra_perc        int,
  munkaido_hatra_perc      int,
  csokkentett_pihenok      int,
  hosszabbitott_vezetesek  int,
  nyers                    jsonb not null
);
create index if not exists idx_jarmu_tacho_pillanat_jarmu_rogzitve
  on jarmu_tacho_pillanat (jarmu_id, rogzitve desc);
create unique index if not exists uq_jarmu_tacho_pillanat_minta
  on jarmu_tacho_pillanat (ecofleet_object_id, adat_idopont);
create index if not exists idx_jarmu_tacho_pillanat_rogzitve
  on jarmu_tacho_pillanat (rogzitve);

-- CAN napi összesítés (óránként a tegnapi és a mai napra újraszámolva, upsert).
create table if not exists jarmu_can_nap (
  jarmu_id            bigint references fuvar_jarmuvek(id) on delete cascade,
  nap                 date,
  liter_can           numeric,
  km_can              numeric,
  l100                numeric,
  tankolasok          jsonb not null default '[]',
  szerviz_hatra_km    int,
  szerviz_megbizhato  boolean not null default false,
  tengely_terheles    jsonb,
  minta_db            int not null,
  frissitve           timestamptz not null default now(),
  primary key (jarmu_id, nap)
);

-- Beérkezett Ecofleet webhook-események (egyelőre csak tárolás, feldolgozás később).
create table if not exists ecofleet_webhook_esemeny (
  id          bigserial primary key,
  kulcs       text not null unique,
  beerkezett  timestamptz not null default now(),
  payload     jsonb not null
);
