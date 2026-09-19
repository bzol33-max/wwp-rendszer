# PROGRESS

## 2026-09-19 — Fuvarozás 2 átállás, E4: séma a régiek mellé (`db/migrations/001`), E4b visszaállítás-próba

- **Probléma:** az új modell (partner, megálló, elszámolás, esemény-napló,
  állapot, kalkuláció, külső adatforrások, riasztás, Radar) táblái nem
  léteztek; a `tipus` fordított elnevezése és a `statusz='torolt'` soft
  delete a régi jelölőkön élt.
- **Ok:** a modul egy táblán, jelölő-mezőkkel nőtt (logikai újratervezés 1.).
- **Módosítás:** `db/migrations/001_fuvarozas2_sema.sql` — egyszer fut, egy
  tranzakcióban, **csak hozzáad**: `fuvar_jarmuvek` (a 3 kocsi beszúrva),
  `fuvar_partnerek`, `fuvar_megbizasok` új oszlopai (`partner_id`, `jelleg`
  helyes irányban + backfill, `hivatkozas_*`, `jarmu_id`, `sofor_id`,
  `allapot` (NULL az E6-ig), `hianylista`, `torolt_at/by`, bővített `forras`
  check, `kulso_azonosito`, `kalkulacio_id`), `fuvar_megallok`,
  `fuvar_megallo_allapot.megallo_id`, `fuvar_elszamolas`,
  `fuvar_megbizas_esemeny` (zárt esemény-lista, `kliens_uuid` unique),
  `fuvar_dokumentumok` (`drive_file_id` nullable, `tartalom_hash` unique,
  `tarolas`, `tipus` check NOT VALID), `fuvar_migracio_hiba`, `arfolyam`,
  `fuvar_megbizas_koltseg`, `fuvar_kalkulaciok`, `fuvar_utvonal_cache`,
  `fuvar_ut_minta`, `utdij_tranzakcio`, `szallitolevel_import`,
  `push_elofizetes`, `telegram_kotes`, `fuvar_riasztas`, `radar_kiiras`,
  `partner_pontszam`, `viszonylat_stat`, `fuvar_napi_osszesito`, T7 indexek.
  **Kettős írás triggerrel** (`trg_fuvar_megbizasok_kettos_iras`): amíg a
  régi kód `tipus`/`statusz`-t ír, a `jelleg`/`torolt_at` ebből töltődik —
  a régi kódhoz nem nyúltunk. Az üzleti kulcs (B6) unique indexe **nincs**
  még: az E5 kézi rendezés után, az E6 migrációja hozza létre.
  `docs/visszaallitas-30-perc.md`: a visszaállítás eljárása.
- **Teszt:** helyi Postgres 16, üres sémán és sorokkal: lefut, második
  indításkor „nincs új"; első próbában a `users.id` uuid-FK hibán a
  tranzakció visszagördült (semmi félbe nem maradt), javítva. Trigger:
  insert `tipus='sajat'` → `jelleg='ber'`; `statusz='torolt'` → `torolt_at`;
  visszaállítás → NULL; `tipus` módosítás → `jelleg` követi. E4b: `pg_dump`
  → `pg_restore` külön DB-be → `migrate.mjs` rajta: séma OK, migráció nem
  fut újra. `next build` zöld.
- **Kockázat:** élesben ha a `fuvar_dokumentumok.tipus`-ban váratlan érték
  van, a NOT VALID miatt nem áll meg. A migráció ~30 objektumot hoz létre —
  ha bármelyik hibázik, rollback és a deploy sikertelen marad az előző
  verzión (szándékos). A régi működést semmi nem változtatja.

## 2026-09-19 — Fuvarozás 2 átállás, E3: hatókör-kulcsok, `vezeto` fiók, Szabina elszámolás (B8)

- **Probléma:** a Fuvarozás 2 nézeteihez nem volt hatókör: Szabina „csak
  elszámolás" (díjjal, GPS nélkül — S16) és a Rendszer-egészség csempe nem
  volt kifejezhető; a napi vezetői fiók (`vezeto`) nem létezett. Veszély: ha
  egy új kulcs nem opt-in, a `resolvePermission` default-true szabálya
  minden régi felhasználónak megnyitja.
- **Ok:** a `ModuleKey` lista a régi modulokra készült; a hatókört eddig a
  kulcsok fejezték ki (`fuvarozas_sajat` + szerveroldali saját-kocsi szűrés,
  `posta`), új kulcs nem volt.
- **Módosítás:** `lib/auth/permissions.ts`: `elszamolas` és `rendszer`
  kulcs, mindkettő az `OPT_IN_MODULES`-ban (hiányzó bejegyzés = nem látja).
  `scripts/migrate.mjs`: `vezeto` seed (`SEED_VEZETO_PASSWORD` env;
  fuvarozas+elszamolas+rendszer szerkeszt, számlák/járművek/készlet/dolgozók/
  jelenlét olvas, beállítások nem, régi Áttekintés nem) és
  `grantElszamolasSzabinanakOnce` (Szabina: `elszamolas` view+edit, a `posta`
  marad a régi nézethez). A hatókör-szűrés szabálya az új olvasó akciókhoz
  (E4-től): sofőr → `requireSajatVagyModulJog` + saját kocsi szűrés a
  lekérdezésben (a mai `getSoforAktualisTura` mintája); `elszamolas` jog →
  GPS-részlet mezők nem kerülnek a válaszba.
- **Teszt:** `scripts/teszt-jogosultsag.ts` a `teszt` láncban (28 eset:
  opt-in kulcsok üres/null jogokkal, admin, MODULES lista, a vezeto/Szabina/
  sofőr jogkészletek). Seed helyi Postgresen: `vezeto` létrejön a várt
  jogokkal, a Szabina-grant egyszer fut. typecheck zöld, lint 0 hiba az
  érintett fájlokon.
- **Kockázat:** a `vezeto` fiók csak akkor jön létre, ha a Railway `web`
  szolgáltatáson be van állítva a `SEED_VEZETO_PASSWORD`; a seed egyszer fut
  (`user-vezeto-2026-09-19` kód), a jelszó utána a Beállításokban módosítható.

## 2026-09-19 — Fuvarozás 2 átállás, E2: egyszer futó SQL-migrációk (B2) + állapotgép (B3)

- **Probléma:** (B2) a `db/schema.sql` minden indításkor lefut, de nem
  idempotens lépésnek (átnevezés, constraint csere, backfill) nem volt helye —
  csak JS-ben, kézzel írt `...Once` függvényként. (B3) az új 9 állapotú
  megbízás-életútnak nem volt kódban egyetlen forrása és tesztje.
- **Ok:** a migráció-futtató a séma-újraalkalmazásra épült; állapotgép eddig
  nem létezett (a besorolás a `fuvar-hely.ts` CASE-e).
- **Módosítás:** `scripts/migrate.mjs` → `futtasdSqlMigraciokatOnce`: a
  `db/migrations/NNN_leiras.sql` fájlok fájlnév szerint, egyenként egy
  tranzakcióban, a lefutás az `alkalmazott_javitasok` táblába `sql:<fájl>`
  kóddal (ugyanaz a mechanizmus, mint a meglévő `...Once` lépések); hiba →
  rollback + az indulás megáll. `db/migrations/README.md` a szabályokkal. A
  mappa még üres — az E4 séma-lépései kerülnek ide. Új
  `lib/fuvarozas/allapot.ts` (tiszta modul, még sehol nincs bekötve): a 9
  állapot, a 16 átmenet forrással és feltétellel
  (`ellenorizAtmenet`, `lehetsegesCelok`, `induloAllapot`) — a
  `claude/fuvarozas-atallas-ellenorzes.md` 11.1 szerint.
- **Teszt:** `scripts/teszt-allapotgep.ts` a `teszt` láncban — 44 eset:
  minden engedett él, a 11.1 tiltott élei, feltétel-hiányok, rossz forrás,
  mind a 285 táblán kívüli (állapot, állapot, forrás) hármas tiltva, három
  teljes életút (bér, saját rövid út, „nem kér postát"). A migráció-futtató
  helyi Postgres 16-on kipróbálva: lefut egyszer, második indításkor „nincs
  új", hibás fájlnál rollback (adat érintetlen, jelölés nincs, kilépés 1).
  typecheck zöld, eslint az érintett fájlokon 0 hiba.
- **Kockázat:** a futtató hibánál megállítja az indulást — ez szándékos
  (félbe maradt séma rosszabb); Railway-en a deploy ekkor sikertelen marad az
  előző verzión. Az `allapot.ts` még nem hat a működésre.

## 2026-09-19 — Fuvarozás 2 átállás, E1: a két hitelesítés nélküli Drive-végpont bezárása (B5)

- **Probléma:** `/api/fuvarozas/drive-import` (új fuvar létrehozása) és
  `/api/fuvarozas/drive-frissites` (fuvardíj, számlaszám, postázva, postázási
  cím felülírása id alapján) **hitelesítés nélkül** fogadott POST-ot — bárki,
  aki ismerte az URL-t, írhatott a fuvar-adatokba. A `drive-sync` végpont
  ezzel szemben Bearer-titokkal védett volt. (Átállás-ellenőrzés B5 tétel,
  `claude/fuvarozas-atallas-ellenorzes.md` 11.4.)
- **Ok:** a két végpontot eredetileg az ütemezett Claude-feladat hívta; azt
  a `drive-sync-core.ts` váltotta ki, a végpontok ott maradtak guard nélkül.
  Külső hívó ma nincs (repo-grep, ütemezett feladatok átnézve — azok a másik,
  `fuvar-diszpecser` appot hívják).
- **Módosítás (minimális):** új `lib/fuvarozas/drive-sync-guard.ts`
  (`requireDriveSyncSecret(req)`: nincs `DRIVE_SYNC_SECRET` → 503, rossz/
  hiányzó `Authorization: Bearer` → 401), a `drive-sync/route.ts` beágyazott
  ellenőrzése ebbe kiemelve (viselkedés változatlan), a `drive-import` és a
  `drive-frissites` ugyanezt hívja a body beolvasása előtt. A végpontok
  megmaradnak (nem 410), mert a titokkal továbbra is használhatók; a 4 hetes
  megfigyelés után, ha nincs hívás, törölhetők (7. takarítás-kör).
- **Pipeline:** `npm run typecheck` = `next typegen && tsc --noEmit` (új;
  a Next 16 route-típusok generálása nélkül a `tsc` a `LayoutProps`-on
  elhasal). `scripts/teszt-drive-guard.ts` a `teszt` láncban: a guard
  viselkedése + forrás-szintű ellenőrzés, hogy mindhárom route a guardot
  hívja a body/munka előtt (a route-okat nem importálja, mert azok a teljes
  szerver-oldalt húznák be). Szándékosan `.ts`, nem `.mts`: Node 22.22 +
  tsx alatt az `.mts` tesztek `@/…` névvel importált tagjait nem látja
  (CJS/ESM interop) — a meglévő 4 `.mts` teszt ebben a környezetben emiatt
  nem fut, más Node-verzión igen; nem nyúltam hozzájuk.
- **Teszt:** typecheck zöld; eslint az érintett 5 fájlon 0 hiba (a repo 39
  korábbi lint-hibája változatlan, nem érintett); `teszt-drive-guard`
  17/17; `next build` zöld.
- **Kockázat:** ha valahol mégis van külső hívó a két végpontra, az mostantól
  401-et kap (titok nélkül) — a Railway naplóban `401`/`503` a
  `/api/fuvarozas/drive-import|drive-frissites` útvonalon jelzi. A
  `DRIVE_SYNC_SECRET` Railway-változó nélkül mindhárom végpont 503 (ez a
  szándékolt, biztonságos állapot).

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

## 2026-09-16 (4. kör) — üres Bér fuvarok lista: GPS-teljesítés hamis pozitívjai

- Ok: a GPS-figyelés a felrakás napjától kereste a lerakóhoz érkezést, ezért
  az oda-vissza ingázó NMZ-492 fuvarjait a lerakás előtt lezárta (#128); és
  két azonos lerakójú fuvart (#126, #130) az első érkezéskor egyszerre.
- `teljesites-figyeles.ts`: érkezés csak a lerakási ablak kezdetétől
  (`lerakas_ablak_tol`, különben a lerakás napja); az érkezéseket számolja
  (kívülről a 2 km-es körbe érkező utak), kocsi+lerakó párra legfeljebb
  annyi fuvart zár le, ahány érkezés volt.
- `migrate.mjs` egyszeri lépések: ablak előtti (#128) és kettős (#126,
  #130) jelölés visszavonva; a javított figyelés dönt újra.

## 2026-09-16 (5. kör) — Drive-mappa ↔ adatbázis teljes összevetés

- Mind az 56 Drive-fájlhoz van élő sor vagy csatolás (napló: „drive …"
  sorok, azonosító ÉS URL szerint). Feldolgozatlan irat nincs.
- A poz 3003 (RBT, #121) törölt sora fogta a fájlt → felszabadítva,
  a Frissítés gomb újraimportálta (#133).
- Három irathoz két élő sor: #5/#112 (HAPP, azonos számla), #42/#100 és
  #76/#102 (Hajdúspedíció, a #100/#102 számlázatlan másodpéldány). Budaházi
  Zoltán jóváhagyásával a másodpéldányok töröltnek jelölve (egyszeri lépés,
  biztonsági feltétellel).
- Tanulság a kódban: a törölt sor is fogja a Drive-fájlt (ismertDriveFileIdk,
  ismertDokumentumUrlak), ezért kézi törlés után az irat sosem importálódik
  újra — ezt a Duvenbeck-mintájú felszabadítás oldja meg esetenként.

## 2026-09-16 (6. kör) — szabály-ellenőrzés: minden szabály folyamatosan érvényes

- Friss indítási napló (13:20 UTC): A=B=C=D=0, saját cég megrendelőként 0,
  megrendelő nélküli aktív sor 0; fülek: Bér folyamatban 2, Saját
  folyamatban 0, Számla/Posta 4, Archív 85.
- Rés 1 (kód): a kézi felvitel/jóváhagyás (`addFuvar`, `approveFuvar`) nem
  szűrte a saját cégnevet megrendelőként — `kanonikusMegrendeloNev` most
  üresre veszi (`sajatCegunkE`), nem csak a következő indítás javítja.
- Rés 2 (GPS): a kettős lezárás KÜLÖN körökben is előjött (#126 13:05,
  #130 13:20 — a körönkénti számláló a már lezárt #126-ot nem látta).
  `teljesites-figyeles.ts`: a közelmúltban lezárt (GPS/kézi) azonos kocsi +
  lerakó fuvarok érkezése is elhasznált (`getFrissenTeljesitettSajatFuvarok`).
  `migrate.mjs` egyszeri lépés: a #130 jelölése visszavonva, a javított
  figyelés dönt újra.

## 2026-09-16 (7. kör) — GPS fül: hibajavítások (fejlesztés előtt)

- **Közös felismerő út** (`lib/fuvarozas/erintes-felismeres.ts`): a 15 perces
  Teljesítve-figyelő (`teljesites-figyeles.ts`) mostantól ugyanazt a
  `jelolMegallokat` logikát futtatja, mint a GPS lap — állomásokra bontott,
  geokódolt, időablakos megállók; egy fuvar akkor kész, ha MINDEN lerakóját
  elhagyta. A már lezárt fuvarok is részt vesznek a párosításban (foglalják
  a saját megállásukat), így egy érkezés körökön át sem zár le két fuvart.
- **Érintés-napló nézőtől függetlenül**: a gps_erkezes/gps_tavozas a
  figyelőből íródik, nem csak a GPS lap megnyitásakor.
- **Szabályok** (`idovonal.ts`): az időablak előtt véget ért állás nem
  érintés (ingázó kocsi); a 10 perces minimum a 2 km-es körön belül is
  érvényes, kivéve 300 m-en belül (piros lámpa nem érkezés); mozgás csak a
  sebességből (járó motor nem vezetés).
- **Kézi kész-állapot egyesítve**: a sofőr mobilos jelölése, a GPS lap
  pipája és a fuvar Teljesítve is készre teszi a pontot (forrás jelölve).
  A pipa megállónként működik (`setMegalloKesz`), a fuvar az utolsó
  lerakónál zárul.
- **Felület**: elavult statikus becslés helyett „nincs friss becslés";
  30 percnél régebbi élő jelnél sárga „utolsó jel X perce".
- **Gyorsítótár** (`idovonal-cache.ts`): getIdovonalak 60 s (ma) / 10 perc
  (múlt nap), kézi jelölés törli.
- Teszt: `scripts/teszt-erintes.mts` (20 eset), bekötve az `npm run teszt`-be.

## 2026-09-16 (8. kör) — GPS fül: fuvaronkénti blokkok, időrend

- Ok: a nap pontjai egyetlen, idő szerint rendezett listába lapultak, a
  tegnapi felrakók kiestek, egy megállás csak egy pontot igazolt (a BMW-nél
  a #126 lerakása és a #128 felrakása egy megállás volt) — Micónál
  „Fel, Le, Le, Le" sorrend lett.
- `actions.ts` `fuvarBlokkok`: fuvaronként egy blokk, pontok útvonal-
  sorrendben, blokkok az első pont ideje szerint; `napElteres` a más napra
  eső pontokon (tegnap/holnap jelöléssel, halványan). A `holnapiMegallok`
  külön doboz megszűnt. Az élő ETA célja a blokkok sorrendjében az első
  el nem ért pont.
- `idovonal.ts` párosítás: egy valós megállás egy lerakót ÉS egy felrakót
  igazolhat, két azonos szerepűt nem (Budaházi Zoltán döntése: blokkok +
  tegnapi felrakó látszik).
- Teszt: +2 eset (22).

## 2026-09-16 (9. kör) — GPS-felismerés élesítés utáni javítások

- Diagnosztika: a figyelő körönként naplózza a nyitott fuvarok megállóit
  (geokódolás, érkezés/távozás vagy „nincs érintés" + ablak) — Railway-
  naplóból ellenőrizhető.
- Két téves #130-lezárás oka és javítása: (1) a #126/#130 azonos BMW-címe
  pár tíz méterrel eltérő koordinátára geokódolódott, a méterekkel közelebbi
  nyert → a párosítás fél km-es sávon belül a fuvar sorrendje szerint dönt;
  (2) a BMW-n belül két állás (porta, majd 1,6 km-rel arrébb a rámpa) két
  látogatásnak számított → egy címnél az egymást követő állások egy
  látogatás, amíg a kocsi nem távolodott 3 km-nél messzebb. Mindkét
  visszavonás egyszeri, feltételes migrate-lépés. Teszt: 32 eset.
- Ellenőrzött végállapot 19:11-kor: #128 Fel Debrecen 15:59→07:15, Le Pápa
  „itt áll"; #130 Fel Pápa „itt áll", Le Debrecen nincs érintés — mindkettő
  nyitott, egyezik a valósággal.

## 2026-09-17 (10. kör) — GPS lap: csúszó fuvarok, tegnapi kész, RBT cím, napváltás

- Elv (Budaházi Zoltán): a megbízás dátuma irányadó, a fuvar állapotát a
  GPS dönti. Ezért:
  - a mai nézet a járművel rendelkező, még nem Teljesítve, 3 napon belül
    lerakandó fuvarokat is mutatja („Csúszik (korábbról)" jelölés), a
    figyelő pedig a dátumtól/fültől függetlenül lezárja, ha a GPS szerint
    kész (nyitott = nem Teljesítve és nincs számla);
  - a megjelenített nap előtt Teljesítve-re jelölt fuvar nem jelenik meg
    (tegnap kézzel készre tett saját fuvar mai tervezett nappal).
- `varos.ts`: az RBT „CÉGNÉV [H-4243] TÉGLÁS, Hrsz. …" formátum városa és
  irányítószáma felismerve (eddig nyers szöveg, pontosság „ismeretlen", a
  GPS-felismerés kihagyta).
- `FUVAR_MA_SQL`: a Megbízások fülek napváltása budapesti nap szerint
  (eddig UTC current_date → nyáron 02:00-kor fordult). A migrate.mjs
  ellenőrző másolatai és a check-szkript is erre álltak át.

## 2026-09-17 (11. kör) — Fogyasztás a GPS lapon (Ecofleet útvonal-jelentés)

- Az Ecofleet trip-lista nem tartalmaz üzemanyag-adatot; a
  `Reports/getReport` (id `trips`, csv) igen — ugyanaz, mint a napi
  e-mailes Excel. A paramétereket (`begTimestamp`, `endTimestamp`,
  `objectIds[]`) lapos query-ként kell átadni, JSON-ban a szerver
  figyelmen kívül hagyja őket. `ecofleet.ts getUtvonalJelentes`.
- `lib/fuvarozas/fogyasztas.ts getFogyasztas(nap)`: járművenként a
  kiválasztott nap és az azzal záruló 7/14 nap km-e, litere, átlaga és
  gázolajárral (NAV ár − kedvezmény) számolt költsége, 10 perces cache.
  A GPS csempén „Fogyasztás" doboz.
- Gergő nyomkövetője (AOPU-427) nem mér üzemanyagot (minden út 0 l) — a
  felület ezt „nincs mérés"-ként jelzi, nem 0 literként. Budaházi Zoltán
  javíttatja az eszközt.
- A migrate.mjs induláskori Ecofleet-diagnosztikája (fogyasztás, jelentés-
  API próba, apidoc) kikerült — a funkció a modulban él.

## 2026-09-17 (12. kör) — Sofőr mobil nézet, 1. fázis

- Terv: `docs/sofor-mobil-terv.md` (döntések: pénz nem látszik, kocsi nélküli
  megbízás nem látszik, fotók a Drive-ba, 1. fázissal kezdünk).
- `getSoforNap(employeeId, napISO?)`: a sofőr TELJES napja fuvaronkénti
  blokkokban. Nem külön logika — a GPS lap gyorsítótárazott idővonalából
  (`getIdovonalak`) veszi a blokkokat, hogy a sofőr és a diszpécser ugyanazt
  a sorrendet és kész-állapotot lássa. Bővítés: időablak (`felrakas/
  lerakas_ablak_tol/ig`), Reise ID, áru, súly, iratlista.
- Új mobil nézet (`components/erkezes/sofor-fuvar-nap.tsx`): következő megálló
  nagy kártyán navigáció-gombbal, fuvaronkénti blokkok (megrendelő, Út ID
  vágólapra, irány, „Korábbról csúszik"), minden megálló megerősíthető (eddig
  csak a soron következő), napléptetés, következő napok előnézete.
- Duvenbeck: az Út ID a blokk fejlécében, a KÉT irat külön gombbal
  (megbízás / rakománylista, verzióval), időablak lejárt/most/jövő jelöléssel,
  eltérő rendszám halk figyelmeztetéssel (nem elrejtéssel).
- `app/api/fuvarozas/dokumentum/[dokId]/route.ts`: a Drive-iratok a saját
  szerverünkről, a service accounttal — a nyers Drive-link a sofőr
  telefonján nem nyílik meg. Jog: `fuvarozas` vagy `fuvarozas_sajat`.
- Biztonsági javítás: a `getSoforAktualisTura` és a `markMegalloKesz` eddig
  ellenőrzés nélkül fogadta el a kliens `employeeId`-jét és a sofőr nevét.
  Mostantól `requireSajatVagyModulJog`, a jelölő neve a munkamenetből.

## 2026-09-17 (13. kör) — Sofőr mobil nézet, 2. fázis: visszacsatolás a GPS-nek

- „Megérkeztem": `fuvar_megallo_allapot.kezi_erkezes`, a sofőr tényleges
  érkezése a becslés helyett; a `lerakas_tenyleges_at` tartalékként ezt is
  használja.
- Helyszín-szótár (`fuvar_helyszin_koordinata`): bizonytalan geokódolású
  címnél a sofőr a rakodóhelyen állva a kocsi Ecofleet-pozícióját rögzíti a
  cím valódi helyeként (`rogzitMegalloHelyet`; csak álló kocsival, 15 percnél
  frissebb jellel). A geokódoló (`geokodolCachelve`) a külső hívás előtt a
  szótárat nézi — így az RBT „[H-4243] TÉGLÁS, Hrsz…" típusú címek
  felismerése egy koppintással végleg megoldható.
- A GPS lap menetidő-becslése is a közös, gyorsítótárazott geokódolót
  használja (eddig cache nélkül, külön hívta).

## 2026-09-17 (14. kör) — Sofőr mobil nézet, 3. fázis: papír és jelzés

- Fuvarlevél-fotó a lerakásnál: telefonon kicsinyítve, a Drive
  `Fuvarmegbizások/Fuvarlevelek` almappájába, `fuvar_dokumentumok` sorként
  (`tipus = 'fuvarlevel'`). A Számla/Posta „Papírra vár" oszlopban „fotó (n)"
  link — a papír létezése aznap látszik, a fizikai beérkezést nem váltja ki.
  Drive scope `drive.readonly` → `drive`; a service account a mappán
  Szerkesztő (Budaházi Zoltán, 2026-09-17).
- „Gond van": a sofőr jelzése a `feladatok` táblába, a meglévő csatornán.
- „Nincs pozíciószám · beírom": a kapuban kapott szám rögzítése, csak üres
  mezőbe.

## 2026-09-17 (15. kör) — Sofőr fiókok: újralétrehozás és explicit kocsi-összerendelés

- A `VadonGergo` és `TakacsMiklos` fiók a 09-13-i seed után törlődött; a seed
  lépés rögzítve maradt, ezért nem jött létre újra. Új egyszeri seed
  (`…-2026-09-17`) hozta létre őket a `SEED_*` env jelszavakkal, sofőr
  jogokkal. Induláskor `ellenorizSoforFiokokat` kiírja mindkét fiók
  állapotát, és a hiányzó alkalmazott-hozzárendelést név alapján pótolja.
- Micó a Dolgozók között „Takács Miklós" néven szerepel. A jármű ↔ sofőr
  egyeztetés mostantól a `vehicles.ts alkalmazottNevek` teljes-név listáján
  áll (Takács Micó / Takács Miklós, Vadon Gergő); a keresztnév szó szerinti
  egyezése csak tartalék. Ezzel a terv „explicit összerendelés" pontja kész.
- Napló 11:49: mindkét fiók aktív, alkalmazott hozzárendelve, `erkezes` és
  `fuvarozas_sajat` látja/írhat.

## 2026-09-17 (16. kör) — Sofőr mobil nézet, 4. fázis: várakozás jelölése

- „Várakozom" / „Várakozás vége" a sofőr megállóján
  (`fuvar_megallo_allapot.varakozas_kezdete/vege`). A GPS lapon a megálló
  sorában sárga jelzés (folyamatban: „várakozik HH:MM óta", lezárva:
  „várakozás N perc"), a megbízás részletein „Várakozás: N perc" összesítés
  (`varakozas_perc`). A Duvenbecknél a rakodóhelyi várakozás pótdíjas; ez
  jelzés a diszpécsernek, nem automatikus számlázás.
- A `getMegalloAllapotok` mostantól a nem kész, de várakozás-jelölt sorokat
  is visszaadja; a `ratesziKeziJeloleseket` a várakozást a kész állapottól
  függetlenül ráteszi a megállóra.
- Ezzel a sofőr mobil terv mind a négy fázisa élesben van.

## 2026-09-17 (17. kör) — Áttekintés → Fuvar fül: a sofőr-nézet állapotai a vezetői kártyán

- Átnézés Budaházi Zoltán mobil nézetén (helyi Playwright-képernyőkép,
  390 px): a kártya a több napos (tegnap felrakott, ma lerakó) fuvart nem
  mutatta jelenleginek; a részletlista a kocsi minden régi, lezárt fuvarját
  hozta (a `statusz <> 'lezarva'` szűrőt a felület sehol nem állítja);
  azonos napon nem volt időpont szerinti sorrend; a kocsi nélküli megbízás
  sehol nem látszott.
- Új `getFuvarFulAdatok`: a MAI kép a GPS lap gyorsítótárazott idővonalából
  (`getIdovonalak`) jön, fuvaronkénti blokkban, állomásonként kész (GPS /
  kézi, a jelölő nevével és a tényleges idővel), épp itt áll, becsült érkezés,
  sofőr-jelölt várakozás. A mai nap utáni megbízások és a kocsi nélküliek a
  Megbízások közös „folyamatban" szabályával (`getFuvarHelye`) szűrve,
  dátum + időpont szerint rendezve. A lejárt becslés nem mutat múltbeli órát.
- A kártyán látszik a sofőr gondjelzése (nyitott `feladatok` sor) és a
  fuvarlevél-fotó; a részletnézetből a fotó megnyitható
  (`/api/fuvarozas/dokumentum/…`, az `attekintes` jog is elég hozzá).
- „Kocsi nélkül" doboz a kártyák fölött, csak ha van ilyen megbízás. A
  Jani-kártya marad (hamarosan három kocsi lesz).

## 2026-09-17 (18. kör) — Betűtípus: az egész app Times New Romanra esett vissza

- `app/globals.css`-ben a `--font-sans: var(--font-sans);` önmagára
  hivatkozott, ezért soha nem oldódott fel, és minden oldal (asztali és mobil)
  a böngésző alapértelmezett serif betűjével jelent meg. Ez a CLAUDE.md-ben
  is nyitott hibaként szerepelt. Javítás: `var(--font-geist-sans)`, amit az
  `app/layout.tsx` Geist-betöltése ad. Helyi Playwright-képernyőképen a
  Fuvar fül Geist Sans-szal jelenik meg. Minden modult érint, ezért külön PR.

## 2026-09-18 (19. kör) — Drive-import: kocsi felismerése két rendszámból

- Hiba: a Drive-importból jött megbízásokon a Kocsi mező üres maradt, kézzel
  kellett kocsit választani (Hajdúspedíció 09.18, BB-Logistic 09.17, Ghibli).
  Ok: a megbízók a vontató ÉS a pótkocsi rendszámát együtt írják
  ("NMZ492/XZV926", "AOPU-427 AOTY-474"), a `findJarmuByPlate` pedig a teljes
  szöveget egyetlen rendszámhoz hasonlította — sosem egyezett.
- Javítás: `lib/fuvarozas/vehicles.ts` `findJarmuInSzoveg` — a szöveg minden
  rendszám-szerű darabját külön illeszti (pontos, majd 1 karakternyi elgépelés,
  pl. RBT "AODU427"), rendszám nélkül a sofőr teljes/keresztneve. Két saját
  kocsi egy szövegben → nem tippel. Az import (`drive-sync-core.ts`
  `resolveJarmuMezo`) ezt használja. Regressziós teszt: `scripts/teszt-import.mts`.

## 2026-09-18 (20. kör) — GPS lap: időpont nélküli többnapos fuvar a nap végére

- Hiba: Micó az aznapi Ebes→Balkány fuvart csinálta, a GPS lap mégis a
  Hajdúspedíció Nyírjákó→Mosonmagyaróvár (péntek fel, hétfő le) fuvart
  jelölte "Folyamatban". Ok: időpont nélkül mindkét fuvar reggel 7-es
  alapértelmezett kezdést kapott, és a többnapos fuvar (kisebb becsült
  érkezés / sorrend) a lista elejére került — a "következő pont" az ő
  felrakója lett.
- Javítás: `lib/fuvarozas/actions.ts` `napVegereSorolt` — egy időpont
  nélküli, többnapos fuvar a felrakás napján a lista végére kerül (a
  rakomány a kocsin marad, előbb az aznap le is rakott fuvarok jönnek), a
  láncolt élő becslésben és a blokkok sorrendjében is. Nem él, ha van
  időpont, ha a kocsi már járt a fuvar egy pontján, vagy ha csúszó fuvar.
  Új mező: `TervezettFuvarSzakasz.tobbNapos`.
- Megfigyelés (nem kód): BB-Logistic 02215-2026 (hétfő, Füzesabony→
  Nyíradony) a SpediTrans kéthasábos fel-/lerakó táblája miatt fordítva
  jött be (Fel Nyíradony, Le Füzesabony) — a Megbízásokon kézzel cserélendő.

## 2026-09-18 (21. kör) — SpediTrans (BB-Logistic) sablon: felrakó/lerakó determinisztikusan

- Hiba: a BB-Logistic (SpediTrans for Windows) megbízáson a felrakó és a
  lerakó két hasábban áll egymás mellett; a nyelvi modell ezt fordítva is
  olvashatja (02215-2026.pdf, hétfői Füzesabony→Nyíradony), és a megrendelőnek
  a felrakó céget (DS Smith) írta a BB-Logistic helyett.
- Javítás: új partner `bb-logistic` (`lib/fuvarozas/import/partnerek.ts`,
  ujjlenyomat: "BB-Logistic", "speditrans.hu", "SpediTrans for Windows") és
  `lib/fuvarozas/import/speditrans.ts` — a pdf-parse VALÓDI kimenetében a két
  háromsoros blokk (cég / HU-irsz város / utca) egymás után áll, előbb a
  felrakó; ezt, a két határidőt, a pozíciószámot, a fuvardíjat és a
  rendszámokat reguláris kifejezés adja. Új `Partner.kivon` horog: a
  determinisztikus mezők felülírják a modell tippjét (`drive-sync-core.ts`).
  A megrendelő partnerből: "BB-Logistic Solution Kft.". Minta:
  `scripts/teszt-minta/speditrans-megbizas.txt` (tabulátorokkal, kitalált
  nevekkel), tesztek a `scripts/teszt-import.mts`-ben.
- GPS lap: a "Következő napok" doboz eddig csak a lap megnyitásakor töltődött
  be — most minden frissítéssel (5 percenként, kész-jelölés után is), így a
  Megbízásokon közben javított felrakó/lerakó/kocsi itt is látszik.
- (Ugyanaznap javítva, 22. kör:) a fenti szövegsorrendes olvasás HAMIS volt.

## 2026-09-18 (22. kör) — SpediTrans: felrakó/lerakó oldalkoordinátából

- A pdf-parse sima szövegében a SpediTrans JOBB hasábjának (Lerakás helye)
  blokkja áll a BAL (Felrakás helye) előtt — ezért a nyelvi modell ÉS a 21.
  körös, szövegsorrendre épülő olvasó is fordítva adta (Fel Füzesabony, Le
  Nyíradony); a valóság és az irat: Fel Nyíradony (Bestpallet), Le
  Füzesabony (DS Smith). A pdfjs koordinátái egyértelműek: a Bestpallet-blokk
  x≈25, a "Felrakás helye:" alatt; a DS Smith-blokk x≈301, a "Lerakás helye"
  alatt, ugyanazokon a sorokon.
- Javítás: `lib/fuvarozas/import/pdf-elemek.ts` (`pdfSzovegElemek`: pdfjs
  szövegelemek x/y-nal, `pdfjs-dist` közvetlen függőség), a `Partner.kivon`
  második paramétere az elemek (docx/Docs: null); `speditrans.ts` a felrakót
  és a lerakót KIZÁRÓLAG koordinátából olvassa (címke alatti hasáb),
  koordináta nélkül nem tippel. `drive-sync-core.ts` `fajlSzovege` a PDF
  bájtokat is visszaadja. Minta: `scripts/teszt-minta/speditrans-megbizas.json`.
- Teendő kézzel (a már beimportált #136 sor): Fel/Le csere (Fel Nyíradony,
  Le Füzesabony) és megrendelő "DS Smith…" → "BB-Logistic Solution Kft.".

## 2026-09-18 (23. kör) — Törölt Drive-megbízás újraolvasása

- Hiba: a felhasználó törölte a rosszul beolvasott #136-ot (BB-Logistic
  02215-2026), hogy a frissítés újra behozza — de a törölt sor fogja a
  Drive-fájlt (drive_file_id / dokumentum_url), ezért a szinkron "ismertnek"
  veszi, és a dokumentum_url egyedi indexe miatt új sor sem születhet.
- Egyszeri javítás: `scripts/migrate.mjs`
  `szabaditsaFelTorortBbLogisticMegbizastOnce` — a törölt, számlátlan sor
  elengedi az iratot (az RBT poz 3003 minta szerint), a következő szinkron-kör
  a SpediTrans-olvasóval újra felveszi.
- Tartós megoldás: "Újraolvasás a Drive-iratból" gomb (RefreshCw) a
  Bér/Saját/Számla-posta listák sorain, csak Drive-ból importált sornál —
  `felszabaditFuvarDokumentumot` szerver-akció (törlés + irat elengedése +
  napló/csatolmány hivatkozás oldása), utána azonnal `frissitsDriveBol()`.
  A sima Törlés viselkedése változatlan (nem hoz vissza semmit).

## 2026-09-18 (24. kör) — Minden Drive-megbízó partner-sablont kap; a megrendelő utólagos helyesbítése

- Hiba: a Ghibli (N26/22795, N26/22824) megbízásain a megrendelő "Apollo
  Tyres (Hungary) Kft" lett — a nyelvi modell a "Felrakóhely: … (Apollo
  Tyres…)" zárójeles cégét vette megbízónak, mert a Ghibli nem volt ismert
  partner. A Drive-mappa 60 iratának átvizsgálása szerint 15 kibocsátóból
  9-nek nem volt sablonja; ráadásul a SpediTrans-szoftver ujjlenyomata
  (`speditrans.hu`, "SpediTrans for Windows") az Alpok-Trans iratát is
  BB-Logisticnek vette volna.
- `lib/fuvarozas/import/partnerek.ts`: új partnerek — Ghibli
  Szállítmányozási Kft. (45 nap, "Pozíciószámunk"), Hajdúspedíció Kft. (30
  nap, nincs hivatkozás), HRT Spedition Kft. (45), Alpok-Trans Kft. (30,
  SpediTrans-olvasó), SG Transport Kft. (45), Pro Line Speed Kft. (30, nincs
  hivatkozás), K+K Spedit Kft. (45), Well Pack Hungária Kft. (60), VOXOV
  Logistics Kft. (60) — postázási címmel, ahol az irat megadja. A
  BB-Logistic ujjlenyomata csak a cégnév. Szabály: SZOFTVERNÉV NEM
  UJJLENYOMAT. `felismerPartner` döntetlennél null-t ad (nem tippel). Új
  `Partner.nincsHivatkozas`: az import bepipálja a "nincs ilyen" jelölést,
  és a hiányzó pozíciószám nem kifogás (`ellenorzes.ts` 4. paraméter).
- `ellenorzes.ts`: kifogás, ha a tippelt megrendelő a felrakó-/lerakóhely
  szövegében szereplő cég. A nyelvi modell utasítása is kimondja: a
  rakodóhely zárójeles cége nem megbízó, a megbízó a fejléc kibocsátója.
- `drive-sync-core.ts` `megrendelokHelyesbitese`: minden szinkron végén a
  napló nyers szövegéből újra felismeri a partnert a már beolvasott,
  számlátlan, nem törölt sorokra; ha a napló `partner_kod`-ja nem ez,
  a megrendelőt a partner hivatalos nevére írja, pótolja a hiányzó fizetési
  határidőt/postázási címet/"nincs hivatkozás" jelölést, és a naplóba írja a
  partnerkódot (soronként egyszer fut, kézi javítást nem ír felül óránként).
  Névváltozásnál figyelmeztetés a Frissítés gomb visszajelzésében
  (`helyesbitettMegrendelok`). Így a két Ghibli-sor is Ghiblire vált a
  következő szinkronnál, kézi átírás nélkül.
- Tesztek: `scripts/teszt-import.mts` (92 állítás) — az új partnerek
  felismerése, döntetlen → null, Well Pack ≠ saját cég, rakodóhely-cég
  kifogás, hivatkozás nélküli partner.
- Nyitott kérdés a felhasználónak: HRT és K+K a 45 napot BANKI napokban
  számolja (a rendszer naptári napot tárol); a már kiszámlázott sorok
  megrendelőjéhez a helyesbítés szándékosan nem nyúl.

## 2026-09-18 (25. kör) — Aznap lezárt csúszó fuvar a GPS lapon; Ghibli lerakási dátumtartomány

- Eset (Gergő): a #134 Ghibli Gyöngyöshalász→Debrecen (felrakás 09-17
  11:01–14:57) tegnap nem ért a lerakóhoz; ma 07:57-kor érkezett Debrecenbe,
  08:35-kor indult tovább, a figyelő 09:25-kor automatikusan Teljesítve-re
  tette. Attól a perctől a fuvar ELTŰNT a mai GPS lapról: a csúszó-ág
  (`getMaiSajatFuvarok`/`getMaiValodiSajatFuvarok`) csak a még nem
  teljesített csúszó fuvart vette be, a reggeli debreceni lerakás sehol nem
  látszott, miközben a kocsi már a #135 felrakójához (Gyöngyöshalász) ment.
- Javítás: `CSUSZO_NYITOTT_VAGY_AZNAP_KESZ_SQL` — a csúszó fuvar akkor is a
  nap része, ha AZNAP (Budapest szerint) zárult le. A nap előtt lezárt
  csúszó fuvar továbbra is kimarad (napElottKesz). A "Csúszik (korábbról)"
  jelvény csak a még nyitottakon marad.
- Ok a háttérben: a Ghibli-iraton "Lerakás dátuma: 2026.09.17 - 2026.09.18"
  tartomány áll, a nyelvi modell egynaposnak vette → lerakási dátum üres.
  Új `lib/fuvarozas/import/ghibli.ts` (`kivonGhibliMezoket`): a tartomány
  vége a lerakás napja; pozíciószám ("Pozíciószámunk N26/…"), díj
  ("átvételi díjtétel 800.00 EUR +ÁFA"), rendszámok ("Rendszám: AOPU427,/
  AOTY474") címkéhez horgonyzott, fehér karakterre érzéketlen mintával — nem
  illeszkedésnél a modell tippje marad. Tesztek: 101 állítás.

## 2026-09-18 (26. kör) — GPS lap: táblázatos nap asztalon, lapozható kocsik telefonon

- A GPS lap új elrendezése a jóváhagyott látványtervek (T1 asztali táblázat,
  M4 mobil kocsi-fülek) szerint. Fent a nap összképe hét számmal (fuvar,
  kész, folyamatban, csúszik, nyitott gond, GPS nélküli kocsi, megtett km),
  alatta kocsinként: név + rendszám + mai km, a „Hol van most” sáv (hely,
  sebesség, utolsó GPS-jel, mai km, következő megálló becsült érkezéssel,
  nem tervezett állások), és a táblázat: Fuvar (megbízó, hivatkozás, áru,
  mennyiség, súly, díj) · Megálló · Város · Állapot (Kész / Rakodik / Úton
  oda / Csúszik / Terv) · Érkezés · Távozás · Rakodás · Sofőr jelzése.
- Telefonon (lg alatt) ugyanez kocsinként egy lapon: fent a három kocsi
  füle, a lapok között balra-jobbra húzással (scroll-snap) vagy a fülre
  koppintva lehet váltani; három oszlop (Megálló, Érkezés, Távozás), a
  rakodás, a sofőr jelzése és a gond a sor alatt. A cellák tartalmát az
  asztali és a mobil nézet ugyanabból a `sorAdatok` függvényből kapja.
- Új adatok az idővonal-eredményben (`lib/fuvarozas/actions.ts`):
  `MegalloBejegyzes.tenylegesTavozas` (GPS szerinti továbbindulás),
  `keziErkezes` (a sofőr „Megérkeztem” koppintása), `keszAt` (kézi készre
  jelölés ideje); `FuvarBlokk.aru/mennyiseg/suly/fuvardij/fuvardijPenznem/
  fuvarlevelFotoDb/gondok`; `JarmuIdovonalEredmeny.napiKm` és
  `nemTervezettAllasok` (≥15 perces, tervezett címtől 2 km-nél távolabbi
  GPS-állások, pihenő nélkül). A gondjelzések a `feladatok` táblából
  jönnek (`getGondJelzesek`), a nyitottak és a 3 napon belül lezártak.
- Ehhez a napi fuvar-lekérdezések (`getMaiSajatFuvarok`,
  `getMaiValodiSajatFuvarok`, intervallum) az áru/díj mezőket és a
  fuvarlevél-fotók számát is hozzák; `getMegalloAllapotok` a `kesz_at` és
  `kezi_erkezes` oszlopot is, és a csak „Megérkeztem”-mel rendelkező sort is.
- A rakodási idő a GPS érkezés → távozás különbsége, a sofőr által jelölt
  várakozással („38 perc, ebből 25 perc várakozás”). Kézzel készre jelölt,
  GPS által nem látott megállónál csak a sofőr ideje áll, ha koppintott.
- Megmaradt: a lerakó sor kézi „kész” pipája, a fogyasztás doboz és a
  következő napok doboz (a táblázat alatt), a „Nincs kocsi hozzárendelve”
  lista, a napok közti lapozás (csak visszafelé).
- Kiegészítés: telefonon a diszpécser nem a /fuvarozas lapot, hanem az
  Áttekintést (/attekintes, saját színséma) látja — ezért a Fuvar fül is a
  táblázatos napot kapta (M4): összkép, kocsi-fülek balra-jobbra
  húzással, kocsinként „Hol van most” doboz, háromoszlopos táblázat, alatta
  a következő napok. A sor-logika közös modulba került
  (`lib/fuvarozas/gps-sorok.ts`: `sorAdatok`, `osszkep`, `kovetkezoSzoveg`,
  formázók), a /fuvarozas GPS fül és az Áttekintés ugyanazt számolja.
  `FuvarFulAdatok.betoltve` a betöltés pillanata (a renderben nincs
  `Date.now()`).

## 2026-09-18 (27. kör) — Csak városnév szintű cím felismerése; a figyelő a Saját fuvarokat is nézi; megbízásonként külön kártya telefonon

- Hiba (Budaházi Zoltán): Micó Nyírjákón felrakott, a rendszer mégsem
  jelölte késznek; az Ebes→Balkány saját fuvar sem zárult le; telefonon a
  két megbízás egyetlen listának látszott. A figyelő naplója 11:02 óta
  minden körben „Fel Nyírjákó [geo ~csak_varos] nincs érintés”.
- Ok 1: a megbízáson csak a település neve áll („Nyírjákó”, „Ebes”), a
  geokódolt pont a falu közepe, a rakodó a szélén — a 2 km-es kör nem
  érte el. Javítás: `lib/fuvarozas/idovonal.ts` `cimSugarKm` — csak
  városnév pontosságú címnél 4 km-es felismerési kör (pontos címnél marad
  2 km); a felismerés bizonytalan (kérdőjeles) jelölést kap, ahogy eddig.
  A tervezett címek listája (`TervezettCim`, `sugarKm`) ugyanezt a kört
  használja az állás-kategorizálásnál és a „nem tervezett állás” szűrőnél
  (`tervezettCimKozeleben`). Teszt: `scripts/teszt-erintes.mts` 3b.
- Ok 2: a 15 perces figyelő (`getSajatFuvarokErinteshez`) csak a Bér
  fuvarokat (tipus='sajat') vette — a Saját fuvarok fül tételeit se nem
  naplózta, se nem zárta le, és a párosításban sem foglalták a
  megállásukat. Most mindkét típus benne van; a GPS szerint kész saját
  fuvar Teljesítve lesz (és mint a kézi Kész gombnál, az Archívba kerül).
  `FuvarErintesSor.tipus` új mező, a naplóban „(saját)” jelölés.
- Napló-diagnosztika: nem érintett megállónál a figyelő kiírja a
  geokódoló cím-alakját és koordinátáját (`TervezettMegallo.geoCimke`),
  valamint a nyomvonal legközelebbi, 5 percnél hosszabb állását (távolság,
  idő, hossz, Ecofleet-cím) és a felismerési kört — a Railway-naplóból
  látszik, miért nincs érintés (messze állt / rossz geokódolás / nem járt ott).
- Telefon (`components/attekintes/fuvar-tablazat-mobil.tsx`): minden
  megbízás külön kártya, színezett fejléccel („1. fuvar / 2”, megbízó,
  hivatkozás, áru, díj) és a fuvar egészének állapotával (Kész / Rakodik /
  Úton oda / Csúszik / Terv), alatta a saját megálló-táblázata.
- Kiegészítés (az új napló alapján): az Ebes→Balkány saját fuvar az első
  körben Teljesítve lett (Ebes 08:51–09:44, Balkány 10:33–11:36). Nyírjákóhoz
  viszont 11:36 óta egyetlen lezárt megállás sem volt a nyomvonalon: a
  Balkány→Nyírjákó út még nyitott trip az Ecofleetben (járó motor a rakodás
  alatt, vagy késő trip-lezárás), a rendszer a kocsit három órán át „élő
  vezetés”-nek vette. `kiegesziteloAllapottal`: ha az élő pozíció ÁLL
  (≤3 km/h), a jel friss (≤30 perc), és a légvonalból becsült érkezés
  (×1,3 kerülő, 60 km/h) óta legalább 10 perc eltelt, élő vezetés + élő
  állás képződik a jelenlegi helyre — a felrakó „éppen itt / Rakodik” lesz.
  Kész (elhagyva) csak a tényleges továbbhaladás után, mint eddig. A figyelő
  naplózza az élő pozíciót, a jel idejét és az utolsó lezárt szakasz végét.
  Teszt: `scripts/teszt-erintes.mts` 3c.
- Kiegészítés 2 (Budaházi Zoltán: „Micó mindjárt visszaér a telepre,
  megpakolt Nyírjákón”; „Gergő sem úton van, hanem pakol rég óta”):
  a napló szerint Micó 12:26-kor ért Nyírjákóra (a trip lezárult), 14:57-kor
  már 72 km/h-val jött hazafelé, de az Ecofleet az utolsó lezárt trip
  `stoppedAfter` mezőjét a következő trip lezárásáig nem tölti ki, ezért a
  nyomvonalon nem volt állás. `kiegesziteloAllapottal`: ha a kocsi MOZOG, az
  utolsó lezárt szakasz vezetés (állás nélkül), és a lezárás óta a
  légvonalból becsült menetidőnél legalább 10 perccel több telt el, az
  állás a végpontra kerül (érkezés = a trip lezárása, továbbindulás = most −
  becsült menetidő), utána élő vezetés — a felrakó így kész (elhagyva).
  Amint az Ecofleet lezárja a következő tripet, a valódi érték lép a
  helyébe. Teszt: `scripts/teszt-erintes.mts` 3d.
  Gergőnél a felrakó sor „Rakodik” volt, de a lerakó sora „Úton oda”: a
  `sorAdatok` mostantól csak akkor ad „Úton oda”-t, ha a kocsi sehol nem
  áll éppen (`SorKornyezet.allValahol`, `allValahol(fuvarok)`); a „Következő”
  mező ilyenkor „rakodás után Lerakás Debrecen, kb. …”.
- Kiegészítés 3 („Gergőnél mindig úton oda, holott órák óta pakolják; Micónál
  Mosonmagyaróvárhoz úton oda, pedig hétfőn indul”): „Úton oda” mostantól
  csak akkor, ha a kocsi az élő GPS szerint MOZOG (> 3 km/h,
  `SorKornyezet.mozog`, `eloMozog`), sehol nem áll éppen, a megálló a
  következő ÉS mai (`napElteres === 0`) — a hétfői lerakó „Terv”. A mobil
  fuvar-kártya fejléce ugyanígy. A GPS lap útján számolt állapot is a
  naplóba kerül (`[idovonal] Gergő (0 km/h): #135 Fel Gyöngyöshalász itt
  áll 11:01 óta, …`), hogy a figyelő és a lap eltérése azonnal látsszon.
  Megjegyzés: a telefonon a lehúzásra frissítés a RÉGI kliens-kódot futtatja
  egy új kiadás után — a sor-logika a böngészőben fut —, ezért kiadás után
  egyszer újra kell tölteni az oldalt.
- Kiegészítés 4 (az új `[idovonal]` naplóból): a GPS lap útján Gergő
  tegnapi, ma 09:25-kor lezárt #134-es fuvarjának felrakója (Gyöngyöshalász,
  azonos cím) vitte el a mai 11:01-es érkezést a #135 felrakója elől — a lap
  csak a mai nyomvonalat látja, a #134 tegnapi valódi látogatása nem volt
  benne, és a párosítás a korábbi fuvart részesíti előnyben. Új szabály
  (`TervezettMegallo.fuvarLezarva`, `jelolMegallokat`): egy lezárt fuvar
  megállója a Teljesítve-jelölés UTÁN kezdődött látogatást nem kaphatja meg.
  A figyelő is megkapja (`FuvarErintesSor.teljesitve_at`). Teszt: 3e.
- Kiegészítés 5 (Micó hazaért Szakolyba és áll): a 4. kiegészítés „álló
  kocsi” ága a 12:26 óta eltelt teljes időt a mostani (szakolyi) állásra
  tette, a nyírjákói állás eltűnt, a felrakó megint „nincs érintés” lett.
  Új modul `lib/fuvarozas/elo-elozmeny.ts`: a figyelő minden köre és minden
  GPS lap / Áttekintés betöltés felírja (memóriában, 1 napra) a kocsi élő
  pozícióját és hogy mozgott-e. `kiegesziteloAllapottal` (`elozmeny`
  paraméter): egy lezárt trip végpontján (P) bizonyítottan állt a kocsi,
  ezért P-re mindig kerül állás (a lezárástól a P elhagyásáig — a
  megfigyelésekből: mikor láttuk utoljára P-n állva / először távol,
  különben a mostani helyig becsült menetidővel visszaszámolva); a mostani
  hely (Q) állása a Q-n való első megfigyeléstől számít, megfigyelés nélkül
  csak akkor, ha P-nél az elhagyás ismert (utolsó lezárt szakasz állás).
  Teszt: `scripts/teszt-erintes.mts` 3f (előzmény nélkül és előzménnyel).
- Kiegészítés 6: Gergő 15:15 körül indult el Gyöngyöshalászról, a
  távozás mégis 13:40 volt (az utolsó lezárt állás vége; a telepen belüli
  átállás tripje még nyitott). Ha a kocsit a lezárt állás után is a
  helyszínen állva láttuk (élő előzmény), az állás a megfigyelt
  elhagyásig hosszabbodik. Teszt: 3g.

## 2026-09-19 (28. kör) — /posta: a „Postázva” pipa hibája; minden sornak legyen postázási címe

- Hiba: Budaházi Szabina /posta nézetében a „Postázva” pipa (és a
  postázási cím szerkesztése) mindig „Nem sikerült menteni” hibával
  pattant vissza. Ok: `setFuvarPostazva` / `setFuvarPostazasiCim` csak a
  Fuvarozás modul szerkesztési jogát fogadta el, neki viszont csak a
  Posta modulja van engedélyezve (`scripts/migrate.mjs`, a nézet is a
  Posta jogot nézi). Javítás: `requireAnyEditPermission(["fuvarozas",
  "posta"])` mindkét műveletnél.
- `getSzamlaPostaFuvarok` (a desktop Számla/Posta fül és a /posta nézet
  közös listája): ahol nincs külön postázási cím, ott a megbízó címe
  kerül be (`getMegbizoCime`: partner-sablon címe `PARTNEREK`-ből,
  ennek hiányában ugyanannak a megbízónak a legutóbbi fuvarján rögzített
  cím), és el is mentődik (csak üres mezőt tölt, kézi címet nem ír felül).
- Kiegészítés 1: Duvenbeck postázási címe „8445 Csehbánya, Újtelep utca 41.”
  (partner-sablon). A Duvenbeck-importőr eddig a megbízás „számla/POD cím”
  mezőjét — ami e-mail-cím — írta postázási címnek; mostantól a sablon
  címét, a meglévő e-mailes/üres sorokat a migráció javítja (kézi postai
  címet nem bánt). A /posta csempén látszik, melyik kocsi vitte és honnan
  hová (csak városnév, `varosNev`).
- Kiegészítés 2: az indítási napló „friss” sorai 25 karakternél vágták a
  felrakó/lerakó címet, ebből hiányzónak tűnt a hétfői lerakók címe, pedig
  bent van (60 karakterig naplózva). `varosNev`: az irányítószám után
  vessző nélkül folytatódó utca levágva („3390 Füzesabony Kerecsendi út
  123” → „Füzesabony”); `UTCA_SZAVAK` ékezetes szót (út, útja) is felismer
  (\b helyett \p{L} lookaround). Teszt: teszt-erintes 67.
