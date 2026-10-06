-- Az eredeti sofőrfotó és a megjelenítési forgatás megőrzése.
-- (2026-10-06, Budaházi Zoltán: „jobb minőségben kellenek a papírok”)
alter table fuvar_dokumentumok
  add column if not exists eredeti bytea,
  add column if not exists eredeti_mime_type text,
  add column if not exists forgatas smallint not null default 0
    check (forgatas in (0, 90, 180, 270));
