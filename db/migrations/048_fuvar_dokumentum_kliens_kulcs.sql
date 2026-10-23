-- A sofőr telefonos feltöltési sorának idempotencia-kulcsa (2026-10-23).
-- A telefon egy oldalt addig próbál újra feltölteni, amíg a szerver vissza
-- nem igazolja — ha a válasz útközben elveszett (gyenge térerő), a második
-- próba ugyanazzal a kulccsal jön, és nem lesz belőle dupla oldal
-- (lib/fuvarozas/sofor.ts feltoltFuvarlevelFoto, app/api/fuvarozas/fuvarlevel-feltoltes).
alter table fuvar_dokumentumok add column if not exists kliens_kulcs text;
create unique index if not exists idx_fuvar_dokumentumok_kliens_kulcs on fuvar_dokumentumok (kliens_kulcs) where kliens_kulcs is not null;
