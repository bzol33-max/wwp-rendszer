-- Papír-jelzés (2026-10-11, Budaházi Zoltán: a rendszer ne tiltson, csak
-- figyelmeztessen): az eredeti papírt ezentúl Szabina külön nyugtázza
-- („Papír megjött ✓” / visszavonás), ami a fuvar_elszamolas ÉS a régi
-- fuvar_megbizasok.papirok_beerkeztek_at oszlopot írja (kettős írás a
-- cutoverig). A postázás többé nem állítja a papírt.
--
-- MIÉRT: a követő trigger (002) a papirok_beerkeztek_at írására is lefutott,
-- és a régi jelölőkből újraszámolta az állapotot — pedig a papír az
-- állapotot nem befolyásolja (a fuvar_megbizasok_allapot_regi_jelolokbol
-- nem olvassa). Így egy papír-nyugtázás pl. egy kézzel számlázhatóvá tett,
-- fotó nélküli fuvart visszaléptetett volna teljesítettre. A trigger
-- ugyanaz, csak a papír-oszlop kikerül a kiváltó oszlopok közül; a függvény
-- változatlan (029). Meglévő adathoz nem nyúl.
-- A tranzakciót a scripts/migrate.mjs nyitja (README) — itt nincs begin/commit.

drop trigger if exists trg_fuvar_megbizasok_allapot_koveto on fuvar_megbizasok;
create trigger trg_fuvar_megbizasok_allapot_koveto
  before insert or update of teljesitve, postazva, postazva_at, szamla_szam, ellenorzott, datum, lerakas_datum, tipus
  on fuvar_megbizasok
  for each row execute function fuvar_megbizasok_allapot_koveto();
