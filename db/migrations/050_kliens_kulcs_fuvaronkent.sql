-- A fotó-feltöltés idempotencia-kulcsa fuvaronként egyedi (audit A6, 2026-10-25).
-- A 048-as index csak a kulcsra volt egyedi, a beszúrás pedig erre ütközött:
-- ha ugyanaz a kulcs egy MÁSIK fuvarnál már szerepelt, a beszúrás annak a
-- dokumentumnak az azonosítóját adta vissza, és a fotó csendben elveszett.
-- A meglévő sorok a régi index miatt a (fuvar_id, kulcs) párra is egyediek.
drop index if exists idx_fuvar_dokumentumok_kliens_kulcs;
create unique index if not exists idx_fuvar_dokumentumok_fuvar_kliens_kulcs
  on fuvar_dokumentumok (fuvar_id, kliens_kulcs) where kliens_kulcs is not null;
