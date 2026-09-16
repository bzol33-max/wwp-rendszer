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
