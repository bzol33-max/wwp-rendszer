-- A sofőr fuvarlevél-fotója az adatbázisba kerül, nem a Drive-ra (2026-09-28).
-- A Drive-feltöltés a service accounttal SOSEM működött: „Service Accounts do
-- not have storage quota” (403) — a service accountnak nincs saját tárhelye,
-- és megosztott meghajtó (Shared Drive) csak Google Workspace-szel van. A
-- fuvar_dokumentumok.tarolas már ismeri a 'db' értéket (001-es migráció);
-- itt a tartalom és a típusa kerül mellé. Egy kicsinyített fotó ~300-600 KB.
alter table fuvar_dokumentumok add column if not exists tartalom bytea;
alter table fuvar_dokumentumok add column if not exists mime_type text;
