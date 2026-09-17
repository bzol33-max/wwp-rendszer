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
