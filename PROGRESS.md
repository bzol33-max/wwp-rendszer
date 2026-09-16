# PROGRESS

## 2026-09-16 — Fuvarozás: minden megbízás a helyén (besorolás egy helyen + adatjavítás)

- `lib/fuvarozas/fuvar-hely.ts`: a Megbízások fülei közti besorolás EGY helyen
  (`FUVAR_HELY_SQL` + TS-tükör `getFuvarHelye`). A "munka kész" feltétel a
  számlaszámot is nézi: számlás sor sosem marad a "folyamatban" listán.
- `lib/fuvarozas/megbizasok.ts`: a Bér/Saját folyamatban, Számla/Posta,
  Papírra vár, Archív és GPS-teljesítés-jelölt lekérdezések mind a közös
  szabállyal szűrnek. Új: `visszaallitFuvarArchivbol` — típustól függetlenül
  azt nullázza, ami a sort az Archívban tartja, és visszaadja az új helyet.
- `components/fuvarozas/megbizasok.tsx`: az Archív "Visszaállítás" gombja az
  új action-t hívja; ha a sor mégis archív marad (elmúlt dátum/számlaszám),
  hibaüzenettel mondja meg, miért.
- `scripts/fuvar-hely-ujrasorolas.mts`: egyszeri újrafeldolgozó (száraz
  futás alapból, `--apply` ír, `--check` csak ellenőriz; cél: 0 eltérés).
  Az élesítést a `scripts/migrate.mjs` `rendezFuvarHelyeketOnce` lépése
  végzi a deploy indulásakor (kód: `fuvar-hely-ujrasorolas-2026-09-16`), a
  deploy-naplóban sorolva az érintett sorokat. Élesben (2026-09-16 09:37
  UTC) A=0, B=0 sort érintett. Az ellenőrző számokat a `migrate.mjs`
  `naplozFuvarHelyEllenorzest` lépése MINDEN indulásnál a deploy-naplóba
  írja (cél: A=0, B=0) — redeploy-jal bármikor újra lekérhető.

## 2026-09-16 (2. kör) — bér fuvar csak számlaszámmal archív; adatminőség-napló

- Budaházi Zoltán döntése: postázottnak jelölt, de számlázatlan bér fuvar
  NEM archív, hanem Számla/Posta (számlázandó). `fuvar-hely.ts`: az
  "effektíve archivált" feltétel a számlaszámot is megköveteli.
- `migrate.mjs` egyszeri lépés: a `db/archiv-backlog-cleanup.sql` által
  mesterségesen postázottnak jelölt, számlázatlan sorok jelölője visszavonva
  (a script saját visszavonási feltételével; kézi pipához nem nyúl).
- `migrate.mjs` napló minden indulásnál: A/B/C/D számlálók, saját cég
  megrendelőként (bér fuvar, azonosítókkal — NEM javítja, ember pótolja a
  dokumentumból), megrendelő nélküli aktív sorok, az aktív fülek
  megrendelő-nevei előfordulással (adatminőség átnézéséhez).
- Éles (09:59 UTC): 2 számlázatlan sor vissza a Számla/Postára (#100, #102);
  12 bér fuvaron a saját cég a megrendelő (#98, #101, #102, #103, #105,
  #106, #107, #108, #109, #112, #120, #125). Következő lépés: a számlázott
  soroknál a számla vevője (`szamla.vevo_nev`) automatikusan javítja a
  megrendelőt (`javitsaSajatCegMegrendelotSzamlabol`, minden indulásnál,
  idempotens); a többinél a napló írja ki a dokumentum/postázási cím
  adatait a kézi pótláshoz (`db/fuvar-corrections.json`).

## 2026-09-16 (3. kör) — Duvenbeck párban érkező iratok, duplikált feltöltés

- Átvilágítás (deploy-napló + Drive): a 4 friss Duvenbeck-pár (TA+FRALI)
  egy sorba olvadt az Út ID alapján (#126, #128, #129, #130); a kétszer
  feltöltött FRALI1994504 ugyanahhoz a sorhoz kötődött. Két megbízásnál
  (TA1966667, TA1978819) nincs rakománylista a mappában.
- `drive-sync-core.ts`: a kör végén jelzi (napló + figyelmeztetés), ha egy
  Duvenbeck-sorhoz csak az egyik irat van meg. Új: a kétszer feltöltött,
  azonos szövegű NEM-Duvenbeck iratot a meglévő fuvarhoz csatolja
  (`azonosSzoveguIsmertIrat` + `csatolIratotFuvarhoz`, verdikt
  `duplikatum`), új sor helyett — élesben ebből lettek a #22/#77-féle párok.
- `migrate.mjs` duplikátum-kereső: két külön Út ID-jű sor nem duplikátum
  (#126/#130 tévesen volt jelölve); a sorok állapota (számla, postázva,
  ellenőrzött) is látszik a naplóban.
- Duplikátumok (Budaházi Zoltán jóváhagyásával, 2026-09-16): a 11 archív
  pár újabb példánya (#77, #98, #99, #101, #103, #105–#110) és a #125
  töröltnek jelölve a `migrate.mjs` egyszeri lépésében, biztonsági
  feltétellel (azonos pozíciószám + számlaszám a megmaradó párral).
  #26/#27 két valódi fuvar (külön számlák), nem duplikátum.
