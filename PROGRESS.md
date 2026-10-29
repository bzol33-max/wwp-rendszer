# PROGRESS

## 2026-10-29 (2) — Redesign 0b: CLAUDE.md frissítés, rövidebb oldalsáv-feliratok
- A `CLAUDE.md` „Mobil UX” pontjában az elavult Geist/narancs sor átírva (asztali séma: Inter + #007AFF, ne legyen visszaállítva; a mobil `--mob-`/`--at-`/`--m-`/`--sa-`/`--sidebar-*` érintetlen) + új „Redesign” pont (modulonként, `docs/redesign/*.md`). `lib/nav.ts`: a megjelenített felirat „Jelenléti/üzenőfal” → „Jelenlét” (kulcs/útvonal és `lib/modules.ts` változatlan); `app-shell.tsx`: a telephely-sor 88 px-en soronként egy telephely, „Nyíregy.” rövidítve, teljes felsorolás a `title`-ben. 768 px alatt semmi nem változott.

## 2026-10-29 — Redesign 0. modul: vizuális alap + 88 px-es oldalsáv (Apple HIG stílus)

A `redesign/0-alap` branchen (nincs pusholva/deployolva), a `docs/redesign/0-alap.md` terv szerint.
**Csak megjelenés** — logika, adatmodell, API, útvonalak, jogosultságok, menüpontok nem változtak, a
mobil nézetek (`app/m`, `components/m`, `components/mobil`, `/attekintes`, `/erkezes`) érintetlenek.
- **Betű:** Geist → **Inter** (`latin` + `latin-ext` a magyar ékezetek miatt). A CSS-változó neve
  szándékosan maradt `--font-geist-sans`, így a `globals.css` kötése és minden hivatkozás változatlan.
- **Színek** (`:root`, shadcn token-nevek maradtak): háttér `#F5F5F7`, kártya `#FFFFFF`, szöveg
  `#1D1D1F`, másodlagos `#6E6E73`, elsődleges és ring `#007AFF`, hiba `#D70015`, figyelmeztetés
  `#B25000`, siker `#248A3D`, vonal `rgba(0,0,0,.08)`. A `.dark` blokk megmaradt (nem lett átszínezve).
  Új `.tnum` utility (`font-variant-numeric: tabular-nums`).
- **Kártya:** 16 px sarok + lágy árnyék keret helyett. A radius a **Card komponensben** van, nem a
  globális `--radius`-ban — az minden gombot/inputot is átméretezne, a modul-témák pedig felülírják.
- **Oldalsáv:** 224 → **88 px**, fehér, ikon felül (22 px) / felirat alatta (12 px, középre); aktív elem
  `rgba(0,122,255,.10)` háttérrel és `#007AFF` színnel, 12 px radius; felül `#1D1D1F` „W” négyzet
  (36×36, radius 10). A menüpontok listája/sorrendje/szűrése változatlan.
- **Teszt:** eslint a repó saját kódján 0 hiba (19 ismert, dokumentált warning); `tsc` az `app`/
  `components`/`lib`/`scripts` fán tiszta; `next build` **fordítása zöld** (az Inter woff2-k, a `.tnum`,
  a 16 px radius és az új tokenek ellenőrizve a generált CSS-ben).
- **Nyitott / kockázat** (részletesen: `docs/redesign/0-alap-eredmeny.md`): a `node_modules` telepítése
  hiányos ebben a környezetben (`word-extractor`, `@playwright/test` nincs meg), ezért a build
  típusellenőrzése nem fut végig — `rm -rf node_modules/word-extractor && npm install` kell hozzá.
  Továbbá: a CLAUDE.md audit-E2 bejegyzése még a narancs márkaszínt írja (frissíteni kell); a
  `.fuvarozas2`/`.szamlak`/`.jelenlet` modul-témák felülírják az új palettát; a mobil alsó tab-sáv
  (`--sidebar-*`) szándékosan maradt a régi barna; böngészős vizuális ellenőrzés még nem volt.

## 2026-10-23 (késő este) — Sofőr papír-fotó: külön app helyett a meglévő rendszerben, iPhone-on is

Budaházi Zoltán: „abban oldd meg, amit használunk, plusz az új sofőröknek lehet iPhone-ja lesz”.
- A WWP Sofőr Android app (`android-app/`, `nativ-szkenner.ts`, APK-letöltés, `@capacitor/core`) **kivéve**.
- A menet mindenkinek ugyanaz, böngészőben (iPhone + Android): telefon saját kamerája → automatikus
  lapkivágás + színes fehérítés → Beküldöm; igazítás csak opció. A bírálati javítások (memória, sebesség,
  sor, UX) megmaradtak.
- iPhone-biztosítás: a fotó dekódolása tartalékkal (`dekodol`: createImageBitmap opcióval → nélküle →
  `<img>`), a rejtett kamera-mező `sr-only` (nem `display:none`).
- Az OpenCV (lapkereső) a sofőr app megnyitása után 4 mp-cel előtöltődik — az első fotónál nem kell várni.
- **Teszt:** tsc, eslint, teljes `npm run teszt`, next build.

## 2026-10-23 (éjjel) — Sofőr app: Google szkenner (WWP Sofőr Android app) + automatikus böngészős szkennelés

Budaházi Zoltán: „nem jó … végezz kutatást, hogy a hasonló appok hogy oldják meg, az 5 legjobb megoldásból
rakd össze a mienket, mindent 5 hozzáértő nézzen át”; panaszok: homályos, bonyolult a sarokhúzás, nem néz ki
szkenneltnek, lassú. Kutatás: a fuvarozói appok (Samsara, Motive/Scanbot, Transflo, Genius Scan SDK) mind
natív szkenner-motort használnak; ingyenes és appon belüli: **Google ML Kit Document Scanner**.
- **`android-app/`** (új): Capacitor 8 héj, az éles `/erkezes`-t tölti (webről frissül), + ML Kit szkenner
  plugin. Aláírt APK: `public/letoltes/wwp-sofor.apk` (bejelentkezés mögött), a kulcs a repón KÍVÜL
  (`android-app/README.md`).
- **`nativ-szkenner.ts`**: az appban a „Papír” a Google szkennert nyitja (auto-fotó, kivágás, fehérítés,
  több oldal); az oldalak azonnal a feltöltési sorba mennek → nagy „Elküldve” képernyő. Modul-előtöltés
  indításkor; a szkennelés alatt kilőtt app eredménye visszaáll (`appRestoredResult`).
- **Böngészőben** (tartalék): telefon kamerája → automatikus lapkivágás (OpenCV, ha biztos) + új színes
  **fehérítés** (`feherites`: háttér-normalizálás, árnyék el, pecsét kék marad) → Beküldöm. A sarok-igazítás
  csak opció. A keretes app-kamera (`keretes-kamera.tsx`) megszűnt. Androidos böngészőben „Töltsd le a WWP
  Sofőr appot” sáv.
- **Teszt:** `teszt-lap-kereso` + fehérítés-eset (árnyékos papír ≥225, szöveg ≤90, kék pecsét kék), teljes
  `npm run teszt`, tsc, eslint (a módosított fájlokban 0 hiba), next build; APK aláírás ellenőrizve.
- **5 szakértői bírálat után javítva:** fehérítés gyorsítva (OpenCV `.data` egyszer), fekete pont ≤60 (halvány
  toll marad), egyszerre egy oldal készül + 25 mp időkorlát, a nagy kép memóriája azonnal felszabadul, éles
  kicsinyítés, JPEG 0,9; beküldési hiba nem akad be; a sor nem dugul el végleg elutasított oldaltól; „még vár”
  csak az adott fuvart számolja; szerver-figyelmeztetés sárgán; dupla koppintás-védelem; Android Vissza gomb;
  hálózat-állapot jogosultság, allowBackup ki (APK 1.1 / versionCode 2); az idempotencia-kulcs fuvarhoz kötve.

## 2026-10-23 (este 2) — Sofőr app: kamera kerettel

Budaházi Zoltán: „most egész jó, tedd vissza a keretet, amibe igazítsák be a papírt”.
- `keretes-kamera.tsx`: élő kép a hátsó kamerából, rajta A4-es álló keret (kívül sötétítve, zöld sarokjelek),
  „Igazítsd a papírt a keretbe”. A fotót `ImageCapture.takePhoto()` készíti (Android Chrome: teljes felbontás,
  fókusz, vaku), csak ha az nincs, akkor a videókocka; folyamatos fókusz kérve. Vaku-gomb, Galéria; ha az élő
  kamera nem indul, „Telefon kamerája” (a régi menet).
- Az igazító kiinduló sarkai = a keret a fotóra vetítve (cover-kivágás és 4:3 / 16:9 látószög-különbség
  figyelembevételével); ha az OpenCV biztos lapot talál, az lép a helyére. Utána ugyanúgy: Kész → kiegyenesítés.
- **Teszt:** teljes `npm run teszt`, tsc, eslint, next build; böngészős próba hamis kamerával (keret → fotó →
  sarkok a keretben/lapon → kiegyenesített lap).

## 2026-10-23 (este) — Sofőr app: papír-szkenner a telefonon (OpenCV + kézi sarok-igazítás), a szerver nem vág többé

Budaházi Zoltán: „nem jó, próbáltuk, keresd meg a legjobb módszert … appon belül kell, ingyenesen”; „mikor
lefotózzák egész jó, utána elromlik”. A sofőrök valódi fotóin (#1238, #1239, #1248) a szerveroldali vágó a lap
felét / a lapon belüli táblázatot / a mögötte lévő papírt vágta ki, a „tisztítás” kifakította a lapot.
- **Szerver:** `feltoltFuvarlevelFoto` nem szkennel/tisztít többé — a telefonról jött kép megy be (csak az
  EXIF-forgatás beégetve). Az irodai „újraszkennelés” (`ujraszkenneldFuvarlevelOldalt`) változatlan.
- **Telefon:** a CamScanner-szerű ingyenes menet: telefon saját kamerája → **Igazítás** képernyő: OpenCV.js
  (4.10, Apache-2.0, `public/vendor/opencv-4.10.0.js`, saját szerverről, 1 év cache) Canny-élkeresés →
  legnagyobb négyszög a javaslat (csak ha ≥ 40% — különben a teljes kép, mert a kisebb jellemzően a lapon belüli
  táblázat); a sofőr ujjal húzza a 4 sarkot, **nagyítóval**; „Teljes kép” gomb → Kész → perspektíva-
  kiegyenesítés színesen, tisztítás nélkül. Az oldal rákoppintva újraigazítható. OpenCV nélkül (térerő) a
  teljes kép megy. Fájlok: `lap-kereso.ts`, `igazito.tsx`, `fotozas.tsx`; a `szkennelElonezet` megszűnt.
- CSP (report-only): `'wasm-unsafe-eval'` a `script-src`-ben az OpenCV wasm-ja miatt; `/vendor/*` immutable cache.
- **Teszt:** új `teszt-lap-kereso` (igazi OpenCV.js Node-ban: egyenes/ferde lap, belső keretes lap, üres kép,
  kiegyenesítés aránya), teljes `npm run teszt`, tsc, eslint, next build; böngészős próba (fotó → javasolt sarkok →
  sarok húzása nagyítóval → kiegyenesített színes lap → beküldés). Valódi fotókon (Mac, OpenCV): a kilógó lapnál
  nincs javaslat (teljes kép), a kapujegynél a belső táblázatot találta — ezért a 40%-os küszöb és a kézi igazítás.

## 2026-10-23 — Sofőr app: új fotózás (a telefon saját kamerája) + a szkenner kivágja a sűrűn írt lapot is

Budaházi Zoltán: „a szkennelő nem jó az appban, jobb megoldás kell” (homályos, nem fotóz magától, nem vágja ki,
lassú/bonyolult) → választása: a telefon saját kamerája.
- A „Fotó” koppintás azonnal a telefon kamera-appját nyitja (éles, vaku, fókusz); az élő böngészős kamera, az
  automatikus fotó és a telefonos minőség-becslés kikerült (`fotozas.tsx` újraírva, `sofor-app-alap.ts` rövidült).
- Egy képernyő: nagyban a **kivágott, kiegyenesített lap** (új `szkennelElonezet` szerver-akció — ugyanaz a
  szkenner, mint a beküldéskor, nem ment semmit), alatta az oldalak, Újra / + Oldal / Beküldöm. Térerő nélkül az
  eredeti kép látszik, a beküldés a telefonos sorba megy, mint eddig.
- **Szkenner-javítás** (`doksi-kivagas-mag.ts`): a lapon lévő sűrű szöveg/CMR-rács a világos maszkot csíkokra
  bontotta → „nincs felismert lap”. Most a lap = minden, ami nem a kép széléről elérhető háttér (a szöveg
  „lyukai” kitöltődnek); a lap széléből a korábbinál kevesebbet vág le. Ez az irodai feltöltésre is érvényes.
- **Teszt:** teszt-fuvarlevel-minoseg új esete (sűrűn írt, 9°-ban ferde lap sötét és világos háttéren — a régi
  kóddal elbukik, az újjal átmegy), teljes `npm run teszt`, tsc, eslint, next build; böngészős próba
  (fotó → előnézet → + oldal → beküldés térerő nélkül → „Elmentve”).

## 2026-10-21 — Megbízások: életút-tábla (1-es terv a 10 TMS összevetéséből)

Terv: „Megbízások oldal – 5 terv” vászon, 1-es (Truckpedia-minta; a Qargo · AscendTMS · Truckpedia a top 3 az
5 szakértői nézőpont pontozásán). Budaházi Zoltán: „1”.
- Asztali Megbízások két sávja: **Bérfuvarok** 7 oszlop (Beérkezett · Úton · Lerakva·számlázásra ·
  Számlázva·postára · **Kiküldve · fizetésre vár** · **Lejárt** (a legrégebben lejárt elöl) · **Fizetve · <hónap>**);
  **Saját fuvarok** külön sávban (Saját fuvar rögzítő + elvinni valók · Előkészítés · Tervezett/úton ·
  **Lerakva · fotóra vár** (60 napon belül) · **Kész · utolsó 7 nap**). A kész fuvar így nem csak kereséssel látszik.
- Oszloponként legfeljebb 8 kártya; a többi a „+ további N” linkkel a pénz-szűrős listában (a tábla alatt).
- Adat: `getKetOszlop` új `archiv` mezője (keresés nélkül), `getPenzLista` új `fizetes` mezője (számlás bérfuvar:
  kiküldve / lejárt / fizetve a `szamla` táblából). Besorolás: `lib/fuvarozas2/eletut-tabla.ts`.
- Mobil (lg alatt) nézet változatlan. Mind/Bér/Saját kapcsoló: a nem kért sáv elrejtve.
- **Teszt:** új teszt-eletut-tabla 15/0, teszt-penz-lista, teszt-munkaasztal, teljes `npm run teszt`, tsc, eslint, next build.

## 2026-10-21 — Sofőr app: a 9-es (gyorsgombos) terv a sofőrök /erkezes nézetében

Terv: „Sofőr-app újratervezés” vászon, 6. kör (Budaházi Zoltán: „9-est vidd tovább, átlagfogyasztást láthatják”,
„heted: megbízások legyenek, amikre ha kattint látja a részleteket”, „fotózás … tökéletes legyen”, „építsd be”).
- Sofőr szerepkörnél az /erkezes kezdőlapja maga a sofőr app (`components/erkezes/sofor-app/`): **Ma** (az aktuális megbízás:
  soros megálló, idő, cég, cím, alatta minden megálló és adat, PDF, Gond van — km/útidő nincs, Budaházi Zoltán:
  „nem kell ez az info nekik”; 4 kerek gomb: Megérkeztem → Lepakoltam/Felpakoltam, Navi, Papír, Hívás),
  átlagfogyasztás-csík, teendők; **Megbízások** (Előttem: ma + 14 nap kártyákon, Kész: utolsó 10) → **részletek**
  (megállók címmel, idővel, kóddal, Navi + hívás megállónként, PDF, Gond van); **Profil** változatlan.
- **Papír vár** napokon át (`lib/fuvarozas/sofor-app.ts`): lezárt, fotó nélküli fuvarok — bér 14, saját 3 nap;
  a sofőr lerakás után továbbmegy, pihenőkor fotóz. „Nem kaptam” saját fuvarnál marad (localStorage, mint eddig).
- **Fotózás 4 lépés** (`fotozas.tsx`): élő kamera (getUserMedia) lap-kerettel, stabil + éles + egész lap ≈1 mp →
  magától fotóz; vaku, Galéria, tartalék: a telefon kamera-appja. Jó lett? (élesség teljes felbontású részleten,
  fény, egész lap) → Beküldés → Kész / következő. **Offline sor** (`papir-sor.ts`, IndexedDB): térerő nélkül a
  telefonon vár, induláskor / hálózat visszatérésekor / percenként feltölti. Vágás + kiegyenesítés a szerveren (mint eddig).
- **Átlagfogyasztás** (CAN, `jarmu_can_nap`): 7 nap az előzőhöz, ma, 14 nap, napi oszlopok — csak liter/km.
- `getSoforNap` új `elo` mezője (km, ETA, áll-e); `PullToRefresh` opcionális `onRefresh` (kliens-adatos nézethez).
- Színséma: saját (kék-világos, `tema.ts`) — szándékos kivétel a MOBIL_THEME alól (lásd AGENTS.md).
- Pénz, raklapcsere, tachó nincs. A régi `sofor-fuvar-nap.tsx` megmaradt (nem sofőr, de fuvarozas_sajat jogú fióknak).
- **Teszt:** teszt-sofor-app 33/0 (km, fogyasztás, dátum, élesség 12 MP-es szintetikus szállítólevélen), teljes
  `npm run teszt`, tsc, eslint, next build; böngészős előnézet (Playwright, hamis kamerával: auto-fotó, offline sor);
  éles adat: Gergő/Micó papír vár, kész, fogyasztás, élő km.

## 2026-10-21 — Ma: metróvonalas kocsikártya, aktuális + következő megbízás, fogyasztás

Terv: a „Ma oldal — 4 kocsi” vászon V11-es terve (Budaházi Zoltán: „09 vidd tovább, látnom kell az aktuális és
következő megbízásait is … mehet”, telefonos külön terv nem kell).
- A Ma lapon kocsinként egy teljes szélességű sor (a 2 oszlopos tükör-kártya helyett): fejléc (állapot, hely, ETA),
  **metróvonal** a mai megállókkal (teli = kész, gyűrű = most, üres = hátravan; tömör = rakott, pontozott = üres;
  a kocsi a következő megálló előtti szakaszon; a fuvar első megállóján a #hivatkozás), a nem tervezett állás a
  helyén („Ez a hely” rögzítés megmaradt).
- Alatta tachó-sor + **l/100 (CAN, 7 nap)** a flotta-átlaghoz mérve (±5 % felett jelölve), szerviz-km, napi km,
  papír; és két kártya: **Aktuális** (útvonal, megbízó, fel/le tény-terv, díj, kapcsolattartó telefonnal) és
  **Következő** (a mai sorrendben következő nyitott fuvar, különben a holnapi első; ha nincs: szabadság /
  folytatódik / „keress fuvart”).
- Felső sor: „Fogyasztás · 7 nap” flotta-átlag (Σ liter / Σ km).
- Fájlok: `lib/fuvarozas2/ma-metro-alap.ts` (tiszta), `components/fuvarozas2/ma-metro.tsx`, `ma-vaszon.ts`
  (fuvardíj a lekérdezésben, `fogyasztas`, `fuvarAdat`, `flottaL100`). A kocsi-lap továbbra is a régi `KocsiOszlop`-ot használja.
- **Teszt:** teszt-ma-metro 28/0, teljes `npm run teszt`, tsc, eslint, next build.

## 2026-10-17 — Ajánlat Q2: merre keress fuvart a kiürülő kocsiknak

Terv: `docs/ajanlat-q2-terv.md` (Budaházi Zoltán: „Q2”; az útdíj-kalkulátor marad).
- **Kocsikártyák** a felszabadulás sorrendjében (Hét-ütemterv utolsó fuvarja; hétvégén / ünnepen a következő munkanap
  06:00), kocsinként ≤ 3 irány: több pénz (díj − ráállás+rakott km költség, a célig tartó napokra), gyakori (≥ 2),
  hazafelé / Haza (Szakoly). Haza-nap: a hét utolsó munkanapja, ünnep és Jelenlét-távollét szerint.
- Forrás: saját bérfuvarok 365 nap (város-szintű geokódolás, gyorsítótárral), nyitott Timocom-ajánlatok.
- **keres** → `?kocsi=&irany=`: Timocom-keresés szövege, illő ajánlatok, kit hívjak, kitöltött kalkulátor.
- Fájlok: `lib/fuvarozas2/kereses-javaslat(-alap).ts`, `components/fuvarozas2/kereses-javaslat.tsx`, a timocom lap.
- **Teszt:** teszt-kereses-javaslat 43/0, teljes `npm run teszt`, tsc, eslint, next build; helyi dev-szerver;
  független QA (hétvége, redirect, időkorlát, címek, NaN, kulcsok, pénznem, 44 px — beépítve).

## 2026-10-17 — Hét B1: kocsiszín, nem-fuvar bejegyzés, szabadnap a Jelenlétből, heti/havi összefoglaló

Terv: `docs/het-b1-terv.md` (Budaházi Zoltán: „B1, B3 bevitelével”).
- **Kocsiszín** (törzsadat `szin`): sor-csík, betű-jelvény, fuvar-kártya csík; a típus BÉR / SAJÁT címkéből.
- **Bejegyzés** (`fuvar_bejegyzesek`, schema.sql): szerviz, gumis, mosás, műszaki, tachó, egyéb; tól–ig vagy egész
  nap, hely, megjegyzés, heti ismétlés. Felvitel: „+ Bejegyzés” vagy szabad cellára kattintás (B3 ablak), törlés ×
  (soft). Egész napos / 12 után tartó → a nap nem „szabad”, nincs „délután szabad”. Szombati bejegyzés oszlopot nyit.
- **Távollét**: `jelenletek.day_type` szabadság / beteg a kocsi sofőrjénél → csíkozott, lakatos cella; fuvar rajta → piros jelzés.
- **Oldalsáv**: heti / havi összefoglaló (`getKihasznaltsag`), „Nem fuvar” és „Távollét” lista; az ajánlatok alatta.
- Még nincs: a bejegyzés nem tolja az ETA-t; sorozatból egy alkalom törlése.
- **Teszt:** teszt-bejegyzes 59/0, teljes `npm run teszt` zöld, tsc, eslint (az új fájlok), next build; helyi
  dev-szerver: felvitel, ellenőrzés, törlés, szombati oszlop; független QA (4 kis javítás beépítve).

## 2026-10-17 — Hét Rács 2.0: idő · km · díj · tartalék · napi mérleg · hétvége-sáv

Terv: `docs/het-racs-2-terv.md` (Budaházi Zoltán: R1 kártya + R4 napi mérleg + R7 tartalék, „mehet”; hétvége/ünnep
keskeny sávval). Csak ingyenes források.
- **Becslő motor** `lib/fuvarozas2/heti-utemterv-alap.ts` (tiszta): fuvarlánc kocsinként a gördülő ablakra; EU 561
  (4,5 ó → 45 p, 9 ó → 11 ó pihenő, beállított keret), időablak-várakozás, tanult rakodási idő, kamionstop
  (`kamionstop.ts`, 190/2008. Korm. r. 2. §: hétvége, ünnep, nyári szombat 15:00), csúszás átvitele másnapra;
  fuvaronként várható fel/le idő, rakott/üres km, díj, Ft/km, legszűkebb tartalék; naponként végzés, km, bér
  (km-arányosan), vezetés, napi pihenő, kamionstop, „délután szabad”.
- **Betöltő** `lib/fuvarozas2/heti-utemterv.ts`: megállók és időablakok, HU-GO menetidő × kalibráció (6 mp keret,
  különben becslés), élő tachó a mai naphoz; a tanult rakodás/kalibráció kiemelve `lib/fuvarozas/menetido-tanulas.ts`-be
  (viselkedés-változás nélkül), kalibráció és külső hívás egy közös futásban (roham ellen).
- **Felület** `components/fuvarozas2/tervezes-het.tsx`: R1 kártya, tartalék-jelvény, napi mérleg, keskeny csíkos sáv a
  kihagyott hétvége/ünnep helyén („P ünnep · Szo · V”).
- Tesztek: teszt-het-utemterv 72, teszt-het-szunetsav 12, teszt-kamionstop 40, teszt-kulso-hivas 38.
- Független QA 6/10 → javítva: úton lévő fuvar rakott szakasza, kalibráció-roham, azonos HU-GO-hívások, beállított
  vezetési keret, koordináta nélküli ráállás (városon belül 20 p), tavaszi DST. Nyitott: a 2027-es áthelyezett
  pihenőnapok felvétele a Jelenlét-naptárba.

## 2026-10-17 — Hét nézet: gördülő ablak (egy munkanap vissza + előre)

Budaházi Zoltán: „szombaton nagyon ritkán megyünk, vasárnap soha, nem konkrét hét kell, elég egy nap vissza, a többi
előre”. A Hét (Tervezés) nem naptári hét: az előző munkanap + 5 munkanap előre; szombat és ünnep csak akkor oszlop, ha
aznap van fel- vagy lerakás, vasárnap soha. Lapozás 5 munkanappal (egy nap átfedés), „vissza mához”. A kocsi-sávok és a
visszfuvar-riasztás is ebből az ablakból számol (nem kell külön a jövő hetet betölteni). `tervezes-het-alap.ts`:
ablakKezdet, elozoMunkanap, munkanapLepes, tervAblak (Jelenlét-ünnepnaptár). Teszt: teszt-tervezes-het (+9).

## 2026-10-17 — Visszfuvar-riasztás (2. hullám #3)

A Kocsik → Ma lap tetején: „Üresen indul — keress rá fuvart”: a ma és a következő munkanap (hétvége és ünnep
átugorva, Jelenlét-naptár) ≥ 100 km-es üres útjai és hazaútjai kocsinként, a legjobban illő nyitott, napra szóló
Timocom-ajánlattal (többlet km, „kérj”) és legfeljebb 3 hívandó partnerrel; kattintásra a Tervezés hete, kijelölve a
rés. Pénteken/szombaton a jövő hetet is betölti; a hét-számítás 90 mp-ig közös tárban (csak Fuvarozás-joggal).
`tervezes-het-alap.ts`: kovetkezoMunkanap, riasztandoResek, riasztasOsszerak; teszt-tervezes-het (+11).
QA 7/10 GO; javítva: tár (#1), ünnepnap (#2), nap nélküli ajánlat (#4), kulcs (#5), mobil tördelés (#7).

## 2026-10-17 — Kihasználtság: saját fuvar belső díjjal (Budaházi Zoltán: „1”)

A saját (raklap-)fuvar eddig csak költség volt a kocsinál (km + napi fix), bevétel nélkül → Gergő október −80 e Ft/nap.
Most: belső díj = saját rakott km × a forintos bérfuvarok átlag Ft/rakott km-e (90 nap). A bevétel/nap és a fedezet
tartalmazza (Ma-sáv, Pénz → Kihasználtság, kocsi lapja; a súgóban bontva). `kihasznaltsag-alap.ts` `sajatBelsoDij`,
`KocsiIdoszak.sajatBevetelFt`. Teszt: teszt-1hullam-kihasznaltsag (+8).

## 2026-10-17 — Fuvarozás 2. kör: kocsi-központú felépítés (Kocsik · Megbízások · Pénz)

Terv és fájl-tulajdon: `docs/fuvarozas-2-kor-terv.md`. Tesztek a kód előtt (teszt-2kor-kocsi-sav 111, teszt-2kor-navigacio 23).

- **Fülek:** Kocsik (Ma · Hét · Ajánlat) · Megbízások · Pénz (Áttekintés · Kimutatás · Költségek); a régi címek változatlanok.
  Szerkezet: `lib/fuvarozas2/fulek-szerkezet.ts`.
- **Kocsi-sávok a Ma lap tetején** (`kocsi-sav-alap.ts` tiszta logika, `kocsi-sav.ts` betöltő, `kocsi-savok.tsx`):
  hol van, tachó, futó fuvar (kész/összes megálló, következő megálló terv/tény/eltérés, késés pirosan — ahol a kocsi
  most áll, az a futó fuvar), heti bevétel, üres km %, fedezet/nap, a következő szabad nap vagy rés → ajánlat.
  „Döntésre vár” sor (bejövő bérmegbízás + kocsira váró) csak Fuvarozás-joggal. A hét 2,5 mp korláttal.
- **Kocsi lapja** `/fuvarozas2/kocsi/[kod]`: fej, a mai kártya, a kocsi hete (rések, szabad napok), kihasználtság
  hét/hónap, CAN-telemetria 7 nap + szervizig km. Blokkonként hibatűrő.
- **Pénz → Áttekintés:** ide költöztek a bérfuvar-csempék és a kihasználtság-sáv (`getBerOsszesitok`); a Ma lap már
  nem számolja őket (gyorsabb).
- Független QA: 6/10 → a két blokkoló (#1 futó fuvar „most” elsőbbsége, #2 jogosultság) és két teljesítmény-pont
  (#3, #4) javítva. Nyitott apróság: sofőr „Megérkeztem” GPS nélkül nem „most” (ma-tukor), a kocsi-szín a statikus
  listából, aria-current a kocsi lapon.

## 2026-10-17 — Tervezés: egy napon belüli fuvarok földrajzi sorrendje

Hiba: Gergő 10.19. — két ugyanaznapi fuvar (Budapest → Szakoly #317, Nyírbátor → Budapest #323) a rögzítés
sorrendjében jelent meg, ezért 2 hamis rést (266 + 276 km üres) és rossz ajánlat-javaslatot adott.
Javítás: `tervezes-het-alap.ts` `napBelulFuzve` — egy napon belül mindig a kocsi aktuális helyéhez legközelebbi
felrakó jön (a Kihasználtság `lancKm` már így számolt). Teszt: teszt-tervezes-het (+5). Az integritás-teszt
elszámolás-beszúrásai upsertre váltak (a 043-as trigger miatt; az app kódja már eddig is `on conflict`-tal ír).

## 2026-10-16 — Fuvarozás 1. hullám: rendszer-javítások, kihasználtság, „Megnyertük → megbízás”, takarítás

Terv és fájl-tulajdon: `docs/fuvarozas-1-hullam-terv.md`. Tesztek a kód előtt (teszt-1hullam-rendszer/kihasznaltsag/ajanlat: 47+42+41).

- **Rendszer:** `043_elszamolas_potlas.sql` — hiányzó `fuvar_elszamolas` sorok pótlása + trigger (postázási cím NEM
  másolódik, az a postázáskor kerül be); `rendszer_eletjel` — a teljesítés-figyelő minden kör végén életjelet ír, a
  GPS-állapot ebből dönt (hétvégén, üres napon nincs hamis „figyelj”); csak az utolsó 2 nap aktív megállói számítanak.
  Távozás-figyelés a lezárás után még 24 órán át. `migrate.mjs`: SQL-migrációnként `lock_timeout = 30s`.
- **Kihasználtság-sáv a Ma lapon:** kocsinként hét|hónap — rakott munkanap, km, bevétel, becsült fedezet/munkanap.
  Saját 10 perces tár, 2,5 mp időkorlát (ha lassú, a sáv kimarad, a lap nem vár).
- **„Megnyertük → megbízás” (Timocom/Tervezés):** `044_ajanlat_eredmeny.sql`; a megnyert ajánlatból bérfuvar lesz a
  kiválasztott kocsira (díj előtöltve: rögzített ár → Timocom-ár → árlétra). Dupla kattintás / lassú mentés ellen
  5 perces foglalás, árva megbízás felismerése (megjegyzés „Timocom-ajánlat #id”), a kötés csak üres ajánlatra íródik.
  „Elvesztettük” gomb is.
- **Takarítás:** 9 nem használt API-útvonal, egyszeri scriptek, a telefonos vezetői nézet (/m fuvar, cég, rendszer,
  számla, papír → átirányítás /m-re), óránkénti menet-motor futás, tükörtábla-írások; `045_takaritas.sql` 11 táblát
  `regi_` előtagra nevez (nem töröl). Az /erkezes használata is naplózódik (a régi sofőrnézet kivezetésének méréséhez).
- Független QA: 8/10, GO — a kötelező (#1) és javasolt (#2, #3, #7, #8, #6) javítások benne. Nyitott utómunka:
  EUR tizedesvessző-értelmezés határesete (#4), múltbeli felrakási nap figyelmeztetés (#5), megnyert ajánlat árának
  átvétele az ár-memóriába (#9).

## 2026-10-16 — Ecofleet telemetria: élő tachó, CAN-üzemanyag, szerviz, webhook + 0. heti javítások

Döntés (5 szakértő, egyhangú): nincs új párhuzamos fuvarozási rész; a meglévő lapok bővülnek, az új adat egy
külön, csak hozzáadó rétegen jön be. Terv és fájl-tulajdon: `docs/ecofleet-telemetria-terv.md`.

- **Új adatréteg:** `lib/ecofleet/` (JSON-kliens: 20 s timeout, 1 újrapróbálás 5xx/hálózati hibára, a kulcs soha
  nem kerül hibaüzenetbe; `getLastDataCachelve` 30 s, in-flight dedup) és `lib/jarmu-telemetria/` (gyűjtő 2 percenként:
  tachó-pillanat; óránként: tegnapi + mai `getRawData` → napi CAN-liter/km/l100, tankolások, szervizig km, tengelyterhelés).
  Jármű-azonosítás csak `fuvar_jarmuvek.ecofleet_object_id` szerint. Ecofleet-hibánál semmi nem íródik 0-ként.
  Migráció: `041_jarmu_telemetria.sql` (jarmu_tacho_pillanat, jarmu_can_nap, ecofleet_webhook_esemeny).
- **Webhook:** `POST /api/ecofleet/webhook?token=…` (`ECOFLEET_WEBHOOK_TOKEN`, időállandó összevetés, 256 KB, idempotens
  mentés). Egyelőre csak ment; feldolgozás a következő körben.
- **Felület:** Ma kocsi-kártya „Tachó: ma még 2 ó 40 p · hét 31/56 ó” (+ régi „GPS-becslés” címkével), Tervezés → A hét
  chip, sofőr `/m` „Ma még vezethetsz: …”, Járművek: Szervizig / CAN fogyasztás (7 nap) / Tengely. Adat nélkül (JANI) rejtve.
- **0. heti javítások:** kalibráció Ecofleet-hiba / 0 minta esetén nem kerül 24 órára cache-be (15 perc tartalék);
  bérfuvar-szerkesztéskor a `jarmu_id` azonnal feloldódik (változatlan kocsi-szövegnél a meglévő marad; feloldhatatlan új
  szövegnél figyelmeztetés a felületen); egységes soft-delete (`torolt_at` mindig); `042_szamlazott_fuvar_vedelem.sql`:
  számlázott fuvar fizikailag nem törölhető (trigger); `getFleetLastPositions` 30 s cache.
- Ellenőrzés: typecheck, eslint, `npm run teszt` 58 szkript zöld (új: teszt-ecofleet-kliens 53, teszt-telemetria 83,
  teszt-integritas-0het 28 a helyi DB-n), `next build` rendben, 041/042 helyi DB-n kétszer futtatva (idempotens). Független QA: 8/10 GO.
- Nyitott (következő kör): tankolás-felismerés sűrű mintavételnél (halmozott emelkedés), tachó „friss” a kártya-állapottal is,
  webhook-események feldolgozása (érkezés a megállóra), DDD-fájlok (üzemben tartói kártyára vár), ETA-lánc átállítása a tachóra
  2 hét árnyék-üzem után.

## 2026-10-15 — Szabina Posta lapja: viszonylat és napok a kártyán

- A kártyán a megbízó és a számlaszám alatt: „Hajdúszoboszló → Dunakeszi”, a fuvar napjai
  (felrakás → lerakás), hivatkozás és kocsi; utána „Postázási cím: …”. A „Ma postázott” sorokban is
  a viszonylat és a nap — így a papír a fuvarhoz azonosítható (components/attekintes/posta-kartyak.tsx).

## 2026-10-14 — Postázási cím: szám nélküli utalás nem cím (#312 Gászler); részlet-lap a menüsor fölött

- **Gászler:** a megbízás-PDF-ből „Gászler Kft címére” került a postázási címbe, Szabina Posta lapja
  ezt mutatta. A SOR_SQL postázási cím-forrásai (`postaiCim`, lib/megbizasok/repo.ts) mostantól csak
  számot tartalmazó, nem e-mail szöveget fogadnak el; különben a partner törzse jön
  (Gászler: 2233 Ecser, Ady Ipartelep 1328/4).
- **Részlet-lap:** keskeny ablakban az alsó menüsor (z-40) eltakarta a lap alját („Fuvar törlése”) —
  a lap z-50 és safe-area alsó helyet kapott.
- Törölve kérésre: #321 SFL AirCargo (261014_026567).

## 2026-10-14 — #312 Gászler „eltűnt”: az Újraolvasás törölte; védelem + Drive-kapcsolat visszaállítása

- **Mi történt:** 13:21-kor a #312-n (teljesítve, számla WLLWR-2026-359, 2 fuvarlevél-fotó) kétszer
  lefutott az „Újraolvasás”: a sor törölt lett, a Drive-irat felszabadult; új sor nem jött létre.
  A következő Drive-kör új, üres sorként húzhatta volna be ugyanazt a PDF-et.
- **Javítás:** az újraolvasás nem engedélyezett számlázott vagy elindult (bármely megállón GPS /
  sofőr-jelzés, vagy állapot a tervezett után) fuvarnál — érthető hibaüzenet, a sor marad.
  A törölt fuvar „Visszaállítás”-a a Drive-irat kapcsolatát is visszaadja (a megjegyzésben
  őrzött eredeti URL-ből), ha közben más élő sor nem fogja; a megjegyzésből a jel lekerül.
- Ellenőrzés: typecheck, eslint, teszt-lánc zöld, build rendben.

## 2026-10-14 — Tervezés hét: egy fuvar se essen ki csendben

- A #311 (Gergő) a 13:05-ös javítás után is kérdéses. A GPS-figyelés naplója szerint a „Kocsi”
  szövege Gergőre oldódik, így a pontos ok adatbázis nélkül nem dönthető el.
- A hét most kiírja (piros sáv), ha egy fuvar egyik kocsi-sorba és a „Kocsira vár” sorba sem került,
  az okkal: nem aktív kocsi-kód / kocsi nélkül (fel nem ismerhető szöveg) / nincs állapota.
- A kocsi-feloldás a hétben és a háttér-szinkronban `resolveJarmu` után `findJarmuInSzoveg`-gel is
  próbál (csak rendszámos „Kocsi” szöveg, pl. „AOPU-427/AOTY-474”).

## 2026-10-14 — #311 (Gergő, Budapest → Balkány) hiányzott a Tervezés hetéről

- **Ok:** a heti tábla a kocsit a `jarmu_id`-ből veszi; ez a fuvaron üres volt. A kocsira adás
  (`kocsiraAdom`, `setFuvarJarmu`) a `jarmu_id`-t null-ra írta és a háttér-szinkronra bízta, a szinkron
  pedig az első RENDSZÁMMAL kereste a `fuvar_jarmuvek.kod`-ot — ha a törzsadat rendszáma más
  írásmódú (vagy nincs, mint a JANI-nál), sosem töltődött ki. Kocsi nélkül a fuvar a „Kocsira vár”
  sorba ment, onnan pedig a már lerakott (tegnapi) fuvar kiesik.
- **Javítás:** a két kocsira adó akció rögtön beírja a `jarmu_id`-t; a szinkron a kocsi kódjával
  keres (`jarmu.kod`); a Tervezés hete a „Kocsi” szövegből oldja fel a kocsit (mint a Ma és a
  sofőr-app), a `jarmu_id` csak tartalék. A lemaradt sorokat (14 nap) az óránkénti kör pótolja.
- Ellenőrzés: typecheck, eslint, teszt-lánc zöld, build rendben.

## 2026-10-14 — Tervezés · A hét: aktualitás és kezelhetőbb ajánlatok

Aktualitás-átnézés (kód alapján): a hét a tervezett dátumokból számolt, a múlt napok réseit is
számolta és a fejlécben összeadta, a kész / úton lévő fuvar nem látszott másnak, csak a mai hét
volt elérhető (pénteken a jövő hét nem), nem írta ki, mikor frissült, a koordináta nélküli fuvarok
körül csendben elmaradt a rés, a Timocom-ajánlatoknak nem látszott a koruk, és a limit (30, minden
állapot) kiszoríthatta a nyitottakat.
- `hetiReszek(..., ma)`: ma előtt nincs rés és nincs „szabad”; a fejléc „(mától)”.
- Kártya: kész ✓ halványítva, úton pötty (`fuvarJel`). Hét-lapozás (`?het=`, `hetEltolva`).
- „frissítve HH:MM · 5 percenként magától” (AutoFrissites intervallum-felirattal).
- Sáv: „N fuvar helye nem ismert — körülöttük a rés nem számolható”, linkkel a megbízásra.
- Ajánlatok: kor („3 órája”), 24 óra után „régi” (összecsukva), dátum nélküli jelölve; csak
  nyitott és kiment ajánlat jön (`getTimocomAjanlatok(40, [...])`); „Ajánlatot adtam / Elvetem /
  Mégis nyitott” gombok a listán és a rés táblában (`AjanlatGombok`); „Kiment ajánlataink” külön.
- Teszt: teszt-tervezes-het 52 ok; lánc 2 215 zöld; typecheck, lint, build rendben.

## 2026-10-14 — Megbízások: egy asztali nézet (Munkafolyamat), a pénz-szűrők beépítve

Budaházi Zoltán döntése: a Pénz / Munkafolyamat kapcsolóból csak a Munkafolyamat (szakaszok) marad.
- A kapcsoló és a külön pénz-nézet megszűnt. A szakasz-oszlopok fölött a pénz-sáv (`PenzSav`):
  az öt csempe (Számlázatlan, Papír hiányzik, Kintlévőség, Lejárt, Befolyt) és a szűrők
  („Minden nyitott” az alap, + Teendő · Számlázatlan · Papír · Kiküldve · Lejárt · Fizetve · Mind).
- Szűrővel az oszlopok csak a találatokat mutatják; a postázott / lezárt találatok (egyik nyitott
  oszlopban sincsenek) alul táblában (`PenzTabla`: papír, számla, esedékes, fizetve, Papír-gomb,
  Számlázási segéd). A Ma oldal `?penz=papir` / `?penz=szamlazatlan` linkjei így szűrnek.
- A kártyán a legsürgősebb pénz-jel (`penzJel`: lejárt > papír hiányzik > számlázatlan), teszttel.
- „+ Új bérfuvar / + Új saját fuvar” csak szerkesztési joggal; a Számlázási segéd az elszámolási
  jogot kapja (eddig fixen igaz volt, a szerver amúgy is ellenőrizte).
- Ellenőrzés: typecheck, eslint (érintett fájlok), teszt-lánc 2 207 ellenőrzés zöld, build rendben.

## 2026-10-12 — Fuvarozás rendrakás: duplikált és fölösleges lapok, halott kód ki

Budaházi Zoltán döntései (kérdés-válasz alapján): a Ma fülből csak a megállók és csempék nézete
(a korábbi „Részletek”) kell; az Elszámolás lap nem kell; az Eredmény két lapja egyelőre marad; a
kocsira váró fuvarok a Tervezés → A hét alá.

- **Megszűnt lapok** (átirányítással, next.config.ts): Ma → Most (élő térkép), Diszpécser (benne a
  Menetterv-panel), GPS → `/fuvarozas2`; Elszámolás → `/fuvarozas2/megbizasok`; a régi
  `/tervezes?menetnap=` → `/fuvarozas2`. A Ma lap: `MaVaszonNezet`, saját percenkénti frissítővel.
- **Törölt kód** (~6 100 sor): ma-elo(-terkep, -szinek), ma-utvonal(-alap), diszpecser(-terkep, -alap),
  menetterv.tsx, lib/menet/akciok.ts, gps-vaszon, elszamolas(-vaszon), het-racs, a ma-het heti rácsa,
  a régi idővonal (components/fuvarozas/idovonal.tsx), regi-terv-het + lib/fuvarozas2/tervezes.ts,
  a kalkulator lap, `getKovetkezoNapokElonezet`, `AllapotBadge`, az optimalizálás/elfogadás/elutasítás
  szerver-akciók. A `getMaVaszon` már nem számolja a heti rácsot és az élő nézetet (kevesebb lekérdezés
  és HU-GO útvonalhívás minden frissítéskor). `jarmuNev` → lib/fuvarozas2/ma-het.ts.
- **Új:** Tervezés → A hét alján „Kocsira vár” sor (`kiosztatlanCellak`, tervezes-het-alap.ts, teszt) —
  a holnaputáni kocsi nélküli fuvar is látszik (a 10-12-i nyitott pont lezárva).
- **Marad, felület nélkül:** a menet-motor (lib/menet: generálás, bővítés kocsi-hozzárendeléskor,
  óránkénti kör, optimalizáló-javaslat); a sofőr-app a jóváhagyott menetet, ennek híján a közös napi
  szabályt követi. Kézi jóváhagyás / átrendezés / javaslat-elfogadás most nincs.
- Ellenőrzés: typecheck, eslint (a Fuvarozás fájljai tiszták; a 19 meglévő react-hooks hiba más
  modulokban), `npm run teszt` 50 szkript / 2 203 ellenőrzés zöld, `next build` rendben.

## 2026-10-12 — Ma térkép: útvonal az úthálózaton

- A megtett út (3 km-nél hosszabb szakaszok) és a hátralévő terv a HU-GO útvonaltervező J5
  geometriáját követi (`lib/fuvarozas2/ma-utvonal(-alap).ts`, teszt: `scripts/teszt-ma-utvonal.ts`),
  gyorsítótárazva; 6 mp-en belüli válasz nélkül egyenes marad. A további hátralévő megállók pöttyel.
  Élőben ellenőrizve (Micó M3/M1 mentén, Gergő Hajdúszoboszló → Dunakeszi → Tata → Tompaládony).

## 2026-10-12 — Gergő menete + a Fuvarozás navigáció rendbetétele

- **Hiba (Gergő, sofőr-app rossz sorrend):** a reggel kiosztott Gászler-fuvar (Hajdúszoboszló →
  Dunakeszi) nem került be a már jóváhagyott, elkezdett menetbe (az első feladat lezárt → se
  javaslat-frissítés, se visszavonás). Javítás: `bovitJovahagyottMenetet` (lib/menet/muveletek.ts)
  + `bovitettSorrend` (menet-alap, teszt): a lezárt előtag marad, a jóváhagyott sorrend marad, az új
  fuvar a napi szabály szerinti helyére. Hívja: kocsi-hozzárendelés után azonnal, az óránkénti kör,
  és a Menetterv „Új fuvarok be” gombja. Napló: 'bovites'.
- Gergő mai menete élesben rendbe téve (v6, optimalizáló javaslat elfogadva): Szakoly → Nádudvar ✓,
  Hajdúszoboszló → Dunakeszi (Gászler), Dunakeszi → Tata, Tata → Tompaládony.
  A napi szabály a Gászlert Tata mögé tette (azonos terv-idő, id-sorrend) — a GPS-tény
  (Hajdúszoboszlón áll) még nem érkezett be; ezt az optimalizáló helyesen rendezte.
- **Navigáció** (components/fuvarozas2/fulek.tsx): Ma → Most · Diszpécser · GPS; Tervezés → A hét ·
  Ajánlat; Megbízások → Lista · Levelek · Partnerek; Eredmény változatlan. A Menetterv a Diszpécserben
  (a Diszpécser napjára), a Kalkulátor az Ajánlat (Timocom) lapon kézi módban is. Levéve (kód
  megvan): Tervezés „A hét minden kocsija”, GPS régi idővonal, Ma „Részletek” heti rácsa.
  Átirányítás: /kalkulator → /timocom, /tervezes?menetnap= → /diszpecser?nap=. Az Elszámolás rejtett
  lap marad (e-mail piszkozat), a rá mutató linkek a pénz-nézetre mennek.
- Nyitott: holnaputáni kocsi nélküli fuvar egyik új nézetben sem látszik (a régi hét mutatta).

## 2026-10-11 — Tervezés hét: a rések végre megjelennek

- Hiba: „egyik résbe sem illik” minden Timocom-ajánlatra (pl. Gergő H: Nádudvar → Tata üres út).
  Ok: a `fuvar_megallok.lat/lon` oszlopot semmi nem tölti ki, így a hét-nézet koordináta nélkül
  egyetlen rést sem talált. Javítás (`lib/fuvarozas2/tervezes-het.ts`): a hét és az előző 2 hét
  fuvarjainak hiányzó pontjai a címből geokódolva (gyorsítótár, max. 40 cím, a legfrissebbek elöl).
  Lejárt (ma előtti felrakású) Timocom-ajánlat nem kerül a hétre.
- Élőben ellenőrizve: 4 rés; Nádudvar → Budapest (+5 km) és Hajdúszoboszló → Fót (+45 km)
  illik Gergő Nádudvar → Tata résébe, létrával és alsó határral.
- Ugyanez a hiányzó lat/lon érinti a `tervezo.ts` (döntés-panel hete) és a `menet` becsléseit — 1. hullám.

## 2026-10-11 — 0. hullám: hibás számok javítása (szakértői átvilágítás után)

Alap: 14 szakértői jelentés (claude.ai projekt-doc `claude/fuvarozas-ceo-egyszerusitesi-terv.md`).
Tulajdonosi döntések: árlétra a teljes önköltségre +10/20/30%, visszfuvarnál alsó határ is;
kerekítés 1 000 Ft / 10 EUR felfelé, MNB; papír: csak figyelmeztet, nem tilt; optimalizáló: előbb mérés.

- **JANI (GPS nélküli kocsi)** benne van a Tervezésben, a Ma oldalon és a mobil vezetői nézetben
  (`ecofleet_object_id is not null` → `j.aktiv`: tervezes-het.ts, tervezo.ts, ma.ts; ma-vaszon.ts
  úton/ütközés minden kocsiból). A régi `tervezes.ts` és az Élő GPS lap szándékosan változatlan.
- **Egy árlétra** `lib/fuvarozas2/ar-letra.ts` + `components/fuvarozas2/ar-letra.tsx`: önköltség,
  +10/+20/+30% Ft és EUR. Megszűnt: `celar()` 8%, 500/600/700 Ft/km sávok, ×1,15. Kalkulátor
  minősítés: 10% alatt határeset (a % mostantól az önköltségre vetítve). Hét-nézet: fő ár a teljes
  önköltség létrája („kérj” = +20%), alatta szürkén „alsó határ visszfuvarnál” = többlet +10%.
- **EUR-díj** a Tervezésben Ft-ra váltva (MNB, `kalkulacio-tar.ts` `dijFtban`, VERZIO=2 → a tárolt
  kalkulációk egyszer újraszámolódnak); árfolyam nélkül „EUR, árfolyam nélkül”, nem 0.
- **Eredmény/Kimutatás**: átváltatlan EUR-bevétel és kézi költség jelezve; nem ad hamis
  „ingyen dolgozunk” jelzést.
- **Ma oldal**: egy frissítő (`useAutoFrissites`), rejtett fülön nem frissít; a régi vászon nem indít sajátot.
- **Timocom ár-parser**: „1,250 EUR” = 1 250; „900 eur”, „1.250,- EUR”; pénznem nélkül „(pénznem?)”.
- **Papír-jelzés**: „Papír megjött ✓” / visszavonás (fuvarozás vagy elszámolás jog), mobil Posta,
  Pénz-nézet, részlet. A postázás nem állít papírt (megerősítést kér), a fotó nem számít papírnak,
  számlázáskor figyelmeztet, nem tilt. `db/schema.sql` induláskori papír-backfill törölve;
  `040_papir_jelzes_trigger.sql`: az állapot-trigger nem fut papír-írásra (javítja, hogy a papír
  visszaléptette a kézzel számlázhatóvá tett fuvart). Régi fuvarokon a korábbi backfill papír-értéke marad.
- **Használati napló** (`039_oldal_megnyitas.sql`, `components/oldal-naplo.tsx`, `/api/oldal-naplo`):
  /fuvarozas2 és /m megnyitások, 30 mp dedup, 60 nap után törlés; Rendszer lapon adminnak „Használat (14 nap)”.
  2 hét adat után döntünk a Diszpécser / régi rétegek törléséről.
- Ellenőrzés: `npm run teszt` (57 szkript) zöld, tsc, eslint, build zöld; független átnézés valós
  Postgres 16-on (039/040 idempotens, trigger-viselkedés előtte/utána) — MEHET.
- Következő: 1. hullám (kocsi szabad pontja, ajánlat → előmegbízás → párosítás, duplikátum-őr, foglalási zár).

## 2026-10-11 — Eredmény, Tervezés, Megbízások az új terv szerint (3–5. lépés)

- **Eredmény** (`/fuvarozas2/eredmeny`, az Eredmény fül első alfüle „Áttekintés”): három kérdés
  (kerestünk-e a bérfuvaron · kinek dolgozunk ingyen · mennyibe kerül a saját áru fuvarja),
  kocsinként vízesés (bevétel − üzemanyag − útdíj − napi fix − üres út/állás = fedezet),
  havi fedezet 4 hónapra kocsinként, megbízók fedezet szerint (rendszeres megbízó 21+ nap
  csend jelzéssel). Új számítási szabály nincs: a fedezet a Kimutatás „Eredmény” oszlopa
  (`koltsegIdoszakra`), a vízesés csak felbontja. Lezárt hónap 6 órára gyorsítótárazva.
  `lib/fuvarozas2/eredmeny(-alap).ts`, teszt: `scripts/teszt-eredmeny.ts` (17).
- **Tervezés** (`/fuvarozas2/tervezes` teteje): a hét (H–Szo) kocsinként, a rések (≥100 km
  üres út két fuvar közt vagy hazafelé, légvonal × 1,3) kiemelve, szabad napok; jobbra a nyitott
  Timocom-ajánlatok „illik: X rés · +Ft” jelöléssel; a kijelölt résnél ajánlatonként +km, +idő,
  többlet, mennyit kérj (min. = többlet + 8%, ár-memória: hasonló korábbi fuvarok Ft/km),
  „Kiket hívj” (felrakó ≤50 km, ≥2 korábbi fuvar), Kalkulátor előtöltve. A régi döntés-panel,
  menetterv és heti tábla változatlanul alatta. `lib/fuvarozas2/tervezes-het(-alap).ts`,
  teszt: `scripts/teszt-tervezes-het.ts` (27). Koordináta nélküli lerakó után nem becsül rést.
- **Megbízások**: asztali alapnézet a „Pénz”: csempék (számlázatlan, papír hiányzik,
  kintlévőség 0–30/31–60/60+, lejárt, befolyt a hónapban), szűrők (Teendő, Számlázatlan,
  Papír, Kiküldve, Lejárt, Fizetve, Mind, saját áru is), soronként papír → számla → esedékes →
  fizetve (Számlázz.hu `szamla` tábla), Számlázok gomb / Fotó feltöltése. A szakasz-oszlopos
  munkaasztal a „Munkafolyamat (szakaszok)” gombbal (`?nezet=asztal`), keresés / új fuvar /
  elvinni-naptár automatikusan oda visz. Mobil nézet változatlan.
  `lib/fuvarozas2/penz-lista(-alap).ts`, teszt: `scripts/teszt-penz-lista.ts` (16).
- Ellenőrzés: tsc, teljes teszt, build; böngészőben adminnal és elszámolás-jogúval.
  A 20 eslint-hiba régebbi, nem érintett fájlokban van (változatlan).

## 2026-10-11 — Ma oldal: élő nézet (2. lépés)

- `/fuvarozas2` új teteje (`components/fuvarozas2/ma-elo.tsx`): teendő-sáv (max. 3 eltérés),
  élő térkép (kocsi iránynyíllal + sebesség, mai nyomvonal folytonos, hátralévő megállók
  szaggatott, következő cél jelölve), kocsinként nagy MEGY/ÁLL/NINCS JEL + szám, hely,
  következő megálló ~ETA (az ETA-láncból, ha ugyanarra a célra szól), vezetési idő, szünetig,
  napi km; alul mai idősáv (vezetés/rakodás/állás, tervezett megállók, „most” vonal).
- Percenként frissül magától (router.refresh). GPS nélkül is renderel („nincs GPS”).
- A régi Ma-vászon (megállók, heti rács, csempék) összecsukva a „Részletek” alatt — nem
  veszett el funkció.
- Logika: `lib/fuvarozas2/ma-elo.ts` (tiszta), `scripts/teszt-ma-elo.ts` (27 eset).
  `eloPozicio.irany` új mező (Ecofleet direction).
- Következő: Eredmény, Tervezés, Megbízások.

## 2026-10-11 — 4 fül a 11 helyett (1. lépés)

- `components/fuvarozas2/fulek.tsx`: fő fülek Ma · Tervezés · Megbízások · Eredmény
  + fogaskerék (Rendszer); alattuk az alfülek: Ma (Ma, Diszpécser, Élő GPS),
  Tervezés (A hét, Timocom, Kalkulátor, Levelek), Eredmény (Kimutatás, Költségek).
- Minden oldal a régi címén maradt (nincs átirányítás, a Timocom-gomb linkje is él);
  a jogosultság alfülenként a régi (az elszámolás-hatókör ugyanazt látja, mint eddig).
- Ellenőrzés: böngészőben adminnal és elszámolás-jogú felhasználóval minden oldalon
  a helyes fő- és alfül aktív; teljes tesztsor, tsc, lint, build zöld.
- Következő lépések: Ma oldal az új terv szerint, Eredmény, Tervezés (a hét).

## 2026-10-11 — Számlázási segéd („Számlázok” gomb)

- Hol: a Megbízások oldal „Számlázásra” oszlopában a kártya alatt (2026-10-11 javítás:
  élesben ott nem látszott), a megbízás részletében (Elszámolás kártya, bérfuvar, teljesítve/számlázható,
  még nincs számlaszám) és az Elszámolás „Számlázni” soraiban.
- Mit mutat: a számla mezőit a számla sorrendjében, mindegyik mellett másolás
  ikonnal — vevő (név, irsz, település, cím, adószám), fizetési mód, rendelésszám,
  teljesítés / kiállítás / határidő, tétel („Közúti árufuvarozás Felrakó-Lerakó”,
  több megállónál 2. sor), egységár, pénznem (EUR-nál MNB-árfolyam tipp), e-mail.
  A minta 10 valódi kimenő számla (WLLWR-2026-284 … 348).
- Források: vevő → a partner legutóbbi számlája (`szamla.raw_xml`), hiányában a
  partner-törzs; rendelésszám → a megbízás (partnernél kért szám: Reise-ID /
  pozíciószám / hivatkozás), végül a megbízó levelének tárgya (`fuvar_level`);
  határidő → partner-törzs, megbízás, legutóbbi számla, 30 nap.
- Ellenőrzés kiállítás előtt: CMR-fotó, díj, teljesítés ≤ kiállítás, nincs még
  számla, vevő adószáma, kötelező rendelésszám (Duvenbeck-sablon vagy a legutóbbi
  számlán is volt). A blokkoló tételig a „Kiállítva” gomb tiltott; hiányzó
  rendelésszámnál link a megbízás szerkesztésére.
- Kiállítás után a számlaszám a meglévő `setSzamlaSzam`-mal mentődik (adatmodell
  nem változott, nincs migráció).
- A felugró ablak a `fuvarozas2` témaosztályt kapja (portálban különben a jelzőszínek hiányoztak).
- Fájlok: `lib/fuvarozas2/szamlazasi-seged-alap.ts` (tiszta), `lib/fuvarozas2/szamlazasi-seged.ts`,
  `components/fuvarozas2/szamlazasi-seged.tsx`; bekötve: megbizas-reszlet.tsx, elszamolas-vaszon.tsx.
- Teszt: teszt-szamlazasi-seged (44); helyi böngészős próba: Reise-ID a megbízásból,
  levélből, hiányzó → tiltott gomb + link, másolás a vágólapra, számlaszám mentése.

## 2026-10-11 — Pontosabb élő ETA: szünet, napi keret, kapunyitás, mért rakodás + pontosság-napló

- Eddig az élő ETA-lánc (`lib/fuvarozas/actions.ts` lancoltEloBecsles) = HU-GO
  menetidő × tanult napszaki szorzó + fix 30/45 perc rakodás. Hiányzott: a
  kötelező 45 perces szünet 4,5 óra vezetés után, a 9 órás napi keret utáni
  11 órás pihenő, a várakozás a kapunyitásig, és a helyen MÉRT rakodási idő.
- Új: `lib/fuvarozas/eta-lanc.ts` (tiszta szabályok) — `vezetSzaballyal`,
  `megalloTavozas`, `soforAllapotSzakaszokbol` (a sofőr mai vezetése és az utolsó
  ≥45 perces állás óta vezetett idő a GPS-szakaszokból), `tanultRakodas`
  (helyenkénti medián, min. 3 mérés, 120 nap; különben a beállított puffer).
- Pontosság mérése: `db/migrations/038_eta_naplo.sql` + `lib/fuvarozas/eta-naplo.ts`:
  a lánc becslése megállónként ≤10 percenként naplózva, a `gps_erkezes`-hez mérve
  sávonként P50/P80 hiba és eltolódás; az Élő GPS lap alján kiírva.
- Teszt: teszt-eta-lanc (31, a teszt-láncban); tsc, lint, build, teljes teszt
  zöld; a napló SQL-je helyi DB-n kipróbálva (dedup, hiba-számítás).
- Vezetési idő: továbbra is GPS-becslés. Pontos, élő adat csak tachográf-
  kapcsolatból jöhet (Ecofleet egység K-line/FMS) — rákérdezni az ML Global
  Systemsnél.

## 2026-10-11 — Menetterv: honnan indul a kocsi (GPS + tény)

- Hiba: Micó hétfői menete „üres pozicionálás BMW HU Plant Debrecen → Szakoly”-val
  kezdett (és „nem helyezhető el”), pedig a kocsi Szakolyban állt: az utolsó
  megbízás a BMW Debrecen volt (cs. 19:59), a hazaút nincs megbízásban.
- Javítás (`lib/menet/generalas.ts` indulasiHely):
  0. HOLNAPI menet: a kocsi mostani GPS-helye (Ecofleet getLastData), ha minden
     korábbi munka teljesült és a jel frissebb az utolsó lerakónál; 1 km-en belül
     a telephely-pont (`gpsIndulas`). A mai napra nem (a kocsi már úton lehet).
  1. Különben a ténylegesen legkésőbb teljesített lerakó (`tenyUtolsoLerako`),
     nem a terv szerinti nap/ablak; 2. ezután a régi út (előző menet, terv, telephely).
- Teszt: teszt-menetterv (+10).

## 2026-10-11 — Vasárnap pihenőnap; saját árunál a megbízó a Well-Worn Pallet

- Ma oldal: üres vasárnapon a „Most” oszlop és a kocsi „Ma” doboza „Vasárnap —
  pihenőnap” (nem „Nincs mai fuvar · keress fuvart”). `pihenoNapE` (ma-het.ts);
  a vasárnapi fuvar ugyanúgy látszik. A szombat változatlan.
- `megbizoMegjelenites` (fuvar-constants.ts): saját fuvarnál a megbízó mindig
  „Well-Worn Pallet”, más cég a sorban nyíl után („Well-Worn Pallet → Fabrika
  2000 Kft”). Bekötve: Ma (rács, kocsi-oszlop, eltérések), Tervezés kártyák,
  Megbízások címsor. Adatot nem ír át, csak megjelenítés.
- Kiegészítés: a Diszpécser és a Kimutatás (Költségek) saját fuvarjai is így mutatják
  a megbízót; a bérfuvar megjelenítése változatlan.
- Teszt: teszt-ma-het (+10).

## 2026-10-11 — Timocom → WWP böngésző-gomb (fuvarszervező pult, B út)

- Új lap: Fuvarozás · **Timocom** (`/fuvarozas2/timocom`). A „→ WWP” könyvjelző-gombot
  innen kell a Chrome könyvjelzősávjába húzni. A Timocom fuvarkeresőjében nyitott
  ajánlaton kattintva a gomb kiolvassa a részletpanelt (megbízó, TC ID, helyek
  fel/le jelöléssel, dátum/idősáv, kapcsolat, méret, áru, felépítmény, ár,
  fizetési határidő, megjegyzés), és új fülön ide nyit (`#d=` — az adat nem megy
  a szerver naplójába). Kézi beillesztés (A út) ugyanazzal a feldolgozóval.
- Rögzítés: `radar_kiiras` (forras = 'timocom', kulcs = Timocom ajánlat-ID; ugyanaz
  újra küldve frissül, az állapotot megtartja). `037_timocom_kiiras.sql`: reszletek,
  nyers_szoveg, url, rogzitette (additív).
- Kártya: figyelmeztetések (ADR, hulladék/engedély, hűtő, nem ponyvás felépítmény,
  >13,6 m, >24 t, több megálló, külföld, nincs ár), kattintható telefonszám,
  állapot (ajánlatot adtam / elvetem). Alatta a Kalkulátor a megállókkal kitöltve.
- A gomb a valódi Timocom-oldalon kipróbálva (2026-10-11): helyek, kapcsolat-rész
  kinyitása csak ha csukva van. A Timocom-oldal átalakítása eltörheti → beillesztés.
- Teszt: `scripts/teszt-timocom.ts` (45), helyi Postgres + Playwright végigjárás.

## 2026-10-11 — HU-GO „Díjtételek” export beolvasása

- A portál valódi exportját (ISO-8859-2, `;`, „Költség”, „Használat ideje”,
  „Viszonylati jegy státusz”) az import elutasította („nem találtam a fejlécsort”).
  Most: összeg = „Költség”, időpont = „Használat ideje” (elsőbb a vásárlás/
  érvényesség dátumánál), státusz-oszlop: sikertelen/törölt sor kihagyva és
  figyelmeztetésben jelezve (pótdíj-veszély).
- Hiba: az azonosító-keresés `\bid\b`-je a „Szakasz beküldésének időpontja”
  oszlopra illett (JS `\b` + „ő”), így az egy másodpercben beküldött tételek
  egymást ütötték ki (45 tétel veszett volna el). Most az „id” csak önálló szó,
  dátum/idő oszlop sosem azonosító.
- Valódi fájlon: 4 265 tétel, NMZ-492 2 303 945 Ft, AOPU-427 1 952 545 Ft; 1 sikertelen
  (AOPU-427, 09.24 12:35, M31U0K0M, 2 021 Ft).

## 2026-10-11 — Üzemanyag-tény: 0 literes és kiugró GPS-napok

- Ecofleet útvonaljelentés 09.01–10.04 alapján: AOPU-427 09.22-ig 0 litert mért,
  NMZ-492 napi l/100-a 5–93 között szórt. Egy GPS-nap csak akkor üzemanyag-mérés,
  ha liter > 0 és 10 ≤ l/100 ≤ 70 (`ervenyesUzemanyagMeres`, `kalkulator-alap.ts`).
- Költségek/kocsi: a nem mérő napok km × alap fogyasztás becsléssel számolnak
  (eddig 0 Ft); vegyes időszak címkéje becslés, a megjegyzés mutatja a GPS- és a
  becsült litert. Megbízás: hihetetlen napon becslés (`literFelosztas`).
- Kalkulátor 14 napos mért fogyasztása csak az érvényes kocsi-napokból.
- Tesztek: teszt-koltseg (+6), teszt-kalkulator (+6); a javítás nélkül 5 elbukik.
- Mért (érvényes napok): NMZ-492 ≈ 33 l/100, AOPU-427 ≈ 22 l/100 (csak 09.23-tól);
  a járművek saját fogyasztás-értéke a Járművek oldalon állítható — nem írtam át.

## 2026-10-10 — Költség/tény javítások: árfolyam, HU-GO import, tankolás-hamisítás, Kimutatás, Járművek

- **MNB-árfolyam:** egy nap akkor hiányzik, ha a várt közzétételi napjára (múlt
  hétköznap, vagy ma 12:00 után a mai, budapesti idő) nincs PONTOSAN arra a napra
  sor (eddig bármely 4 napon belüli sor elég volt, UTC-nappal). `pontos` csak az
  aznapi árfolyam; hétvége/ma dél előtt „előző közzétett nap”, egyébként
  „régebbi árfolyam” felirat (`arfolyam-alap.ts`).
- **HU-GO import:** XLSX kibontott méret a zip központi könyvtárából (≤ 40 MB),
  streamelő olvasó 50 000 soros korláttal (`koltseg-xlsx.ts`); CSV is 50 000 sor.
  Tranzakció-azonosító oszlopnál a kulcs csak az azonosító (`hugo:id:…`), a már
  importált (régi, összetett kulcsú) sorokat is felismeri; a „Sorszám” nem azonosító.
- **Tankolás:** sor csak a pontosan `opluszbenzinkut@gmail.com` feladótól (a
  továbbított/hasonmás levél osztályozva, nem ír); szigorúbb liter-minta;
  300–1200 Ft/l-en kívül a liter üres, `tankolas.figyelmeztetes` jelöli
  (`036_tankolas_figyelmeztetes.sql`); kézi rögzítésnél hibaüzenet.
  **Kézi teendő:** `docs/gmail-fuvar-figyelo.gs` frissült (pontos feladó +
  Authentication-Results ellenőrzés, `kutHitelesites`) — a script.google.com-on
  kézzel kell cserélni.
- **Kimutatás:** GPS-tény nélkül a fejléc km a fuvarlánc becslése („becslés”);
  a HU-GO-ból felosztott útdíj tény („felosztva”); a kézi költségsorok
  (`fuvar_megbizas_koltseg`, nem gépi) beszámítanak — azonos típusnál a kézi tény
  felülírja a számítottat (a kocsi összesítőjében is), a többi „Kézi egyéb”, a
  bevétel-pótdíj a bevételhez; az óránkénti mentés felülírt típushoz nem ír gépi
  sort. Eredmény-felirat: „Eredmény (bérfuvarok, saját fuvar költsége nélkül)”.
  Ft-oszlopok nem törnek; telefonon megbízás-kártyák, a kocsi-tábla első oszlopa tapad.
- **Költségek:** a Rögzítés gomb mindig aktív (hiányzó mezőre üzenet), kocsi-
  választó „kód · sofőr”, telefonon tankolás-kártyák.
- **Járművek:** új jármű alapfogyasztása a `fuvar_beallitas` értéke (szerveren
  is, ha üres), színe az első szabad; telefonon a Szerkesztés oszlop tapad.
- Teszt: `teszt-koltseg` (144), `teszt-level-osztalyozo` (40), `teszt-jarmu-torzs`
  (73), teljes `npm run teszt`, typecheck, eslint, next build, Playwright 1440/390.

## 2026-10-10 — Költségek és tények (5. fázis): tény/becslés, HU-GO, tankolás, MNB-árfolyam

Budaházi Zoltán: minden szám mellett látszódjon, tény-e vagy becslés, és a
saját fuvar „megtakarítása" NE adódjon hozzá a kocsi eredményéhez.

- **Séma** (`db/migrations/034_koltseg_teny.sql`, csak additív):
  `fuvar_megbizas_koltseg` + `forras` ('teny'/'becsles'), `menet_feladat_id`
  (FK nélkül — a menetterv párhuzamosan készül), `letrehozva_at`, `szamitott`,
  `mennyiseg`, `reszletek`; egyedi kulcs (megbizas_id, tipus, forras) a gépi
  sorokra. Új `tankolas` tábla (tranzakciószámra idempotens). `utdij_tranzakcio`
  + `tav_km`, `netto_ft`, `rendszam_nyers`.
- **Számítás** (tiszta: `lib/fuvarozas2/koltseg-szamitas.ts`; adat:
  `koltseg-adat.ts`): tény-km a megbízás első és utolsó megálló-ténye közti
  GPS-utakból; liter a napi GPS-liter km-arányos része × aznapi tankolás Ft/l
  (különben NAV − kedvezmény); útdíj a HU-GO tranzakciókból (időablak, vagy a
  nap felosztása), különben a tárolt kalkuláció; napi fix a nap fuvarjai közt;
  EUR a teljesítés napjának MNB-árfolyamán. Bérfuvar → eredmény; saját →
  belső költség (Ft/raklap); az „elkerült költség" csak tájékoztató. Kocsi
  eredménye = bérfuvar-eredmény − nem hozzárendelt költség.
- **Importok:** HU-GO CSV/XLSX feltöltés (fejlécnév szerinti oszlopok, magyar
  számalak, Windows-1250 CSV), Oplusz-kút levél → `tankolas` (új levélosztály:
  „Tankolás"), kézi tankolás. MNB SOAP (`lib/fuvarozas/arfolyam.ts`, az
  `arfolyam` táblába gyorsítótárazva, soha nem dob).
- **Felület:** új „Költségek" fül (HU-GO import, tankolások, beállítások);
  Kimutatás: tény/becslés jelek, bér eredmény és saját belső költség külön,
  megbízásonkénti rendezhető tábla, a használt EUR-árfolyam.
- **Óránkénti kör:** a modell-szinkron végén a 14 nap költségsorai a
  `fuvar_megbizas_koltseg`-be (`taroldMegbizasKoltsegeket`).
- **Kézi teendő:** a Gmail-figyelő (`docs/gmail-fuvar-figyelo.gs`) frissült —
  a kút értesítői címke nélkül is mennek; a script.google.com-on a tartalmat
  kézzel kell cserélni.
- Teszt: `scripts/teszt-koltseg.ts` (a `teszt` láncban), a levél-osztályozó
  teszt bővült.

## 2026-10-10 — Törzsadat (2. fázis): beállítások, telephelyek, pótkocsik, 4 kamionos flotta, /jarmuvek

- **Döntés (Zoltán):** a flotta 4 kamionos lesz — se darabszám, se rendszám ne
  legyen beégetve; JANI (DAF XG, rendszám/GPS nélkül) teljes értékű jármű.
  Alap fogyasztás 28 l/100 km, a mért Ecofleet-érték csak 300 mért km fölött
  írja felül. Útvonal marad HU-GO.
- **030_fuvar_beallitas.sql:** `fuvar_beallitas` (kulcs, ertek jsonb,
  ervenyes_tol, modositotta) — módosítás = új sor, az aktuális a legkésőbbi
  érvényes. `lib/beallitasok/fuvar.ts getFuvarBeallitasok()` (1 perc cache,
  hiba/hiányzó tábla esetén a kódbeli alapérték). Bekötve: kalkulátor (napi
  költség, fogyasztás, küszöb, vezetési keret), kalkuláció-ujjlenyomat
  (beállítás-változásra újraszámol), kimutatás, tervező, gázolaj
  (kedvezmény, tartalék), rakodási ráhagyás (GPS-idővonal).
- **031_torzsadat_jarmu_telephely.sql:** `telephely_pont` (a szakolyi parkoló
  'parkolo' pont, NEM új `sites` sor), `fuvar_potkocsik` (Schmitz Mega
  33/28 hely, 660/812 raklap), `fuvar_jarmuvek` + potkocsi_id, euro_osztaly,
  hugo_kategoria, ossztomeg_t, alap_telephely_pont_id, megjegyzes,
  sofor_becenev; `sofor_profil`, `jarmu_okmany`.
- **Járművek a DB-ből:** `lib/fuvarozas/jarmuvek-db.ts getJarmuvek()` (60 s
  cache, tartalék a régi konstans) — GPS, Ma, Tervezés, Áttekintés, sofőr-nap,
  irat-jog, teljesítés-figyelő, fogyasztás, saját fuvar űrlap. Irat-jog: a
  sofőr ↔ kocsi elsőként `sofor_id` szerint (szigorúbb, mint a névegyezés).
- **/jarmuvek:** járművek (4. kamion felvétele), pótkocsik, okmányok és
  sofőr-okmányok lejárat-jelzéssel (lejárt piros, 30 napon belül sárga).
- **Teszt:** új `scripts/teszt-jarmu-torzs.ts`, bővített `teszt-kalkulator`,
  a teljes `npm run teszt` lánc (a kocsihozAdom előzetes hibája kivételével),
  typecheck, eslint, next build; a migrációk valódi Postgres 16-on futtatva.

## 2026-10-02 — Téves „Postázva”: visszavonható, és számla előtt nem számít

- **Probléma:** a BHS Trans 330031897 (Budapest → Nyíregyháza) nem ment
  postára, mégsem volt a Posta-listán. 09-30-án a régi Posta-listán
  (akkor még a számlázatlanokat is mutatta) postázottnak jelölték; számla
  nélkül ez nem látszott. 10-01 13:16-kor megjött a számla, és a 002-es
  trigger (számla + 5 percnél régebbi postázás) egyből lezárta.
  A „Postázva” állapotból visszalépni sem lehetett.
- **Javítás:**
  - 17. él: postazva → szamlazva („Postázás visszavonása (nem ment el)”,
    csak ember, számlával) — gomb a megbízás részletén; a régi jelölőt és
    az elszámolás postazva_at-ját is törli.
  - `015_postazas_szamla_elott_torlodik.sql`: ha a számlaszám most érkezik
    és a „Postázva” már előtte ott állt, a jelölés törlődik (postára csak
    kiszámlázott fuvar megy) — a fuvar a postára várók közé kerül.
  - `migrate.mjs` csak-olvasó napló: az elmúlt 30 nap ilyen módon lezárt
    bér fuvarjai.
- **Teszt:** teszt-allapotgep 54/0, teszt-backfill-allapot 18/0, typecheck.

## 2026-10-01 — K+N-megbízás: a felrakó/lerakó címe a sablonból

- **Probléma:** a Kuehne + Nagel 36998-as megbízásán (Micó, BMW Leergut) a
  nyelvi modell a felrakó/lerakó helyére a rakodóhely cégét írta, cím
  nélkül („AWF KFT. UM_15705911”, „SZERIP ZRT.”). A GPS így a sárvári
  rakodást (14:01–15:21) „nem tervezett állásnak” mutatta, a felrakónál
  hamis „ETA 22:45” állt, és a pénteki debreceni lerakást sem ismerte volna fel.
- **Javítás:** új determinisztikus olvasó (`lib/fuvarozas/import/kuehne-nagel.ts`)
  a pdf-parse valódi tördelésére: megállónként cím (irsz, város, utca),
  nap, Hiv.Sz., fuvardíj, rendszámok. A K+N bekerült a `PARTNEREK` közé
  (ujjlenyomat: kuehne-nagel.com / „KUEHNE + NAGEL (AG & CO”, 60 nap).
- **Meglévő sorok:** a `megrendelokHelyesbitese` kör (egyszer soronként)
  most a városnév nélküli felrakót/lerakót is a sablon címére cseréli
  (`cimekHelyesbitese`); a megállókon csak a `cim_nyers` változik, a
  GPS-tény és a sofőr jelölése marad. Kézi javítást nem ír felül.
- **Teszt:** `scripts/teszt-import.mts` 123/0 (új minta:
  `scripts/teszt-minta/kuehne-nagel-megbizas.txt`, kitalált nevekkel),
  `teszt-sofor-adatok` 45/0, typecheck.

## 2026-10-01 — Posta-lista: a partner-törzs postacíme is

- **Probléma:** a régi Posta-lista (`/posta`, Áttekintés → Posta) a
  postacímet csak a beégetett partner-sablonokból és a megbízó korábbi
  fuvarjáról vette, a Partnerek fülön rögzített (vagy javaslatból átvett)
  címet nem — a Flexlognál így üres maradt volna.
- **Javítás:** `getMegbizoCime` a `fuvar_partnerek.postazasi_cim`-et is
  nézi (név-kulcs vagy névváltozat szerint).
- **Teszt:** typecheck.

## 2026-10-01 — Posta: a „Postázva” jelölés zölden marad egy percig, visszavonható

- **Probléma:** a Flexlog #286-ot véletlenül jelölték postázottnak, és a sor
  azonnal eltűnt — visszavonni nem lehetett. (Számla még nincs rajta, ezért
  az állapota nem változott, de a jelölés a számla megjöttekor azonnal
  lezárta volna.)
- **Módosítás (`components/posta/posta-lista.tsx`, a `/posta` és az
  Áttekintés → Posta):** a jelölés után a kártya zöld, „Postázva ✓ —
  visszavonás” gombbal, és csak 1 perc múlva tűnik el. Alul „Ma feladva (N)”
  lista (`getMaPostazottFuvarok`) visszavonás gombbal — így a #286 is
  visszaállítható.
- **Teszt:** typecheck, eslint.

## 2026-10-01 — Szabina: az Áttekintés → Posta fül is csak a kiszámlázottat mutatja

- **Probléma:** a #266/#267 után is látszottak a számlázatlanok — Szabina
  az Áttekintés mobil nézetét használja (Nyíregyháza · Posta · Fuvar), annak
  Posta füle (`/attekintes/posta`) ugyanazt a régi listát mutatta.
- **Javítás:** csak számlaszámos sor. Ezzel mindhárom mobil Posta-nézet
  (`/m/posta`, `/posta`, `/attekintes/posta`) ugyanazt a szabályt követi.
- **Teszt:** typecheck, eslint.

## 2026-10-01 — Szabina: a régi /posta oldal is csak a kiszámlázottat mutatja

- **Probléma:** a #266 után is látszottak a számlázatlanok. Ok: Szabina
  bejelentkezés után nem az új `/m/posta`-ra, hanem a régi `/posta` oldalra
  kerül (a kezdőlap a „posta” jog alapján oda irányít), ami a régi
  Számla/Posta listát (`getSzamlaPostaFuvarok`, fotóra váró és számlázható
  sorokkal) mutatta. A HTTP-napló szerint az új nézetet senki nem nyitotta.
- **Javítás:** a kezdőlap az elszámolás-jogú, modul nélküli fiókot az
  `/m/posta`-ra viszi; a `/posta` az ilyen fiókot oda irányítja, és
  mindenkinek csak a számlaszámos sorokat mutatja.
- **Teszt:** typecheck, eslint. Szabina fiókjával nem próbálva.

## 2026-10-01 — Szabina mobilja: csak a kiszámlázott fuvarok

- **Probléma (Budaházi Zoltán):** a szabály az, hogy Szabina mobilon csak a
  kiszámlázott fuvarokat lássa. A 2026-09-25-i kör viszont a Posta mellé
  egy „Számla” fület is adott neki a még ki nem számlázott (visszaért)
  fuvarokkal — ez nem volt kérve.
- **Javítás:** az irodai fülsor Posta · Profil; a `/m/szamla` csak teljes
  Fuvarozás-joggal nyílik, az irodai fiókot a Postára irányítja; a Posta
  csak számlaszámos fuvart mutat.
- **Teszt:** typecheck, eslint.

## 2026-10-01 — Partner-adat javaslatok: a megbízás fejléce is olvasva

- **Probléma:** a Flexlog postacíme a megbízás fejlécében áll, de nem
  szövegként (kép/grafika), ezért a pdf-parse alapú kiolvasás sosem látta;
  új partnernél a postázási cím üres maradt. A PDF a számlázási feltételeket
  is tartalmazza (szamlazas@ e-mail, 15 napos papír-határidő 50 € levonással,
  30 napos fizetés), ezek sem kerültek a partnerhez.
- **Módosítás:**
  - `partner-javaslat.ts` (óránként, a modell-szinkron körben): a hiányos
    partnerek legutóbbi megbízás-PDF-jét a modell PDF-ként (képpel együtt)
    kapja (`OPENROUTER_PDF_MODEL`, alap: gemini-2.5-flash), iratonként
    egyszer (`fuvar_partner_kiolvasas`); a postacímhez a korábbi számlák
    vevőcíme (szamla.raw_xml) is forrás.
  - `partner-javaslat-alap.ts` (tiszta): ellenőrzés — a mi címünk/nevünk, más
    megbízó, hihetetlen cím/e-mail/nap kiszűrve; Számlázz.hu vevő-XML olvasó.
  - `fuvar_partner_javaslat`: csak a hiányzó mezőkre, ember fogadja el
    („Átveszem” → partner-törzs, „Elvetem”).
  - Felület: Partnerek fül tetején „Hiányzó partner-adatok” kártya; a fuvar
    részleteinél a postázási cím helyén a javaslat, ha nincs, beviteli mező
    (a partnerhez ment).
- **Teszt:** teszt-partner-javaslat 11/0, jogosultság 28/0, typecheck, build.
- **Kockázat:** a számla-XML vevő-szerkezetét élő mintán nem láttam — ha nem
  olvasható, csak a PDF-forrás ad javaslatot. Költség: hiányos partnerenként
  egy PDF-hívás, utána csak új irat.

## 2026-10-01 — Számla-párosítás: kötőjeles és egybeírt cégnév egyezik

- **Probléma:** a WLLWR-2026-334 (EU-Cargo 2008 Kft., 500 000 Ft) nem
  párosult a #281-es fuvarhoz (EUCARGO 2008 Kft., 500 000 Ft,
  számlázható). A `partnerEgyezik` szavanként hasonlított: „eu” + „cargo”
  ≠ „eucargo”, így a tartalék kör (partner + összeg + dátum + útvonal) el
  sem indult.
- **Javítás:** az egybeírt alak egyezése, és egy legalább 5 betűs szó a
  másik név egybeírt alakjában is elfogadott (rövid szó nem, hogy az
  ÁJ-TRANS ≠ FLOTT-TRANS megmaradjon).
- **Teszt:** teszt-szamla-parositas 35/0 (4 új eset), typecheck.
- **Flexlog postázási cím:** nem hiba — új partner (első megbízás
  09-29), a partner-törzsben nincs postázási cím; egyszer kell rögzíteni a
  Partnerek fülön.

## 2026-09-30 — Ma oldal: mindig friss adat, pontosabb GPS-párosítás, eltérés nyugtázása

- **Probléma (Budaházi Zoltán):** a Ma oldal nem frissült magától; az
  eltérések egész nap kint maradtak; a GPS és a megbízások viszonya
  pontatlan volt. Élő eset: Micó #286, Kunhegyes — 10:22-kor a lerakón állt,
  a figyelő mégis „nincs érintés”-t írt, a Ma oldal „késés”-t mutatott.
- **Okok:** (1) az oldal csak betöltéskor kérte le az adatot; (2) a GPS-tény
  15 percenként került a megállókra; (3) a telephelyen belüli araszolás
  (6 km/h) megszakította az „ott áll” láncot; (4) az élő megfigyelések csak
  memóriában éltek, a 10:23-as kiadás kitörölte őket; (5) a „késés” akkor is
  kint volt, ha a kocsi az ablakon belül megérkezett, csak a rakodás tartott.
- **Módosítás:**
  - `auto-frissites.tsx`: a Ma oldal percenként (látható fülön) és
    visszaváltáskor frissül, kiírja: „frissítve 10:42”.
  - GPS-figyelő 15 → 5 perc (`teljesites-figyeles-scheduler.ts`).
  - `idovonal.ts` kiegesziteloAllapottal: a Q-hely közelében mozgó
    megfigyelés nem szakítja meg az ott-létet (csak az álló kezdi).
  - `elo-elozmeny.ts`: a megfigyelések a `fuvar_elo_megfigyeles` táblába is
    íródnak, és induláskor onnan töltődnek vissza (2 nap megőrzés).
  - Késés: az ablakon belül megérkezett kocsi nem késik; az ablak után
    érkezett „késve ért oda N p” (rögzített szám). A sofőr „Megérkeztem”
    jelölése is érkezésnek számít (Ma sáv és tükör).
  - Nyugtázás: `fuvar_elteres_nyugta` (nap, kulcs, szín, ki, mikor); „OK”
    gomb a sorban (fuvarozás szerkesztési jog), a nyugtázott aznap nem
    látszik, csak ha sárgából piros lesz; alul „N nyugtázva ma”, „vissza”
    gombbal. Éjfélkor lejár.
- **Teszt:** typecheck, eslint; teszt-erintes 76/0 (új: Kunhegyes-eset),
  teszt-ma-tukor 19/0 (új: késés érkezés után), jogosultság 28/0.
- **Kockázat:** 3× több Ecofleet-hívás a figyelőből (5 percenként kb. 4
  hívás); a Ma oldal percenkénti frissítése nyitott fülenként egy lekérés.

## 2026-09-29 — Jelenlét: feladat-bevitel az oszlopban, az elvégzettek láthatók maradnak

- **Probléma:** a feladat-rész nem volt átlátható. A rögzítés a fejléc gombja
  mögött, felugró ablakban történt (telephely-választással, pedig az oszlopból
  amúgy is látszik), a készre jelentett feladat pedig azonnal eltűnt az
  archívumba — a nap munkája nyomtalanul lekerült a képernyőről.
- **Módosítás — bevitel:** minden telephely-oszlop tetején gyorsbevitel
  (`gyors-feladat-bevitel.tsx`). Alapból egyetlen sor; fókuszra kinyílik a
  sürgősség (öt színes gomb, nem legördülő), az ismétlődés és a dátum. A
  telephelyet az oszlop adja, azt nem kell választani. Enter rögzít, Escape
  bezár, és hozzáadás után a panel nyitva marad üres mezővel, hogy egymás
  után több feladat is felvehető legyen. A fejléc gombja és a felugró ablak
  megszűnt (`feladat-rogzites-tile.tsx`, `uj-feladat-form.tsx` törölve).
- **Módosítás — elvégzett feladatok:** a készre jelentés a sor bal szélén egy
  négyzet egy kattintása (eddig a részletek ablakán át vezetett az út). A sor
  nem tűnik el, hanem lecsúszik az oszlop alján lévő zöld "Elvégezve"
  szakaszba, áthúzva, a készre jelentés idejével és a jelentő nevével. A
  fejlécben kapcsoló: ma / 3 nap / egy hét (alapból 3 nap), utána a tétel már
  csak az archívumban van. Visszanyitni ugyanott, ugyanazzal a négyzettel.
- **Séma:** `feladatok.elvegzes_at` + `elvegezte` — eddig csak a nap rögzült,
  így nem lehetett tudni, ki és mikor jelentette készre. Visszanyitáskor
  mindkettő törlődik. Új részleges index a kész sorokra.
- **Takarítás:** a `getMaiKeszSzamok` szerver-akció megszűnt (a lábléc-számláló
  helyét az elvégzettek tényleges listája vette át); egy "use server" export
  távolról hívható, ezért a halott akciót nem hagyjuk bent.
- **Teszt:** typecheck, build, eslint (hibaszám változatlan), a modul 40
  tesztesete zöld.
- **Kockázat:** a séma-bővítés két nullázható oszlop, a régi kész sorokon
  üresek maradnak — ott csak a dátum látszik, név és óra nélkül.

## 2026-09-20 — Jelenléti/üzenőfal: havi napló, ismétlődő feladatok, mobil javítások

- **Probléma (éles adatból):** a modult szeptember 12. óta nem használták, és
  az addigi kilenc jelenlét-sor megmutatta, miért. Egyetlen napra (09-08)
  nyolc sor került: azonos percben nyitott-zárt szakaszok, egy máig nyitva
  maradt szakasz, valamint szabadság ÉS betegszabadság ugyanarra a napra — a
  telefon nem mondta meg, bent van-e, és semmit nem lehetett visszavonni.
  Megjegyzés egyetlen bejegyzésen sem volt (a mező a gombok ALATT volt), és a
  feladatokhoz egyetlen hozzászólás sem született: a küldés a teljes
  `jelenlet` modul jogát kérte, ami a két dolgozónak nincs meg, így minden
  küldés hibára futott. A `repeat_freq` halott adat volt: heti feladat
  beállítható, de semmi nem hozta vissza. A sofőrök gondjelzései a dolgozók
  üzenőfalán jelentek meg Szakolyon.
- **Módosítás — admin (`/jelenlet`):** a mai jelenlét vékony sávba került
  (`mai-jelenlet-sav.tsx`), a felszabaduló helyen telephelyenként 8-10 feladat
  fér el görgetés nélkül. Új havi napló (`havi-naplo-dialog.tsx`): a hónap
  hetekre bontva, naponta minden érkezés-távozás, heti és havi összeggel,
  dolgozónként; egy napra kattintva helyben javítható (`nap-szerkeszto.tsx`),
  és olyan nap is pótolható, amin még nincs bejegyzés. A nyitva maradt napok
  figyelmeztető sávba kerültek, egy időpont beírásával lezárhatók.
- **Módosítás — számolás:** a hiányos (távozás nélküli) nap mostantól
  `nyitott`, és NEM számít bele a heti/havi egyenlegbe. Eddig csendben
  kimaradt az összeadásból, így egy 07:00-kor nyitva hagyott nap −9:00-ként
  jelent meg, mintha ott se lett volna senki.
- **Módosítás — ismétlődés:** készre jelentéskor a sor archívumba kerül, és
  létrejön a következő példány az előző kiadási dátumhoz igazítva (nem a
  készre jelentés napjához, hogy a ritmus ne csússzon). A nyitott listákon 3
  nappal az esedékesség előtt jelenik meg; addig az „Ütemezett" sorban van. A
  `sorozat_id` köti össze a láncot, ezért visszanyitás sem gyárt duplikátumot.
- **Módosítás — sofőrjelzés:** `feladatok.forras` (`jelenlet` / `sofor_gond`).
  A Jelenlét és a mobil csak a telephelyi feladatokat mutatja; a
  `lib/fuvarozas/actions.ts:getGondJelzesek` és a `lib/attekintes/actions.ts`
  a `sofor_gond` sorokat olvassa, tehát a fuvaros oldalakon semmi nem vész el.
- **Módosítás — dolgozói mobil (`/erkezes`):** állapotsor (bent/kint, mióta) +
  a mai nap idővonala; a gombok közül csak az él, aminek értelme van; az
  utolsó koppintás 10 percig visszavonható; a megjegyzés a gombok FÖLÉ
  került. Egy napra nem kerülhet egyszerre munka és távollét (a távollét
  megerősítés után felváltja a nap bejegyzéseit). Feladatok: telephely-fülek.
  Profil: már csak a kivehető szabadság és az előlegek — a szerepkör és a
  bérezés lekerült. Az elfogadásra váró előleg piros sávban áll minden
  képernyő tetején (külön push-értesítés nincs, ez volt a kérés).
- **Módosítás — szabadságkeret:** `alkalmazottak.szabadsag_keret_nap` +
  `szabadsag_keret_datum`. A Profil a fordulónap utáni szabadság-napokat vonja
  le belőle, így a telefonon jelentett szabadság automatikusan fogyaszt.
- **Hibák:** a feladat-megjegyzés jogosultsága (`requireAnyEditPermission`);
  az előleg `accepted_at` formázatlanul, dátum-objektumként ment a kliensre,
  ami eldobta a Profil > Előlegek szakaszt annál, akinek van elfogadott
  előlege (Bodogán Gábor); az előleg megjegyzése nem jelent meg a telefonon;
  az admin előleg-kártyáján nem látszott az elfogadás ténye és időpontja; a
  távozás-gomb érkezés nélküli sort hozott létre; az „Új szakasz" üres sort.
- **Egyszeri lépés:** `db/migrations/006_jelenlet_befejezes.sql` — a meglévő
  sofőrjelzések átjelölése, a 09-08-i próbasorok és az üres szakaszok
  törlése, a szabadságkeret indulása a 2026. augusztusi bérjegyzékről
  (Bodogán Gábor 14, Vadon Gábor 15 nap, 2026-08-31-i fordulónappal).
- **Teszt:** `scripts/teszt-jelenlet.ts` (30 eset) a `teszt` láncban; a teljes
  lánc, `typecheck`, `build` zöld. A `react-hooks/set-state-in-effect`
  darabszám ezekben a fájlokban 10-ről 8-ra csökkent.
- **Kockázat:** a felületet böngészőben nem tudtam kipróbálni (nincs helyi
  Postgres), ezért az első éles használatot érdemes végignézni. A
  `006`-os migráció adatot töröl (a 09-08-i próbasorok) — Budaházi Zoltán
  megerősítette, hogy az a nap próba volt.


## 2026-09-20 — Levelek: a „Mind" nézet nem mutatja az elvetett leveleket

- **Probléma:** a takarítás után is ott maradtak a nem odavaló levelek a
  képernyőn — mert a „Mind" szűrő mindent mutatott, az elvetetteket is. Így
  úgy tűnt, mintha a takarítás nem csinált volna semmit (pedig a sorokon ott
  volt: „elvetve · takarítás").
- **Módosítás:** `getLevelek` új `elvetettNelkul` kapcsolót kapott; a „Mind"
  és a „Megbízás" nézet ezzel megy, és új **„Elvetett"** szűrő került a sorba,
  amivel a kitakarított levelek előhívhatók (és egy kattintással
  visszahozhatók a teendők közé).
- **Teszt:** `typecheck`, `eslint`, `build` rendben.
- **Kockázat:** nincs — csak megjelenítés; adat nem változik.

## 2026-09-20 — Levelek: „Takarítás" gomb a nem teendős levelekre

- **Probléma:** a Gmail-figyelő első köre még a teljes postafiókból dolgozott
  (a címke-szűrés csak utána került be), így bekerült egy adag nem fuvaros
  levél, ami ott ül a „Mind"/„Új" nézetben.
- **Módosítás:** a Levelek fül szűrősora mellé **„Takarítás (N)"** gomb került
  (csak szerkesztési joggal, és csak ha van mit takarítani). Rákérdez, majd a
  nyitott levelek közül **elveti azokat, amik nem teendők** — vagyis amiknek az
  osztálya nem megbízás / módosítás / adatkérés / okmánykérés / papírok.
  Nem töröl: az állapot `elvetve` lesz, a sor a „Mind" nézetben megmarad, és a
  napló megőrzi, ki takarított (`allapot_by`).
  - `lib/fuvarozas2/levelek.ts`: `takaritsLeveleket()` és `getTakarithatoDb()`.
- **Teszt:** `typecheck`, `eslint` (0 hiba az érintett fájlokon), teljes
  teszt-lánc **402/402**, `build` rendben.
- **Kockázat:** ha egy valódi megbízás rosszul lett osztályozva (pl. „egyéb"),
  a takarítás azt is elveti. Ezért előbb a Teendő nézetben érdemes átsorolni,
  amit kell — az elvetett levél viszont a Mind nézetből egy kattintással
  visszahozható.

## 2026-09-20 — Gmail-figyelő élesítve, és CSAK a „Fuvarmegbízás" címkés levelekkel dolgozik

- **Mi történt:** a `docs/gmail-fuvar-figyelo.gs` Apps Script telepítve Zoltán
  Google-fiókjába (`wellwornpallet65@gmail.com`, projekt: „WWP — Gmail
  fuvar-figyelő"), `ALAP_URL` + `TOKEN` beállítva, engedélyezve, 5 perces
  időzítő telepítve. A két végpont éles válasza 200 volt, az első futás 16
  levelet vitt át.
- **Zoltán döntése (09-20):** a figyelő **ne a teljes postafiókot nézze**,
  csak a **„Fuvarmegbízás"** Gmail-címkével megjelölt leveleket. A script
  ezért `GmailApp.getUserLabelByName(...)`-ből dolgozik (`ALAP_CIMKE`,
  felülírható a `CIMKE` Script Propertyvel), az időablak 3 napról **14 napra**
  bővült (címkézett levélből kevés van, ne maradjon ki semmi), és új
  `listazCimkeket()` függvény írja ki a fiók címkéit, ha a pontos név kell.
  Ez derítette ki, hogy a címke **egyes számban** létezik („Fuvarmegbízás"),
  nem többes számban.
- **Következmény:** az első, még címke nélküli futás 16 levele bent maradt a
  `fuvar_level` táblában; ezek a Levelek fül „Mind" nézetében látszanak, a
  „Teendő" szűrő nem mutatja őket, ha nem megbízásnak lettek osztályozva.
- **Kockázat:** ami nincs felcímkézve, azt a rendszer nem látja — érdemes egy
  Gmail-szűrőt csinálni, ami a tipikus megbízó-feladókra automatikusan ráteszi
  a címkét. A megosztott titok bekerült egy beszélgetésbe, cseréje javasolt
  (előbb a Script Property, utána a Railway változó).

## 2026-09-20 — Fuvarozás 2, E10d: Kimutatás (D8) és Partnerek (D7) a tervvászon szerint

- **Kimutatás**: a költségsor teljes lett. Eddig a bevétel, a megtakarítás, az
  üzemanyag és (ha van import) az útdíj szerepelt; mostantól a **sofőr + kocsi
  napi fix** is (50 000 Ft/nap × ahány napon a kocsi a GPS szerint mozgott), és
  ebből számolódik az **eredmény** és az **eredmény/km** — kocsinként és
  flottára. A fejlécben ott a **Források** sor (GPS · HU-GO · gázolajár),
  ahogy a vásznon.
- **Partnerek**: a listán megjelent a **Sablon** oszlop (melyik determinisztikus
  import-sablon ismeri a partnert; sablon nélkül „LLM"), a megbízás-szám
  mostantól **átvisz a partner fuvarjaira** (`?partner=<id>` szűrő a
  Megbízásokon), a nyitott panel alján pedig ott a **kapcsolattartók** (a
  megbízásokból gyűjtve) és a **tanult rakodási idő** felrakóra/lerakóra
  (a megállókon mért érkezés→távozás mediánja, min. 3 minta).
- **Levelek (D10)**: a meglévő nézet már a vászon szerinti — típus-szűrők
  darabszámmal, sorok feladóval, tárggyal, hivatkozással, csatolmánnyal,
  állapottal —, ezen nem kellett változtatni.
- **Teszt:** `typecheck`, `eslint`, teljes teszt-lánc **402/402**, `build`
  rendben; Playwright 1440×900: Kimutatás és Partnerek 200.
- **Kockázat:** az eredmény-sor addig optimista, amíg nincs HU-GO-import
  (akkor útdíj nélkül számol) — a Források sor ezt kiírja. A napi 50 000 Ft
  minden aktív napra terhelődik, a hétvégi mozgásra is.

## 2026-09-20 — Fuvarozás 2, E10c: Kalkulátor (D6) és Elszámolás (D5) a tervvászon szerint

- **Kalkulátor**: HU-GO útdíj + **saját önköltség**, és abból három ajánlat-sáv.
  Amit a régi kalkulátor nem tudott: az **üres km** (telephely → felrakó és
  lerakó → telephely, kapcsolóval, ha van visszfuvar), a **mért fogyasztás**
  (Ecofleet 14 nap, kocsira vagy flottára), a NAV gázolajár, és a **napi
  költség**. Utóbbi Zoltán száma (2026-09-20): **50 000 Ft/nap/kocsi, sofőr és
  kocsi együtt** (`NAPI_KOLTSEG_FT` a `lib/fuvarozas2/kalkulator-alap.ts`-ben;
  ha később bomlik sofőrre és fixre, csak ez a konstans változik). A lap
  megmondja az önköltséget Ft/rakott km-ben, és minősíti az 500/600/700 Ft/km
  sávokat, valamint a megbízó konkrét ajánlatát (veszteséges / határeset /
  ajánlott). A régi, térképes kalkulátor lenyitva ottmarad.
- **Elszámolás**: a vászon szerinti **folyamat-nézet** a kanban helyett —
  Fotóra vár → Számlázható → Számlázva (e-mail) → E-mail elment (posta) →
  Kintlévőség. Minden kártyán az ott következő gomb van (számlázható jelölés,
  számlaszám rögzítése, e-mail elment, papír megjött, postázva), a fejlécben a
  lejárt számlák és a várakozó piszkozatok száma. A **számla e-mail
  piszkozata** (címzett a partner-törzsből, tárgy és törzs a terv sablonjával,
  csatolmány-lista) elkészül és **kimásolható** — az automatikus Gmail-vázlat
  az Apps Script lépéshez tartozik (S17), és a küldés akkor is kézi marad.
- **Teszt:** `scripts/teszt-kalkulator.ts` (22 eset: önköltség-összetevők, az
  üres km hatása, több napos fuvar, nulla rakott km, minősítési küszöbök,
  sávok, napok a menetidőből) a `teszt` láncban — teljes lánc **402/402**.
  `typecheck`, `eslint`, `build` rendben; Playwright 1440×900: mindkét oldal 200.
- **Kockázat:** az önköltség két bemenete becslés, amíg nincs jobb: a
  fogyasztás mért adat hiányában 30 l/100, a gázolajár a NAV havi ára (ha nem
  érhető el, 650 Ft/l) — a felület mindkettőnél kiírja a forrást. A napi
  50 000 Ft egy átlag: ha a két kocsi költsége eltér, kocsinkénti mezőt kell
  csinálni belőle.

## 2026-09-20 — Fuvarozás 2, E10b: Élő GPS (D4) és Tervezés (D3) a tervvászon szerint

- **Élő GPS**: kocsinként **24 órás sáv** — vezetés (menta), rakodás/várakozás
  (kék), szünet (borostyán), rövid állás (szürke); a szaggatott, halvány sáv a
  becsült (élő pozícióból kiegészített) szakasz. Mellette a napi mutatók:
  vezetés ma és mennyi van a 4,5 órás szünethatárig, a 9 órás napi keretből
  mennyi maradt, az utolsó 45 perces szünet, a szolgálat kezdete és 13 órás
  plafonja, a mai és 14 napos fogyasztás (Ecofleet útvonal-jelentés), megtett
  km. Alul a **tanult rakodási idők** (a megállókon mért érkezés→távozás
  mediánja, helyenként, min. 3 minta). A régi, részletes idővonal + térkép
  lenyitható marad a lap alján.
  - A sávhoz a meglévő GPS-idővonal szakaszai kellettek: egy additív
    `szakaszok` mező a `JarmuIdovonalEredmeny`-ben.
  - Az ETA-hiba (P50/P90) NEM szerepel: ahhoz a becsléseket az érkezés
    pillanatában rögzíteni kellene, ez még nem gyűlik — a doboz ezt ki is írja.
- **Tervezés**: a heti összesítő megkapta a vászon számait — **rakott/üres km
  és üres arány** (GPS, napi szintű közelítés, mint a Kimutatásban), **„ha a N
  üres slot megtelik: +X Ft"** (a hét átlagos bér fuvardíjával), és
  **sofőrönként a heti vezetett óra az 56-os keretből** (80 % felett
  borostyán). Az üres slot kártyája mostantól kiírja a **kész keresési sort**
  (felrakás körzet + nap + cél-körzet), és a **Kalkulátorba** gomb a slot
  helyével és a telephellyel előre kitöltve nyit.
- **Teszt:** `typecheck`, `eslint` (érintett fájlok 0 hiba), teljes teszt-lánc
  **380/380**, `build` rendben; Playwright 1440×900-on mindkét oldal 200.
- **Kockázat:** a konténerben nincs Ecofleet-kulcs, ezért a sáv és a heti km
  élesben nézendő meg először. A Timocom-nak nincs API-ja, ezért a „keresés"
  egy kimásolható sor + link a tőzsdére — automatikus feladás nem lesz.

## 2026-09-20 — Fuvarozás 2, E10a: az asztali Ma és Megbízások a tervvászon szerint

- **Probléma:** a leszállított asztali képernyők a vászon (D1–D4) lecsupaszított
  változatai voltak: a Ma csak darabszámokat mutatott, nem azt, MI nem megy
  terv szerint; a Megbízások listán nem volt kocsi/időszak szűrő, „következő
  teendő" oszlop, és a részlet külön oldalra vitt. Zoltán jelezte (09-20),
  hogy a megbeszélt kinézetet és funkciókat kéri — jogosan.
- **Ok:** az E1–E7 lépések a cutover biztonságáról és a funkció-paritásról
  szóltak; a vászon döntési rétege (eltérés-motor, vezetési idő, teendő-oszlop,
  master-detail) későbbre volt sorolva, és ez nem lett képernyőnként kimondva.
- **Módosítás:**
  - **Ma (D1)** — új `lib/fuvarozas2/ma-vaszon.ts` + `components/fuvarozas2/ma-vaszon.tsx`:
    hat mérőszám-csempe (Úton · Eltérés · Ellenőrzésre vár · Papírra vár ·
    Számlázandó · Kintlévőség), alatta **ELTÉRÉSEK** panel — nyitott várakozás
    (45 perc felett pótdíj-jelzéssel), lejárt időablak, hiányos import, csúszó
    fuvar, sofőr gondjelzése, nem tervezett állás —, majd kocsinként a nap
    megállósorokkal (ablak, GPS/kézi kész, várakozás) és a **vezetési idő**
    sorral (ma vezetés, mikor esedékes a 45 perces szünet, szolgálat kezdete),
    jobb hasábon Teendők (iroda) · Holnap · Rendszer.
  - **Vezetési idő becslés**: a meglévő GPS-idővonal szakaszaiból
    (`napiVezetettIdoSec`), három új, additív mező a `JarmuIdovonalEredmeny`-ben
    (`vezetesSec`, `szolgalatKezdet`, `utolsoSzunetVege`). Nem tachográf-adat —
    a felület minden soron jelzi, hogy becslés.
  - **Megbízások (D2)** — bal **szűrősáv darabszámokkal** (jelleg, mind a 9
    állapot, kocsinként, időszak), 8 oszlopos lista **„Következő teendő"**
    oszloppal (sürgős esetben pirossal), és a **részlet ugyanazon a képernyőn**
    nyílik a lista alatt (`?reszlet=<id>`), a megállókkal, iratokkal,
    elszámolással, naplóval és műveletekkel. A `/fuvarozas2/megbizasok/<id>`
    külső hivatkozásként továbbra is működik.
  - Új tiszta logika: `lib/fuvarozas2/megbizas-szuro.ts` (`kovetkezoTeendo`,
    `papirHatraNap`, `idoszakVodor`) — adatbázis nélkül, ezért tesztelhető.
- **Teszt:** `scripts/teszt-megbizas-szuro.ts` (27 eset: minden állapot
  következő teendője, papír-határidő, időszak-vödrök) a `teszt` láncban —
  teljes lánc **380/380**. `typecheck`, `eslint` (új fájlok 0 hiba), `build`
  rendben. Playwright 1440×900-on `vezeto` fiókkal: mindkét képernyő 200, a
  szűrősáv számai stimmelnek, a részlet a listán belül nyílik.
- **Kockázat:** a helyi próbaadatban nincs GPS és időablak, ezért a vezetési
  idő és az ablak-oszlop élesben nézendő meg először. A kintlévőség-csempe
  csak annak jelenik meg, aki a Számlák modult is látja.

## 2026-09-20 — Fuvarozás 2, E9b: külső hívások sorosítása és tartós cache (T1/T3/T13/T16), térkép-csempe forrás (T12)

- **Probléma:** a Kalkulátor, az idővonal-újraláncolás és a tervezés ugyanazokra
  az útvonalakra kéri újra és újra az állami útdíjkalkulátort. A mai egy perces
  folyamat-cache minden pipánál ürül, és több instance között amúgy sem közös —
  az ellenőrzés becslése napi 10–15 ezer hívás egy kulcs nélküli,
  dokumentálatlan, korlátozás nélküli külső végpontra. Ez előbb-utóbb kizárást
  vagy hibát hoz, és akkor a fuvarszervezés áll. A Nominatim fordított geokód
  ugyanígy: a feltétele 1 kérés/másodperc, eddig semmi nem tartotta be.
- **Ok:** minden külső hívás közvetlenül, korlát, újrapróbálás és tartós
  gyorsítótár nélkül ment ki.
- **Módosítás:**
  - Új `lib/fuvarozas/kulso-hivas.ts`: szolgáltatónkénti **sorosítás**
    (egyszerre egy kérés, kötelező szünettel — HU-GO 300 ms, Nominatim 1100 ms),
    **újrapróbálás** 429/5xx-re exponenciális várakozással (max 3), és
    **tartós cache** az adatbázisban (`kulso_valasz_cache`, migráció 005),
    ami közös a folyamatok és instance-ok közt, és túléli az újraindítást.
  - `lib/fuvarozas/utdijkalkulacio.ts`: a címkeresés, a fordított geokód és az
    útvonal/útdíj-számítás ezen keresztül megy. A cache-kulcs MINDEN
    paramétert tartalmaz (jármű-kategória, euro, tömeg, geometria kérése,
    megállók 4 tizedesre kerekítve), tehát két különböző kérés soha nem oszthat
    egy soron. Élettartam: cím 30 nap, útvonal 3 nap. Hibát sosem cache-elünk,
    és ha az adatbázis nem elérhető, a hívás ugyanúgy kimegy.
  - `components/fuvarozas/route-map.tsx` (T12): a térkép-csempe forrása
    `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`
    környezeti változóból állítható. Beállítás nélkül minden marad a mai
    állapotban — a viselkedés nem változik.
- **Teszt:** `scripts/teszt-kulso-hivas.ts` (14 eset) a `teszt` láncban:
  nincs átfedő kérés, a szünet megvan, a hibás hívás nem akasztja meg a sort,
  429/5xx újrapróbál és más hiba nem, a kulcs-kerekítés jó. Teljes lánc
  **353/353**. `typecheck`, `eslint` (érintett fájlok 0 hiba), `build` rendben.
  A cache oda-vissza ellenőrizve helyi adatbázison: második azonos kérés már
  nem hív ki, más kulcs igen.
- **Kockázat:** a konténerből az utdijkalkulacio.hu nem érhető el (kimenő
  tűzfal), ezért a valódi HU-GO választ élesen kell egyszer ellenőrizni —
  egy kalkulátor-számolás elég hozzá. A 3 napos útvonal-cache miatt egy
  tarifaváltozás legfeljebb 3 napig régi összeget adhat; ha ez zavar, a
  `CACHE_UTVONAL_PERC` egy sorban állítható.
  A csempe-szolgáltató **döntést kíván**: az openstreetmap.org csempeszervere
  üzleti/rendszeres használatra a Tile Usage Policy szerint nem való, és
  bármikor kizárhat — ehhez egy ingyenes kulcsos szolgáltató (pl. MapTiler)
  regisztrációja kell, utána csak a két env-változót kell beállítani.

## 2026-09-20 — Fuvarozás 2 átállás, E7g: vezetői mobil (Ma · Fuvar · Cég · Rendszer)

- **Probléma:** a vezetői fiók (`vezeto`) mobilon még a sofőr-nézetet kapta;
  a terv szerinti négy fül (Ma · Fuvar · Cég · Rendszer) nem létezett, így
  telefonról nem lehetett sem jóváhagyni, sem a cég számait megnézni.
- **Módosítás:** a `/m` keret harmadik szerepet kapott — sofőr → Ma · Holnap ·
  Profil; **teljes Fuvarozás-jog → Ma · Fuvar · Cég · Rendszer**; csak
  elszámolás (Szabina) → Papír · Számla és posta · Profil. A sorrend számít:
  aki sofőr, annak a terepnézet jár akkor is, ha egyébként több joga van.
  - **Ma** (`/m`): felül a jelzések (mi vár döntésre, súlyosság szerint
    színezve, a számra kattintva a teljes listára visz), alatta kocsinként egy
    sor a mai fuvarral és a holnapi darabszámmal, végül a „Kocsi nélkül" doboz.
    A terv elve: nem a normál működést mutatja, hanem az eltéréseket.
  - **Fuvar** (`/m/fuvar`): négy szegmens — **Holnap** (kocsinként a holnapi
    fuvarok + holnapra kocsi nélküliek + link a heti tervezésre),
    **Ellenőrzés** (az importból jött, még jóvá nem hagyott megbízások, a
    hiánylistával és egy „Jóváhagyom ✓" gombbal — kocsi nélkül a gomb tiltott,
    mert az átmenet úgyis elbukna), **Levelek** (a nyitott, teendős levelek:
    elintézve / elvetve / csatolmányt kérek), **Napló** (az utolsó 60 esemény:
    mi történt, ki csinálta, mikor).
  - **Cég** (`/m/ceg`): a mai Áttekintés három füle egy helyen — Nyíregyháza
    (kassza, mai felvásárlás típusonként, mai kiadás), Készlet (telephelyenként,
    típusonként, úton lévő), Számlák (kintlévőség pénznemenként, lejárt
    kiemelve, esedékesség szerinti lista). **Csak olvas** — rögzíteni a saját
    modulban lehet, oda visz a lábjegyzet-link.
  - **Rendszer** (`/m/rendszer`): a `getRendszerEgeszseg()` sorai (Drive, Gmail,
    GPS, Számlázz.hu, átállási kapuk, lejárt fuvarok, elszámolási sor,
    migrációk) zöld/sárga/piros jelzéssel, alatta a fiók és a kijelentkezés.
- **Új fájlok:** `lib/fuvarozas2/naplo.ts` (`getNaplo`, csak olvas),
  `components/m/vezeto.tsx` (Ma + Fuvar), `components/m/vezeto-ceg.tsx`,
  `app/m/fuvar|ceg|rendszer/page.tsx`. A `components/m/tabbar.tsx`
  `VEZETO_TABOK`-kal bővült.
- **Jogosultság:** a Cég fül a meglévő Áttekintés-lekérdezéseket használja
  (`lib/attekintes/actions.ts`), azok pedig `attekintes` nézetet kérnek —
  a lekérdezéseket NEM duplikáltuk, helyette a `vezeto` fiók megkapja az
  `attekintes` nézeti jogot (`grantAttekintesVezetonekOnce`, egyszeri lépés a
  `scripts/migrate.mjs`-ben, `alkalmazott_javitasok` kóddal rögzítve).
- **Teszt:** `typecheck` tiszta; `eslint app/m components/m lib/fuvarozas2/naplo.ts`
  0 hiba; `npm run teszt` 339/339; `npm run build` rendben (mind a 6 `/m` útvonal).
  Playwright 390×844-en `vezeto` fiókkal: mind a négy fül 200, a fülsor
  Ma/Fuvar/Cég/Rendszer, a Fuvar és a Cég szegmensei váltanak. Regresszió:
  Szabina (`/m` → `/m/papir`, Papír gomb ír) és Vadon Gergő (Ma · Holnap ·
  Profil, „Kész" gomb ír) változatlanul jó.
- **Kockázat:** a terv „cégiratok, műszaki lejárat" figyelmeztetései még nem
  szerepelnek a Rendszer fülön — nincs hozzá adatforrás (a Járművek modulban
  nincs lejárat-tábla). Amint lesz, ide kerül. A Cég fül számai ugyanonnan
  jönnek, mint az Áttekintésé, tehát eltérés nem keletkezhet a kettő közt.

## 2026-09-20 — Fuvarozás 2 átállás, E7f: iroda (Szabina) mobil teendői

- **Probléma:** Szabina mobilon nem látta, mihez nem jött még meg az eredeti
  papír, mit kell kiszámlázni és mit lehet postázni (terv: mobil 07/08).
- **Módosítás:** a `/m` mobil keret **szerep-függő** lett:
  sofőr (`fuvarozas_sajat` + alkalmazott) → Ma · Holnap · Profil;
  iroda (`elszamolas`) → **Papír · Számla és posta · Profil**, és a `/m`
  irodai fióknál a Papír teendőkre irányít.
  - `/m/papir`: a bér fuvarok, amiknél az EREDETI okmány még nem érkezett be
    (fotó-jelzéssel, számlaszámmal, fizetési határidővel) — egy gomb: „Papír
    megjött ✓" (B7: Szabina nyugtáz, a nyugtázó neve a naplóba kerül).
  - `/m/szamla`: három szakasz — Számlázható (a számlára kért hivatkozási
    szám, díj, határidő + számlaszám beírása egy lépésben), Számla e-mail
    kimegy, Postázható (csak ahol a papír már megvan).
  - A Profil a szerep szerint mást ír, és a teljes Elszámolás nézetre visz.
- **Teszt:** typecheck, lint, build zöld; Playwright 390×844, `BudahaziSzabina`
  fiókkal: `/m` → `/m/papir` átirányítás, mind a három lap 200, a „Papír
  megjött" gomb a naplóba írta a nyugtázó nevét, a számlázható és postázható
  szakaszok a várt sorokkal.
- **Kockázat:** a vezetői (4 füles) mobil nézet még nincs meg — vezetőként a
  `/m` a sofőr-nézetet adja; az asztali Fuvarozás 2 mobilon is használható.

## 2026-09-20 — Fuvarozás 2 átállás, E7e: Élő GPS, Kalkulátor, Rendszer-egészség; jogosultság-függő fülsor

- **Probléma:** a fülsor hiányos volt (GPS-hez és Kalkulátorhoz a régi
  modulba kellett átmenni), és nem volt egy hely, ahol látszik, megy-e
  minden magától. Ráadásul a fülsor mindenkinek mindent mutatott — Szabina
  (`elszamolas` hatókör) is látta volna a GPS-t és a kimutatást (S16).
- **Módosítás:**
  - `/fuvarozas2/gps` és `/fuvarozas2/kalkulator`: a MEGLÉVŐ, bevált
    `GpsStatus` és `TollCalculator` komponenst keretezi — szándékosan nem
    írtuk újra őket (a Kalkulátor HU-GO alapja változatlan).
  - `lib/fuvarozas2/rendszer.ts` + `/fuvarozas2/rendszer`: 8 egészség-sor
    (Drive-import, Gmail-figyelő, GPS-érintések, Számlázz.hu szinkron,
    átállási kapuk, lejárt-nem-teljesített, elszámolási sor, migrációk),
    mindegyik „rendben / figyelj / gond" állapottal, értékkel és utolsó
    életjellel; csak olcsó count/max kérdésekből.
  - `components/fuvarozas2/fulek.tsx`: a fülsor külön, szerver-oldali
    komponens, ami a bejelentkezett jog szerint szűr — az `elszamolas`
    hatókör csak a Ma, Megbízások, Levelek, Elszámolás és Partnerek fület
    látja. A `kozos.tsx` maradt tiszta (kliens is importálja).
- **Teszt:** typecheck, lint, build zöld; mind a 10 útvonal 200-zal tölt be
  vezetőként (Ma · Megbízások · Levelek · Tervezés · Élő GPS · Kalkulátor ·
  Elszámolás · Partnerek · Kimutatás · Rendszer), konzol-hiba nélkül; a
  Rendszer-lap a helyi adaton helyesen jelzi a nyitott migrációs hibát és a
  Gmail-figyelő kimaradását.
- **Kockázat:** a Rendszer-lap az `elszamolas`-jogúaknak nem elérhető
  (szándékos); az Élő GPS és a Kalkulátor a régi komponenseket használja, így
  a régi modul törlésekor (7. kör) ezeket át kell emelni, nem törölni.

## 2026-09-20 — Fuvarozás 2 átállás, E7c: Tervezés (heti rács, üres slotok)

- **Probléma:** nem látszott egy nézetben, hol és mikor áll üresen kocsi —
  pedig a heti fuvarkeresés ezen múlik (Budaházi Zoltán kérése, terv 10.1).
- **Módosítás:** `lib/fuvarozas2/tervezes.ts` + `/fuvarozas2/tervezes`:
  kocsi × nap rács (hétfőtől vasárnapig, hét-léptetéssel), a foglalt mezőben
  a megbízás kártyája (megbízó, útvonal, állapot, díj — a részletre visz), az
  üres MUNKANAPON piros szaggatott „ÜRES · fuvar kell" a kocsi aznapi
  helyével és az üres hazaút becsült km-ével; hétvégén nincs üres-jelzés.
  Jobb oldalt „Hová kell fuvar a héten" lista (nap · kocsi · honnan · üres km,
  Timocom és Kalkulátor gombbal) és „Kocsi nélkül" panel. Fent heti
  összesítő (foglalt/üres nap, bér/saját darab, Ft-os bevétel).
- **Becslés, nem mérés:** a hazaút km a megállók geokód-snapshotjából
  LÉGVONALBAN, 1,3-as közúti szorzóval — így a heti nézet egyetlen külső
  hívást sem indít (T1); a felület kiírja, hogy becslés, a pontos km/útdíj a
  Kalkulátorból (HU-GO) jön.
- **Teszt:** typecheck, lint, build zöld; helyi adaton a rács, az üres
  slotok és a „Kocsi nélkül" panel a várt tartalommal. A teljes `npm run
  teszt` lánc **Node 24-en (a fejlesztői gépen) zöld: 339 eset, 0 hiba** —
  a konténer Node 22.22-jén a négy régi `.mts` teszt továbbra sem fut
  (CJS/ESM interop), ezért a `tsx` mostantól devDependency, hogy a lánc
  friss klónon is induljon.
- **Kockázat:** a kocsi „hol áll" értéke az utolsó ismert lerakóból jön; ha
  egy fuvarhoz nincs kocsi rendelve, az a „Kocsi nélkül" panelen látszik, a
  rácsban nem.
## 2026-09-20 — Fuvarozás 2 átállás, E7d: Kimutatás (km, bevétel, saját fuvar megtakarítás)

- **Probléma:** nem látszott egy helyen, mennyi km ment egy kocsival nap/hét/
  hó alatt, mennyi pénzt hozott, és mennyit ért, hogy a saját raklapot a
  saját kocsink vitte (Budaházi Zoltán kérése, terv 8. fejezet).
- **Módosítás:** `lib/fuvarozas2/kimutatas.ts` + `/fuvarozas2/kimutatas`:
  nap/hét/hó váltó léptetéssel; felül 8 mérőszám (megtett km rakott/üres
  bontással, bér bevétel, bér Ft/km, saját fuvar megtakarítás, üzemanyag,
  útdíj, eredmény, kocsi nélküli megbízások), alatta kocsinkénti tábla és
  napi km-oszlopdiagram (bér/saját/üres színnel).
- **Mit mérünk, mit becslünk** (a felület is kiírja): km és liter az
  Ecofleet útvonal-jelentésből — TÉNY; bevétel a bér megbízások díjából —
  TÉNY, az EUR-os díjak külön, átváltás nélkül (nincs árfolyam-tábla);
  **rakott/üres bontás v1-ben napi szintű** (a nap km-je a napon futó
  megbízás jellegéhez tartozik, bér+saját napon felezve) — a megállónkénti
  GPS-bontás akkor jön, ha a megállók GPS-adatai teljesek; saját fuvar
  megtakarítás = saját km × bér Ft/km — BECSLÉS; útdíj csak importált HU-GO
  tranzakcióból, nem becsüljük.
- **Teszt:** typecheck, lint, build zöld; helyi adaton a nézet Ecofleet-kulcs
  nélkül is betölt (sárga sáv a km hiányáról, a megbízás-adatok pontosak),
  a gázolajár-lekérés él (667 Ft, 2026. szeptember), a kocsinkénti tábla és
  a kocsi nélküli megbízások száma a várt.
- **Kockázat:** a napi bontás durvább, mint a végső GPS-alapú; a felület
  ezért mondja meg a szabályt. Ha egy megbízáshoz nincs kocsi, a km-je
  sehol nem jelenik meg — ezt külön mérőszám mutatja.

## 2026-09-20 — Fuvarozás 2 átállás, E9a: Levelek (Gmail-figyelő Apps Script-tel, determinisztikus osztályozás)

- **Probléma:** a fuvarmegbízások e-mailben jönnek, és Zoltán kézzel teszi
  őket a Drive-ba; a nem-megbízás levelek (okmánysürgetés, módosítás,
  kérdés) sehol nem látszanak összegyűjtve.
- **Ok / architektúra-döntés (az S17 határozat pontosítása):** a tervben
  OAuth (`gmail.readonly`) szerepelt. Ez itt **nem járható**: a Gmail
  olvasó jogosultsága a Google-nál „restricted scope" — éles használathoz
  alkalmazás-hitelesítés és éves biztonsági audit kellene, „Testing" módban
  pedig a refresh token 7 naponta lejár (hetente újra be kellene lépni).
  Helyette a figyelő a felhasználó SAJÁT Google-fiókjában futó Apps Script
  (`docs/gmail-fuvar-figyelo.gs`), ami 5 percenként megosztott titokkal
  POST-ol a rendszernek. Nincs tárolt Gmail-token, nincs lejárat, és a
  levél törzse nem hagyja el a postafiókot.
- **Módosítás:**
  - `lib/fuvarozas2/level-osztalyozo.ts` — tiszta, determinisztikus
    osztályozó 10 osztállyal (megbizas · modositas · adatkeres ·
    okmanykeres · papirok · fizetes · szamla_ertesito · timocom · reklam ·
    egyeb), bizalommal és indoklással; partnert a meglévő
    `import/partnerek.ts` ujjlenyomataiból, rendszámot (a Duvenbeck elírt
    alakját is) és hivatkozási számot a tárgyból olvas. A szabályok a
    postafiók 3 hetének valódi mintáiból készültek.
  - `db/migrations/004_fuvarozas2_levelek.sql` — `fuvar_level` (metaadat +
    osztályozás + feldolgozás), `gmail_figyelo_allapot` (életjel).
  - API: `POST /api/fuvarozas2/gmail/levelek` (metaadat, idempotens),
    `GET …/kert` (mely levelek csatolmánya kell), `POST …/csatolmany`
    (a megbízás irata a Drive **figyelt** mappájába → a meglévő drive-sync
    importálja; nincs új import-út). Hitelesítés: `GMAIL_FIGYELO_SECRET`,
    a közös guard (`requireBearerSecret`) query-tokennel is — a Drive
    végpontokon a query továbbra sem engedett.
  - `/fuvarozas2/levelek` fül: figyelő-életjel, szűrők (Teendő · Új ·
    Megbízás · Mind), levélkártyák („miért ez?" indoklással), gombok:
    Megnyitás Gmailben · Irat a Drive-ba · Ez megbízás · Nem teendő · Kész.
  - `feltoltMegbizasIratot` a `drive-sync-core.ts`-ben.
- **Teszt:** `teszt-level-osztalyozo` 25 eset a `teszt` láncban (kitalált
  nevekkel, valódi tárgysor-alakokkal); végponti próba helyi Postgresen:
  titok nélkül 401, 4 levél osztályozása helyes (megbizas 100 % / ab-speed /
  26/3700 / AOPU-427, okmanykeres 90 %, szamla_ertesito 99 %, egyeb 30 %),
  ismételt beküldés 0 új, nem kért levél csatolmánya elutasítva; böngésző:
  a Levelek fül és a gombok működnek. typecheck, lint, build zöld.
- **Kockázat / teendő:** a figyelő csak akkor indul, ha a Railway-en van
  `GMAIL_FIGYELO_SECRET`, és a Google-fiókban telepítve van a script
  (egyszeri, ~5 perc). Amíg nincs, a Levelek fül üres, minden más
  változatlan. A KIZART_FELADO listát (bank, NAV) a script tartalmazza —
  bővíthető.

## 2026-09-20 — Fuvarozás 2 átállás, E7b: sofőr mobil (`/m` Ma · Holnap · Profil) + megálló/fotó triggerek

- **Probléma:** a sofőröknek nem volt a terv szerinti nézete (Ma · Holnap ·
  Profil, sötét menta-antracit); a régi kód megálló- és fotó-írásai (sofőr
  pipa, GPS-figyelő, fuvarlevél-fotó) nem jutottak el az új modellbe.
- **Módosítás:**
  - `db/migrations/003_fuvarozas2_megallo_foto_trigger.sql`: (1) új
    megbízás → `fuvar_megallok` sorok a felrakó/lerakó szövegből (a
    `bontsMegallokra` elsődleges elválasztói SQL-ben); cím/dátum változás →
    újraépítés, ha még nincs tény a megállókon; (2) `fuvar_megallo_allapot`
    insert/update → `fuvar_megallok` kész/GPS mezők (index → `megallo_id`);
    (3) `fuvar_dokumentumok` 'fuvarlevel' → `foto_megerkezett` esemény, és
    `teljesitve → szamlazhato` (11.1/7) naplózva.
  - `/m` (app/m): `layout` (jog: `fuvarozas_sajat` vagy `fuvarozas` +
    alkalmazott), `page` (Ma), `holnap`, `profil`; `components/m/sofor-nap.tsx`
    a terv 03/04/06 vásznai szerint: „KÖVETKEZŐ” kártya (Navigáció ·
    Megérkeztem · Várakozom · Felrakva/Lerakva ✓), megbízás-kártyák
    megállókkal, ablak/kész/GPS, fuvarlevél-fotó (kamera) az utolsó lerakó
    után, pozíciószám beírása, „Gond van”, Megbízás PDF. Adat és akciók a
    meglévő `lib/fuvarozas/sofor.ts`-ből (a szerver a saját kocsira szűr).
    Térerő nélkül: 5 újrapróbálkozás növekvő várakozással (a kliens-oldali
    sor — T10 — az E8-ban). Téma: `.sofor-m` a `globals.css`-ben. Az
    AppShell a `/m` útvonalakon nem rajzol oldalsávot.
- **Teszt:** typecheck, lint, build zöld; helyi Postgres: 003 triggerek
  (insert → 4 megálló; állapot-sor → megálló tény + `megallo_id`; fotó →
  számlázható + 2 esemény); Playwright 390×844, `VadonGergo`: Ma/Holnap/
  Profil 200, „Felrakva ✓” → a megálló kész, a `fuvar_megallok` sor is
  frissült (trigger).
- **Kockázat:** a 003 megálló-trigger a régi `addFuvar` minden új soránál
  fut; a gondolatjeles városlista-bontást nem ismeri (cutover előtt a
  backfill újrafuttatása pótolja). A fotó Drive-ba megy (régi út), a
  `tartalom_hash` még nincs számolva (S10 az E9-ben).

## 2026-09-19 — Fuvarozás 2 átállás, M1: sofőr mobil `/m` (Ma · Holnap · Profil)

- **Probléma:** a sofőrök nézete az /erkezes hub Fuvarok csempéje mögött
  volt (két koppintás), a „következő nap” gomb ma nem volt elérhető, és a
  régi világos téma. Döntés (2026-09-19): sofőr mobil = Ma · Holnap ·
  Profil, nincs Jelenlét/Feladatok fül; a terv sötét (antracit-menta)
  palettája.
- **Módosítás (minimális):** `app/m/page.tsx` + `components/m/sofor-m.tsx`:
  három alsó fül, a Ma és a Holnap a MEGLÉVŐ `SoforFuvarNap` komponenst
  mutatja (`rogzitettNap` új, opcionális prop: a fül dönti a napot, a
  napváltó gombok rejtve — az /erkezes változatlan), Profil: név, kocsi,
  link az /erkezes-re (jelenlét, előlegek, készlet), kijelentkezés.
  `lib/m-theme.ts`: a terv sötét palettája ugyanazokon a `--mob-*` (és
  shadcn) változókon, ezért a sofőr-komponens változtatás nélkül sötét.
  `findJarmuByEmployeeName` a `sofor.ts`-ből a `vehicles.ts`-be került
  (a "use server" fájl csak async függvényt exportálhat). AppShell: a `/m`
  is oldalsáv nélküli. Jog: `fuvarozas_sajat` (a sofőr fiókoké).
- **Teszt:** typecheck, lint, build zöld; a meglévő tesztek zöldek. Helyi
  böngésző-próba sofőr fiókkal (lent).
- **Kockázat:** csak új útvonal + egy opcionális prop; az /erkezes és a
  régi nézetek nem változnak.

## 2026-09-19 — Fuvarozás 2 átállás, E7a: az új felület alapja (Ma · Megbízások · Elszámolás · Partnerek) + kettős írás mindkét irányba

- **Probléma:** az új modell (állapot, megállók, elszámolás, napló) élesben
  fel volt töltve, de nem volt rá felület, és a régi kód írásai nem
  frissítették az `allapot`-ot.
- **Módosítás:**
  - `db/migrations/002_fuvarozas2_allapot_trigger.sql`: az `allapot` követi
    a régi jelölőket (11.2 SQL-tükör: `fuvar_megbizasok_allapot_regi_jelolokbol`),
    ha a régi kód ír (insert allapot nélkül / jelölő-változás), és az új
    kód nem írta ugyanabban az utasításban; napló-trigger minden
    állapotváltásra (`forras_trigger: true`), amit az új kód
    `set_config('fuvarozas2.uj_kod','1',true)`-val elnémít (nincs dupla).
  - `scripts/fuvarozas2-backfill.ts`: `--apply` a dátum/ablak múlásával
    továbbment sorokat utánahúzza (naplózva); `--check` az „új kód
    döntötte” sorokat (ember-forrású esemény a mostani állapotra) nem
    számolja eltérésnek.
  - `lib/fuvarozas2/megbizasok.ts` (use server): lista/részlet az új
    táblákból (elszámolás mezők coalesce új/régi), `valtAllapot` az
    állapotgépen át (`ellenorizAtmenet`), **kettős írás** a régi jelölőkbe,
    esemény `kliens_uuid`-dal (idempotens), `setPapirBeerkezett` (B7:
    Szabina, `elszamolas` jog), `setSzamlaSzam` (szamla tábla párosítás →
    számlázva), `setMegjegyzes`. Kézi kiskapuk naplózva: „számlázható fotó
    nélkül”, „saját fuvar lezárása szállítólevél nélkül” (a K2 körig).
  - `lib/fuvarozas2/partnerek.ts`: törzs, szerkesztés, **E5 összevonás**
    (`osszevonPartnereket`: megbízások/kapcsolatok átírva, név →
    névváltozat, naplózva) + javaslatok (cégforma nélküli azonos kulcs,
    előtag).
  - `lib/fuvarozas2/ma.ts`: Ma — kocsinként ma/holnap, kocsi nélkül,
    jelzések (ellenőrzésre vár, lejárt, fotóra vár >2 ó, számlázható,
    e-mail küldendő, postázandó), állapot-számok.
  - Oldalak: `/fuvarozas2` (Ma), `/megbizasok` (csoport/állapot/jelleg
    szűrő), `/megbizasok/[id]` (megállók, napló, műveletek, elszámolás,
    dokumentumok, megjegyzés), `/elszamolas` (5 oszlop: Fotóra vár →
    Számlázható → Számlázva→e-mail → E-mail elment→posta → Postázva),
    `/partnerek`. Jogosultság: `fuvarozas` VAGY `elszamolas` (Szabina).
  - **Feature flag** (`lib/fuvarozas2/flag.ts`, B1): `FUVAROZAS_UJ=on` →
    „Fuvarozás 2” a menüben; `FUVAROZAS_REGI=off` → a régi eltűnik és a
    `/fuvarozas` az újra irányít (cutover). Menü: `altKeys`, `hiddenHrefs`.
  - **Színek a terv szerint** (döntés: nem a régi barna téma): `.fuvarozas2`
    scope a `globals.css`-ben (háttér #F3F4F1, kártya fehér, menta #1F8F6E,
    borostyán #A8690F, vörös #B93A2F, kék #2F6FA8), csak a `/fuvarozas2`
    útvonalakon. Az oldalsáv közös, változatlan.
- **Teszt:** typecheck, lint, `next build` zöld; helyi Postgres + Playwright:
  bejelentkezés `vezeto`-ként, mind az 5 oldal 200, állapotváltás
  (folyamatban → teljesítve) a felületről → napló egy ember-esemény, nincs
  trigger-dupla; 002 trigger: insert/jelölő-változás → allapot követ,
  új-kódos update-nél hallgat. `--check` a helyi adaton 0 eltérés.
- **Kockázat:** a 002 trigger élesben minden régi írásnál fut (olcsó: egy
  case + egy exists). Az új felület a régi mellett él a flag mögött; a
  régi fülek változatlanok.

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

## 2026-09-20 — Éles hibafeltárás (Fuvarozás 2), javítási terv

Bizonyíték: Railway deploy + http napló (deployment `5bfdf202`), a Drive
mappa tulajdonosa (Drive API), célzott kódellenőrzés. Részletek:
`claude/fuvarozas-javitasi-terv.md` (projekt-dok).

Megépült, de élesben nem működik:
- **H1** `POST /api/fuvarozas2/gmail/csatolmany` → 500 (2×), naplózás nélkül.
  Ok: a `Fuvarmegbizások` mappa tulajdonosa `wellwornpallet65@gmail.com`
  (személyes My Drive), a `driveClient()` viszont service account — annak
  nincs tárhelykvótája, így `files.create` 403 `storageQuotaExceeded`.
  Olvasni tud (ezért megy a drive-sync), írni nem.
- **H2** ugyanez `feltoltFuvarlevelFotot`-ra: a sofőr fuvarlevél-fotója
  élesben nem tölthető fel (ugyanaz a hívás, ugyanaz a mappafa).
- **H3** `fuvar_megallok` / `partner_id` / `jarmu_id` /
  `hivatkozas_kanonikus` **csak** a kézi `scripts/fuvarozas2-backfill.ts`-ből
  íródik, a deploy-lánc nem hívja. Az `allapot`-ot a 002 trigger tölti, ezért
  a listák rendben látszanak — de az E6 backfill óta létrejött fuvarokon
  (#133-tól) nincs megálló: nincs ablak-eltérés, várakozás/pótdíj-figyelés,
  megállónkénti sofőr-„kész”, partner szintű kintlévőség.
- **H4** időablakot **csak** `duvenbeck-import.ts` tölt; a `lib/fuvarozas/import/*`
  egyáltalán nem. Napló: #133/#134/#135/#137/#139 `ablak: -–-`.
- **H5** a Rendszer oldal nem néz Drive-**írást**, csatolmány-hibát, megálló
  vagy ablak nélküli megbízást.
- **H6** minden induláskor `lehetséges duplikátum bér fuvarok: 6` (külön
  számlaszámmal — valószínűleg téves), és a `[torolt]` LLM-maradékok (#136).
- **H7** `/fuvarozas2` hideg betöltés 6,2 s / 4,6 s / 2,7 s;
  `/fuvarozas2/megbizasok` 3× 499. Az 1 perces idővonal-cache működik.

Javítási sorrend: 1. hullám J1a (Apps Script tölti fel a PDF-et a saját
kvótából) → J1c (naplózás + Drive-írás próba) → J2 (`frissitsdFuvarozas2Modellt`
az import végén + idempotens backfill a deploy-láncban) → push.
2. hullám J1b (OAuth refresh token az íráshoz) → J3 (ablak-kinyerés minden
partnernél) → J5 (Rendszer-ellenőrzések) → J4 (duplikátumok nyugtázása).
Kód ebben a körben nem változott — csak feltárás.

### 1. javítási hullám (2026-09-20) — J1a, J1c, J2 kész

- **J1a** `docs/gmail-fuvar-figyelo.gs`: a script `DriveApp`-pal feltölti a
  csatolmányt a figyelt mappába (a felhasználó kvótájából), és
  `{gmailMessageId, driveFileId, driveUrl}`-t POST-ol. Új Script Property:
  `MAPPA` (alap: a Fuvarmegbizások mappa azonosítója). A Google-engedélyek közé
  bekerül a Drive-írás → **a scriptet újra kell menteni és egyszer futtatni**.
  A route új, elsődleges ága: `veszCsatolmanyDriveId` (levelek-core) csak
  rögzíti az azonosítót; a base64-es út tartalékként megmarad.
- **J1c** `console.error` a csatolmány-route mindkét hibaágán. Rendszer oldal:
  „E-mail csatolmányok" (45 percnél régebben kért, meg nem jött csatolmány).
  A tervezett Drive-írás-próba helyett DB-lekérdezéses tünet-ellenőrzés lett:
  ugyanazt fogja meg, de nem hív Drive-ot minden oldalbetöltésnél (a
  `getRendszerEgeszseg` szerződése, hogy minden kérdése olcsó).
- **J2** `lib/fuvarozas2/modell-szinkron.ts` →
  `frissitsdFuvarozas2Modellt(fuvarId)` + `potoldAHianyzoModelleket(korlat)`;
  a megálló-terv tiszta fájlban (`lib/fuvarozas2/megallo-terv.ts`), hogy
  tesztelhető legyen. Hívók: `addFuvar` (Drive-import és kézi felvitel) és a
  Duvenbeck-import vége. Óránkénti utánpótlás:
  `modell-szinkron-scheduler.ts` (instrumentation.ts). Rendszer oldal:
  „Megálló nélküli aktív fuvar", „Időablak nélküli aktív fuvar".
- Teszt: `npm run teszt` **425 eset** zöld (ebből 23 új:
  `scripts/teszt-modell-szinkron.ts`), `npx tsc --noEmit` tiszta,
  `npm run lint` változatlan (45 meglévő probléma, új nincs),
  `npm run build` zöld (konténerben, linuxos node_modules-szal).
- Hátra van a 2. hullámból: **J1b** (OAuth refresh token a Drive-íráshoz — a
  sofőr fuvarlevél-fotója enélkül nem tölthető fel), **J3** (időablak-kinyerés
  az általános PDF-importba), **J4** (duplikátum-nyugtázás), **J7**
  (titokcsere), és a `git push`.

## 2026-09-22 — sofőr mobil: csak Fuvarok és Profil csempe

- A dolgozói mobil hubon (`/erkezes`,
  `components/erkezes/erkezes-sajat-view.tsx`) a sofőr fiókok (Vadon Gergő,
  Takács Micó — `role === "sofor"`) mostantól csak a **Fuvarok** és a
  **Profil** csempét látják. A Jelenléti és a Feladatok csempe — és a hozzá
  tartozó képernyő-útvonal — náluk elrejtve; a Készlet csempe eddig is a
  `keszlet_sajat` jogtól függött, ami nekik nincs.
- `ErkezesSajatView` visszakapta a `role` propot (`app/erkezes/page.tsx`
  adja a `session.role`-t), ez dönti el a két csempét.
- A többi dolgozói fiók nézete változatlan.

## 2026-09-22 — sofőr Fuvarok: csak az aktuális és a következő két fuvar

- A sofőr napi nézete (`components/erkezes/sofor-fuvar-nap.tsx`) eddig a nap
  ÖSSZES fuvar-blokkját kirakta egymás alá. A Duvenbeck-napokon ez 4-6
  csempe, telefonon átláthatatlan. Mostantól alapból három látszik: az
  **aktuális** (amelyikben a soron következő, első nem kész megálló van) és
  az utána következő kettő.
- Ha a nap már végig kész (`nap.kovetkezo === null`), az utolsó három
  fuvar látszik, nem a reggeliek.
- A többi fuvar nem vész el: „Mind a N fuvar mutatása" gomb nyitja ki,
  „Csak az aktuális és a következő kettő" zárja vissza. A kinyitás a
  megjelenített naphoz kötődik, napváltáskor magától visszazárul.
- A nagy „következő megálló" kártya és a 3 napos előnézet változatlan.

## 2026-09-22 — sofőr megálló: Megérkeztem / Pakolás / Indulok (2-es terv)

- A megálló három lépése mostantól három gomb, ugyanaz a felrakónál és a
  lerakónál (Budaházi Zoltán választása öt terv közül — ld. a session
  mockupjait). Új közös komponens: `LepesGombok`
  (`components/erkezes/sofor-fuvar-nap.tsx`).
- Mindhárom gomb végig látszik. A soron következő kiemelve, a többi
  halványan, **de megnyomhatóan**: ha a sofőr csak induláskor veszi elő a
  telefont, ne kelljen előtte két hamis időpontot végigkattintania. Ami
  megvan, az zöld, órával jelölt sorrá alakul (ez a nyugtázás is).
- Lezárt megállónál csak a ténylegesen rögzült lépések látszanak — a GPS-ből
  késznek jelölt megállónál nem virít ott kiemelve a „Megérkeztem".
- Megjelenik mindkét helyen: a nagy „következő megálló" kártyán (nagy
  gombok) és minden megálló-soron a fuvar blokkjában (44 px-es gombok).
- **Adat: migráció nélkül**, a `fuvar_megallo_allapot` meglévő mezőire:
  Megérkeztem → `kezi_erkezes`, Pakolás → `varakozas_kezdete`, Indulok →
  `varakozas_vege` + `kesz`/`kesz_at`. Az „Indulok" váltja a korábbi
  FELRAKVA/LERAKVA gombot, ugyanazzal az írással.
- A „Pakolás" tehát ugyanaz az állásidő, amit a diszpécser oldal
  várakozásként mutat — egyben hagyva, külön oszlop nélkül. Ha később külön
  kell, az egy migráció.
- A régi külön „Várakozom / Várakozás vége" jelölő és az „Érkezés 13:24"
  felirat kikerült: mindkettőt a három lépés sora mutatja.

## 2026-09-22 — sofőr Fuvarok: aktív megbízás + következő, teljes adattal

Cél (Budaházi Zoltán): a sofőrnek ne kelljen átküldeni a megbízás e-mailjét —
minden ott legyen a telefonon.

- **Egy aktív megbízás.** Alapból az a megbízás látszik teljes kártyaként,
  amelyikben a soron következő (első nem kész) megálló van. Amit befejezett,
  az eltűnik a nézetből, és a következő lép a helyére.
- **Alatta a következő megbízás előnézete** (`KovetkezoFuvarElonezet`):
  megbízó, honnan → hová, időpont, Út ID / pozíciószám. Gomb nincs rajta —
  amíg az aktuálissal nem végzett, nincs rajta dolga.
- Ha a nap végig kész: „Mára végeztél — minden megállót lezártál."
- A nap többi fuvarja nem vész el: „A nap mind a N megbízása" gombbal
  előhívható, „Csak az aktuális megbízás" zárja vissza.
- **Két új adat a kártyán** (`lib/fuvarozas/sofor.ts`):
  - `idopont` — a megbízás szabad szöveges időpontja („07:00-15:00", „de.").
    Ez minden megbízáson megvan, míg a `felrakas/lerakas_ablak` mezőket csak
    a Duvenbeck-importőr tölti. Enélkül hiányzott a „hánykor".
  - `kapcsolat` — a megrendelő kapcsolattartója a `fuvar_kapcsolatok`
    törzsből, név + telefon, koppintásra hív. A párosítás ugyanazzal a
    `normalizaltCegKulcs(ceglNevKanonikusan(...))` kulccsal megy, amivel a
    Megbízások oldal is dolgozik; csak telefonszámos sor érdekel.
- Migráció nincs, mindkét mező meglévő oszlopból jön.

## 2026-09-22 — sofőr: 4-es elrendezés + napi pihenő/vezetés vége gombok

**4-es terv (megálló elöl, megbízás mögötte).** A `FuvarBlokk` sorrendje
megfordult: legfelül a megállók a három gombbal, alattuk egy csík a megbízó
nevével és NAGY betűs Út ID / pozíciószámmal, ami koppintásra kinyílik a
teljes adatlappá (megbízó, időpont, áru, megjegyzés, telefon, iratok, fotó,
gond jelzése). Indok: a megbízás adatait naponta kétszer nézi meg, a megállót
és a gombokat minden rakodásnál — így a gombok nem csúsznak le a képernyőről
egy hosszú cím vagy megjegyzés miatt. Az Út ID a csukott csíkon is nagy, mert
a kapuban azt kérik (az 5-ös „kapu-sorrend" terv ötlete).
A figyelmeztetések — „Korábbról csúszik", más rendszám, hiányzó pozíciószám —
SOHA nem kerülnek a csukott rész mögé.

**Fix gombok a nap két pihenőjére és a vezetés végére.**
- Új tábla: `sofor_munkanap` (`db/schema.sql`) — alkalmazott, nap, tipus
  (`piheno1` | `piheno2` | `vezetes_vege`), kezdet, vege. Naponta és
  típusonként egy sor (unique), így a téves koppintás nem halmozódik.
- Új művelet: `jelolMunkanapot(employeeId, napISO, tipus)`. Egy koppintás
  indít, a következő zár (pihenőnél a `vege` mező). A vezetés végének nincs
  hossza: ott a második koppintás VISSZAVONJA a jelölést — a téves koppintást
  a sofőr a telefonon javítja, nem telefonálással.
- A nap a megjelenített napból jön, nem a szerver órájából.
- `MunkanapSav`: a görgethető tartalom tetejére tapadó sáv, három 44 px-es
  gombbal. Szándékosan a fuvaroktól FÜGGETLEN — a pihenő a naphoz tartozik,
  nem egy megbízáshoz, és akkor is jelölhető, ha nincs aktív fuvar.
- A `sofor_munkanap` az indításkor lefutó `db/schema.sql`-ből jön létre,
  külön migráció nem kell.

## 2026-09-22 — sofőr: pihenő-sáv és Pakolás gomb kivéve

Budaházi Zoltán kérése ugyanaznap, a kipróbálás után.

- **Pihenő-sáv kivéve.** A `MunkanapSav` (Pihenő 1 · Pihenő 2 · Vezetés vége),
  a `jelolMunkanapot` művelet és a `SoforNap.munkanap` mező törölve —
  egyelőre nem figyeljük ezeket.
  A `sofor_munkanap` tábla SZÁNDÉKOSAN a sémában marad, üresen: a repó
  konvenciója szerint a visszavonás nem `drop`, és ha a jelölés visszakerül,
  csak a felületet kell visszatenni.
- **Pakolás gomb kivéve.** A megálló két lépése maradt: **Megérkeztem** és
  **Indulok**. A rakodás ideje a kettő különbségéből úgyis kijön, a sofőrnek
  meg eggyel kevesebbet kell nyomnia.
- Az „Indulok" továbbra is lezár egy korábbi körből maradt nyitott
  várakozást, ha van — újat már nem indítunk, de a meglévő sorok ne
  maradjanak félbe.

## 2026-09-22 — 26/3814: a hiányzó miskolci lerakó pótolva

- Az ÁB Speed 26/3814-es megbízásáról (Sopron → …, felrakás 09-23,
  NMZ-492) hiányzott az **első** lerakóhely. A PDF-en két lerakó van:
  1. Reál Alfi Ker Kft, 3527 Miskolc, Besenyői u. 8. (09-24)
  2. Coop, 4030 Debrecen, Diószegi u. 22/C (09-24)
  A behúzott sorba csak a debreceni került be, így a sofőr telefonján
  Miskolc meg sem jelent volna.
- Javítás: `potoldMiskolciLerakotOnce` (`scripts/migrate.mjs`) — a `lerako`
  mezőbe a két megálló a `bontsMegallokra` elsődleges elválasztójával
  (` + `) kerül, a PDF sorrendjében. Csak akkor ír, ha tényleg a hiányos
  változat van bent (`lerako not ilike '%Miskolc%'`), így kézi javítást nem
  ír felül, és ismételt futáskor nem csinál semmit.
- Ellenőrizve: a beírt szöveg `bontsMegallokra`-val két megállóra bomlik,
  „Miskolc" és „Debrecen" városnévvel.
- A PDF-olvasó maga NINCS javítva — miért vesztette el az első lerakót, az
  külön kör. Ez a lépés csak ezt az egy sort rendezi.

## 2026-09-22 — sofőr Fuvarok: két csempe, semmi több

Budaházi Zoltán kérése: „nem kell semmi sallang sem időpont a sofőröknek, az
csak nekem kell". A `components/erkezes/sofor-fuvar-nap.tsx` újraírva
(~800 → ~450 sor).

**Ami van:**
- **Aktuális megbízás** egy csempén: a megbízó neve, alatta a fuvar
  megállói — felrakó ÉS lerakó ugyanabban a csempében —, teljes címmel.
- A **gombok mindig csak a soron következő megállón**: előbb a felrakónál
  (Megérkeztem · Indulok), és amint ott indulást jelölt, átkerülnek a
  lerakóhoz. Ha az utolsó megálló is kész, a csempe helyére a következő
  megbízás lép, alá pedig az azutáni.
- Az aktív megállónál Navigáció gomb és — bizonytalan címnél — „Itt vagyok".
- **Következő megbízás** egy csempén: megbízó, honnan → hová. Gomb nincs.
- A papíradatok (megbízó, megjegyzés, kapcsolattartó telefon, iratok,
  fuvarlevél fotó, gond jelzése) egy alapból CSUKOTT „Részletek" sor mögött.

**Ami kikerült, és nem véletlenül hiányzik:** időpont és időablak (chipek,
`AblakSor`, `ablakAllapot`), Út ID / pozíciószám és a beírása, áru ·
mennyiség · súly, a „Korábbról csúszik" jelölés, a napváltó nyilak, a 3 napos
előnézet (`KovetkezoNapokDoboz`), a külön nagy „következő megálló" kártya
(`KovetkezoKartya`), és a „mind a N megbízás" gomb. Ezek a diszpécsernek
kellenek, nem a sofőrnek.

A `rogzitPozicioszamot` és a `getKovetkezoNapokElonezet` szerver-műveletek
megmaradnak — a `/m` sofőr nézet és a GPS idővonal használja őket.

## 2026-09-22 — a következő megbízás csempéje kinyitható

- Az alsó („Ezután következik") csempe koppintásra kinyílik: a fuvar
  megállói teljes címmel, alattuk megjegyzés, kapcsolattartó telefon és a
  megbízás iratai. Így a sofőr még indulás előtt megnézheti, mire készüljön.
- Gomb továbbra sincs rajta — amíg az aktuálissal nem végzett, azon nincs
  dolga. A papíradat-blokk csak akkor jelenik meg, ha van mit mutatni.
- A „feljön a helyére" viselkedés változatlan: amint az aktuális megbízás
  minden megállója kész, ez lép a helyére teljes, gombos csempeként, és ide
  a rá következő kerül.

## 2026-09-22 — #226: tatai felrakó valódi címe + lezárása

- Gergő 09-22-i fuvarján a felrakó csak „Tatabánya" volt, pedig a valódi
  rakodóhely **Tata, Agráripari telep** (Budaházi Zoltán megerősítette). A
  GPS is ezt mutatta: a kocsi 14:20–15:13 között ott állt, 8 km-re a
  tatabányai városközponttól — ezért a felismerés nem tudta érkezésnek
  venni, és a felrakó nyitva maradt.
- `javitsdTataiFelrakotOnce` (`scripts/migrate.mjs`) két dolgot ír:
  1. a felrakó valódi címét (`2890 Tata, Agráripari telep`) — ellenőrizve:
     `cimPontossaga` szerint **„pontos"** a korábbi „csak_varos" helyett,
     tehát a GPS ezentúl fel tudja ismerni;
  2. a felrakó megállót (**index 0**) késznek, a tényleges 15:13-as
     elhagyással — így a sofőr telefonján a gombok rögtön a lerakónál
     (Tompaládony, index 1) lesznek.
- A megállók sorrendje: előbb a `felrako` mező darabjai, utána a `lerako`-é
  (`erintes-felismeres.ts`), ezért a felrakó a 0. index.
- Csak akkor ír, ha a felrakó még „Tatabánya" (kézi javítást nem ír felül),
  és az állapotsort csak akkor, ha a cím-javítás megfogott.

## 2026-09-22 — Tompaládony valódi címe (FABRIKA + 2000 Kft.)

- Korábban tévesen azt írtam, hogy a Tompaládony az ÁB Speed postázási címe
  és hibásan került a lerakóba. **Nem így van:** a faluban van a
  **FABRIKA + 2000 Kft.** telephelye (9662 Tompaládony, 0117/8 hrsz.), és a
  fuvarok oda mennek. Budaházi Zoltán megerősítette; a Számlázz.hu
  partnertörzse ugyanezt a címet adja, a FABRIKA pedig a második legtöbb
  számlát kapó vevő (118 számla).
- `javitsdTompaladonyiCimetOnce` (`scripts/migrate.mjs`): ahol a felrakó vagy
  a lerakó pontosan „Tompaládony", oda a teljes cím kerül. Ellenőrizve:
  `csak_varos` → **`pontos`**, tehát a GPS ezentúl felismeri.
- **A cégnév szándékosan nem kerül a címbe.** A `" + "` a megállók
  elsődleges elválasztója (`ELSODLEGES_ELVALASZTO`), ezért a
  „FABRIKA + 2000 Kft." név KETTÉVÁGNÁ a címet két hamis megállóra —
  ellenőrizve, 2 megállót ad, „FABRIKA + Kft." városnévvel.
  Ez általános kockázat minden olyan partnernél, akinek `+` van a nevében.

## 2026-09-22 — „Holnap" csempe a sofőr nézeten

- A nap alján egy halk csempe, fuvaronként **egy sorral**
  (`Sopron → Miskolc`). Ennyi kell ahhoz, hogy a sofőr este tudja, merre
  kell indulnia; gomb és részletek nincsenek rajta.
- A holnapi napot a `getSoforNap(employeeId, holnapISO)` adja, a maival
  párhuzamosan (`Promise.all`).
- **A le nem zárt mai fuvarokat kiszűrjük** a holnapi listából: azok
  átcsúsznak a következő napra, tehát enélkül ugyanaz a fuvar kétszer
  szerepelne a képernyőn (fent aktuálisként, lent holnapiként).
- A csempe akkor is megjelenik, ha ma nincs fuvar, vagy ha ma már végzett.

## 2026-09-22 — a holnapi fuvar is kinyitható

- A „Holnap" csempe eddig csak egy sor volt (honnan → hová). Most ugyanaz a
  komponens szolgálja ki, mint a „Ezután következik" sort: koppintásra
  kinyílik a megállókkal (teljes cím), megjegyzéssel, kapcsolattartó
  telefonnal és a megbízás irataival.
- A `KovetkezoMegbizas` → **`MegbizasElonezet`** néven általánosítva, `cimke`
  proppal; a külön `HolnapCsempe` törölve. Egy komponens, két helyen —
  így a kettő nem tud egymástól elcsúszni.
- Gomb továbbra sincs rajtuk: amíg az aktuálissal nem végzett, azokon nincs
  dolga.

## 2026-09-22 — Áttekintés/Fuvar: élő pozíció-fejléc (2-es terv)

A lapozás kocsik között **már megvolt** (`FuvarTablazatMobil`, scroll-snap +
fülek), a „Hol van most" doboz is. Ez a kör a 2-es látványterv szerinti
hierarchiát és a hiányzó adatokat tette hozzá.

- **Nagy sebesség-szám** a doboz tetején, mellette színes állapot-jelző:
  „Áll 3 ó 51 p" (borostyán) vagy „Megy 48 p" (zöld). A tartam a nap utolsó,
  még élő GPS-szakaszából jön (`szakaszok`, `mostaniSzakaszKezdet`) — az
  Ecofleet a folyamatban lévő szakaszt nem zárja le, az idővonal `elo`
  jelzéssel hosszabbítja a jelenig.
- Alatta a hely (visszafordított geokódolás vagy saját telephely neve).
- **Három új csempe:** Motor (jár/áll), Km óra, Ma megtett.
- **Új adat:** `eloPozicio.motorJar` (`lib/fuvarozas/actions.ts`), a már
  meglévő `EcofleetPosition.engineOn`-ból. Állva is számít: hűtős rakománynál
  és fűtésnél más helyzet egy járó motorú álló kocsi, mint egy lekapcsolt.
- A „Km óra" (`oraallasKm`) eddig is benne volt az adatban, csak nem látszott.
- Az „Utolsó GPS-jel", „Következő" és a „Nem tervezett állás" változatlan.

## 2026-09-22 — ÁB Speed és FABRIKA: egy telephely

- Budaházi Zoltán: az ÁB Speed postázási címe (9662 Tompaládony, Ifjúság u.
  20.) és a FABRIKA + 2000 Kft. telephelye (9662 Tompaládony, 0117/8 hrsz.)
  **ugyanaz a fizikai hely**. A fuvarok lerakójába a FABRIKA hrsz-es címe
  kerül, a postázásba az Ifjúság utcai — megjegyzésben rögzítve az ÁB Speed
  partner-sablonjánál, hogy senki ne „javítsa" egyikre a másikat.
- Az `S-WLLWR-2026-162` szállítólevél (Számlázz.hu PDF) megerősíti a címet:
  „FABRIKA + 2000 Kft., 9662 Tompaládony, 0117/8 hrsz." — karakterre az,
  amit a `javitsdTompaladonyiCimetOnce` beírt.
- **A szállítólevél tartalmazza a rendszámot** („Rendszám: NMZ-492,XZV-926"),
  a teljesítés dátumát és a mennyiséget (812 db használt EUR raklap) — tehát
  elvileg alkalmas arra, hogy fuvarhoz párosítva magától kitöltse a saját
  fuvarok hiányzó címeit. A Számlázz.hu-ból való lekérdezésük viszont még
  nyitott kérdés (a `szamlazzhu-client.ts` csak számlát kérdez, `S-` előtagú
  bizonylatot nem).

## 2026-09-22 — Vevő-telephelyek: 200 szállítólevél megjegyzéséből

- **A székhely nem a telephely.** A 200 Számlázz.hu-szállítólevél VEVŐ-rovata
  a cégjegyzékbeli székhelyet adja, nem azt, ahová megyünk. A SOLINWEST
  székhelye Csomád (Pest vármegye), a raklap viszont **Záhonyba és Tuzsérra**
  megy — 300 km-rel odébb. Budaházi Zoltán szólt, mielőtt ezt beírtuk volna.
- A valódi címek a szállítólevél **megjegyzés-rovatában** vannak
  („Szállítási cím: …”). Mind a 200 PDF megjegyzését kiolvastuk.
- **Új adatmodul:** `lib/fuvarozas/lerako-telephelyek.ts` — 6 város, ahol a
  csupasz városnév egyértelműen egy telephelyet jelent (Tompaládony, Ebes,
  Ózd, Tuzsér, Nyíradony, Nyírgelse), bejegyzésenként a forrással. Mellette a
  `KETSEGES_CIMEK` lista: 9 ismert cím, amit **szándékosan nem** teszünk a
  szótárba, mert a városnév nem azonosítja (Nyíregyházán három vevőnk van,
  Tatabányán kettő, Balkányban a saját telephelyünk is ott van).
- **Két vevőnél nincs fix cím, és ez nem hiányosság:** a KETER (55 fuvar)
  rendszerint a saját vevőihez küldeti a raklapot (Dunapack, Ehisz, DS Smith),
  a „MEGA-FRUIT" (12 fuvar) pedig mind a 12 alkalommal tanyára. Náluk a
  címnek a megbízáson kell lennie — szótárból nem pótolható. A KETER csak
  akkor Ebes, ha a megjegyzésben nincs partner (Budaházi Zoltán).
- **Egyszer futó javítás** (`irdBeVevoTelephelyCimeketOnce`, kód
  `vevo-telephely-cimek-2026-09-22`): a csupasz városnevet lecseréli a teljes
  címre. Kizárólag `tipus = 'sajat'` sorokon, és csak ha a mező PONTOSAN a
  városnév — bér fuvarban ugyanaz a város másik céghez tartozik (Nyíradonyba
  a Bestpallethez is megyünk, nem csak a Paulikhoz).
- **Teszt:** `scripts/teszt-lerako-telephely.mts` (34 eset). Azt védi, hogy
  minden szótárbeli cím `cimPontossaga` szerint **pontos** legyen (különben a
  csere semmit nem old meg, csak átírja az adatot), hogy a `varosNev` utána
  ugyanazt a várost adja (különben a fuvarlisták írásmódja megváltozna), hogy
  egy cím se essen két megállóvá a „+" mentén, és hogy a `migrate.mjs`-ben
  duplikált lista ne csússzon el ettől a modultól.
- **Ami nyitva maradt:** a SOLINWEST **záhonyi** telepének pontos utcája se a
  szállítóleveleken, se a neten nincs meg. A magyar cégadatbázisokat
  (Nemzeti Cégtár, Opten, Aranyoldalak) és a solinwest.hu-t a hálózati proxy
  blokkolja innen.
- Menet közben a szállítóleveleken előkerült néhány rendszám, ami nincs a
  `SAJAT_JARMUVEK` listában: `STH-666` (14 db bizonylat), `SNN-753/WGF-708`,
  `SNN-753/WEN-579`, `ROD-985/WDY-633`, `RXF-098`, `WDY-632`. Egy elgépelés
  is: `NMZ-497` a `NMZ-492` helyett.
- **Az idegen rendszámok magyarázata** (Budaházi Zoltán): ilyenkor a vevő
  küldött kocsit az áruért, tehát nincs fuvarunk — se megbízás, se GPS. A
  `SAJAT_JARMUVEK` listába nem valók, és szállítólevél-párosításnál sem
  szabad belőlük fuvart csinálni. A modulban rögzítve.
- **Záhony nem szorul pótlásra:** a sofőr a helyszínen az „Itt vagyok"
  gombbal rögzíti a kocsi koordinátáját a címhez (`rogzitMegalloHelyet`), és
  a csupasz városnév ettől ugyanolyan felismerhető lesz, mint egy pontos cím.
  A gomb pontosan akkor jelenik meg, amikor kell (`helyBizonytalan`).
- **Éles eredmény** (deploy 2026-09-22 19:40):
  `[migrate] Vevő-telephelyek pontos címe beírva — Tuzsér: lerakó 0, felrakó 1 (#7).`
  Egyetlen sor javult: a többi város (Ebes, Ózd, Nyíradony, Nyírgelse) csupasz
  városnévként nincs a jelenlegi 112 megbízás között. A szótár haszna tehát
  főként előre mutat — az ezután rögzített megbízásokra —, nem a meglévő
  adat tömeges javítására.

## 2026-09-22 — Áttekintés/Fuvar: összefoglaló első lap (2+7 D terv)

- 15 látványterv után Budaházi Zoltán a **2+7 D — vízszintes mérő**-t
  választotta: a 2-es terv sűrű listája a 7-es terv sebességmérőjével, de a
  kört kiterítve skálás sávvá.
- **A nap összképe külön lapra került.** Eddig a hét mutató a fülek fölött
  ült, tehát minden kocsi lapján ott volt, és onnan vitte a helyet. Most a
  lapozó **első lapja** az összefoglaló („Flotta" fül), utána jönnek a
  kocsik. A kocsik lapjairól így lekerült a fejléc-sáv, több hely maradt a
  megbízásoknak.
- **Az összefoglaló lap:** kocsinként egy sor — színpont, név, rendszám, egy
  0–90 km/h skálás mérősáv, mellette a szám, alatta a hely. A sorra
  koppintva a lapozó az adott kocsi lapjára ugrik (ugyanaz, mint a fül).
- **A mérő 90 km/h-ig megy** (`MERO_MAX_KMH`), mert a magyar tehergépkocsikat
  a sebességhatároló ennyire fogja — a skála pont a valós tartományt fedi le.
  Efölött a sáv telítődik, a szám viszont továbbra is a pontos értéket mutatja.
- **Sebességet csak friss jelből mutatunk.** Ha nincs nyomkövető a kocsin
  (Jani), nincs jel, vagy régi a jel (`jelRegi`), akkor „—" áll a szám
  helyén, és a sáv szürke. Egy órája beragadt „78 km/h" rosszabb, mint a
  bevallott hiány.
- **A figyelmeztetések csak akkor jelennek meg, ha nem nullák.** A négy
  alapszám (Fuvar ma, Kész, Folyamatban, Km ma) mindig látszik; a Csúszik,
  a Nyitott gond és a GPS nélkül buborékként jön elő, ha van mit jelezni.
  Korábban mind a hét szám ott volt akkor is, ha mind nulla volt.
- `npm run lint` a módosított fájlra tiszta (a repó 42 egyéb problémája
  korábbról van), `tsc --noEmit` tiszta, tesztek: teszt-erintes 67,
  teszt-jogosultsag 28, teszt-allapotgep 44, teszt-lerako-telephely 34 — zöld.

## 2026-09-22 — Sofőr: két csempe, jelölésekkel és fuvardíjjal

Budaházi Zoltán kérése: „csak az aktuális és következő megbízás legyen,
aktuálisnál jelölve ha pl. már felpakolt, minimális adat, fuvardíj, honnan
hová csak város, megbízó" + „azt is jelöld ha saját fuvar".

- **Pontosan két csempe.** Eddig az aktuális + a mai következő + a holnapi
  fuvarok *mindegyike* kint volt, tehát rossz napon négy-öt csempe. Most
  kettő: az aktuális, és utána a következő — ami elsősorban a mai sorban
  utána álló fuvar, és csak ha ma nincs több, akkor a holnapi első. Így a
  sofőr mindig lát egy lépést előre, de sosem kap listát.
- **Két új jelölés a csempe fejlécén** (`Jelolok`):
  - „Saját fuvar" — a saját raklapunkat visszük. Más munka, mint a bér
    fuvar: nincs külső megbízó, akinek a kapuban szólni kell.
  - „Felpakolva" — minden felrakó megállója kész. A csempe tetejéről
    látszik, hol tart, anélkül hogy végigolvasná a megállókat.
- **Fuvardíj a csempén.** Új mező a sofőr-adatokban (`fuvardij`), a
  `fuvar_megbizasok.fuvardij`-ból; ezres tagolással, forintban. Eddig
  szándékosan nem volt kint a sofőröknél.
- **Teljes cím csak a soron következő megállón.** A többi megállónál csak a
  város látszik — a csempe így egy pillantással átfogható. A navigációhoz a
  cím ettől függetlenül megvan, és a „Részletek" alatt is elérhető.
- **Új adatmező:** `SoforFuvarBlokk.tipus` ('sajat' | 'ber') és `fuvardij`,
  mindkettő a meglévő `FuvarExtraSor` lekérdezésbe került — nincs új kör.
- `npm run lint` az érintett fájlokra tiszta, `tsc --noEmit` tiszta, tesztek:
  teszt-erintes 67, teszt-jogosultsag 28, teszt-allapotgep 44,
  teszt-backfill-allapot 18, teszt-lerako-telephely 34 — zöld.

## 2026-09-22 — Fordított tipus-elnevezés: hibajavítás + a minta Zoltán nézetén

**Hiba, amit ugyanaznap ejtettünk és javítottunk.** A
`fuvar_megbizasok.tipus` oszlop elnevezése történelmi okokból FORDÍTOTT a
felülethez képest: `tipus='ber'` a „Saját fuvarok" fül, `tipus='sajat'` a
„Bér fuvarok" fül (lásd `lib/fuvarozas/megbizasok.ts`
getMaiValodiSajatFuvarok). Ezt a nyers oszlopot használtuk két helyen is:

1. A sofőr „Saját fuvar" jelölése **pontosan fordítva** címkézett volna.
   Javítva: a `SoforFuvarBlokk` már nem a nyers oszlopot adja tovább, hanem
   egy eldöntött `sajatFuvar: boolean` mezőt.
2. Az `irdBeVevoTelephelyCimeketOnce` `tipus = 'sajat'`-ra szűrt, tehát a
   **bér** fuvarokon futott — a rossz halmazon. Új, helyes lépés:
   `irdBeVevoTelephelyCimeketSajatraOnce` (kód
   `vevo-telephely-cimek-sajat-2026-09-22`), `tipus = 'ber'`-re.
   - A rossz lépés **egy sort** írt át (#7 tuzséri felrakó, egy bér fuvar).
     Ezt gépből NEM vonjuk vissza: innen nem tudjuk megmondani, hogy az a
     fuvar tényleg a Solinwest telepére ment-e. Budaházi Zoltán jelzést kapott.
   - `SAJAT_FUVAR_DB_TIPUS = "ber"` konstans + teszteset rögzíti az irányt,
     hogy ez ne fordulhasson elő újra.

**A fuvardíj lekerült a sofőrökről.** Félreértés volt: a díj Budaházi
Zoltán nézetére kellett, nem a sofőrökére. A sofőrök csempéin marad a két
jelölés (Saját fuvar, Felpakolva), díj nélkül.

**A minta átkerült Budaházi Zoltán mobil nézetére** (Áttekintés → Fuvar,
kocsi-lapok): kocsinként a „Hol van most" után PONTOSAN KÉT megbízás — az
aktuális és a következő. A csempén: megbízó, **honnan hová csak város**,
fuvardíj, állapot-jelvény (Rakodik / Csúszik / Úton oda / Kész), és a két
jelölés. Ha ma nincs több fuvar, a következő a legközelebbi jövőbeli.

- Eddig az **összes** mai fuvar teljes háromoszlopos táblázata kint volt,
  alatta a „Következő napok" listája — telefonon ez csak görgetnivaló.
- A táblázat nem veszett el: a csempét kinyitva ugyanaz jön elő, a
  hivatkozással és az áruval a tetején. A `FuvarFejsor` komponens kiesett,
  a szerepét a csempe fejléce vette át.
- A `JarmuMegbizasSor` megkapta a `fuvardij` + `fuvardijPenznem` mezőt, hogy
  a jövőbeli megbízás csempéjén is ott legyen a díj.
- Lint az érintett fájlokra tiszta, `tsc --noEmit` tiszta, tesztek:
  teszt-erintes 67, teszt-import 101, teszt-jogosultsag 28,
  teszt-allapotgep 44, teszt-backfill-allapot 18,
  teszt-lerako-telephely 36 — zöld.

## 2026-09-23 — 8 megbízás átvizsgálása, Duvenbeck-figyelmeztetés

Budaházi Zoltán kérésére 8 különböző megbízó friss megbízását néztem át
(Duvenbeck, ÁB Speed, RBT Europe, Lösung Trans, Logo Trek, Hajdúspedíció,
ÁJ-Trans, BB-Logistic), hogy mi kell belőlük a sofőrnek. Döntése:

- A megbízók szabad szöveges utasításait („Logo Trek néven rakodj”, „ne
  mondd meg, hol rakod le”, „1 órán belül szólj”) **nem** visszük ki a
  sofőr telefonjára.
- **A Duvenbecktől elvileg nem jön több fuvar**, ezért a sofőrnek szóló
  BMW-adatokat NEM építettük be. Ezek csak a FRALI-iraton vannak, és a
  `lib/fuvarozas/duvenbeck.ts` olvasó ma nem szedi ki őket: ZF kapuidő
  (pl. `ZF: 16.09.2026 17:10`, a PV–PB ablak BMW-nél 00:00–23:59, tehát a
  ZF a valódi határidő), ZF-ID, lerakó dokk (`H80F1`, `H80F2`, `DEB01`),
  ORDER-referencia, tárolószám (a hiányért a megbízás szerint mi
  felelünk), BMW-nél a göngyöleg felvételi helye („Assembly VZ2 Building
  80.0 Empties Area”). Ha mégis jön Duvenbeck és ráérünk, innen kell
  folytatni.
- Helyette **figyelmeztetés**: az Áttekintés → Fuvar lapon sárga doboz
  jelenik meg, amíg van folyamatban lévő Duvenbeck-megbízás
  (`getFuvarFulAdatok().duvenbeck`), és az importőr új Duvenbeck-sornál
  `[duvenbeck] FIGYELEM` sort ír a deploy-naplóba.
- `tsc --noEmit` és lint az érintett fájlokra tiszta.

## 2026-09-23 — Sofőr: a megbízás e-mail helyett a telefonon („menetjegy”, S4)

Budaházi Zoltán eddig e-mailben küldte át a sofőröknek a teljes megbízást;
mostantól csak az app. 8 megbízó 8 megbízásából ő választotta ki, mi kell
a sofőrnek: **időpont/időablak, összes lerakó, rakodóhely cégneve, dátum,
pozíciószám, referencia/rakodási szám, helyszíni kontakt, áru,
jármű-előírás, megbízás PDF**. Ami NEM: ügyintéző, raklapcsere,
papír-teendők, értesítési kötelezettségek, szabad szöveges utasítások.
7 látványtervből az **S4 „Menetjegy”** lett (Flotta-tervek vászon, 4. sor).

- **Kiolvasás** (`drive-sync-core.ts` LLM-utasítás): új mezők — `megallok`
  (minden fel- és lerakó: cég, tiszta cím, nap, időablak, helyszíni
  kontakt), `referencia`, `jarmuEloiras`. Tisztítás és párosítás:
  `lib/fuvarozas/sofor-adatok.ts` (tiszta függvények).
- **Több lerakó:** a modell eddig csak az UTOLSÓ lerakót adta (ÁB Speed
  Sopron → Miskolc → Debrecen-ből Sopron → Debrecen lett). Új iratnál most
  mind bekerül a `lerako` mezőbe `; `-vel — kivéve, ha a lerakót a partner
  determinisztikus olvasója adta.
- **A cégnév NEM a címbe kerül:** abból geokódolunk és abból képződik a
  helyszín-szótár kulcsa. Új oszlopok (`db/schema.sql`):
  `megallo_reszletek jsonb`, `referencia`, `jarmu_eloiras`, `sofor_adatok_at`.
- **Futó fuvarok pótlása** (`soforAdatokPotlasa`): a napló nyers
  szövegéből, Drive-letöltés nélkül, szinkron-körönként 5 sor, soronként
  egyszer. A felrako/lerako mezőhöz NEM nyúl (a sofőr jelölései a megálló
  sorszámához kötődnek); a részleteket a megjelenítés város szerint
  párosítja (`megalloReszlete`).
- **Felület** (`components/erkezes/sofor-fuvar-nap.tsx`): az aktuális csempe
  menetjegy — Honnan → Hová nappal és időablakkal, több lerakónál a teljes
  útvonal, perforáció, kódok (Poz., Ref., Áru, Jármű), a talpán a soros
  megálló cége, címe, kontaktja (hívható), Navigáció + Megbízás PDF, a
  lépésgombok. A fuvarlevél fotó / gond / többi irat csukott sor mögött.
  A „Következő” csempe: teljes útvonal, lerakószám, pozíciószám; kinyitva
  a megállók cégekkel és időablakkal. Kikerült: megjegyzés és a megrendelő
  telefonja (nem kérte).
- Teszt: `scripts/teszt-sofor-adatok.mts` 32 eset (felvéve a `teszt`
  scriptbe). `tsc`, lint tiszta. A `teszt-megbizas-szuro` 2 hibája a main-en
  is fennáll (dátumfüggő), nem ehhez tartozik.

## 2026-09-23 — Sofőr: „Megbízás PDF” gomb minden beolvasott megbízáson

Budaházi Zoltán jelezte: Micónál volt PDF-gomb, Gergőnél a mostani
megbízáson nem. Ok: a gomb a `fuvar_dokumentumok` táblából dolgozik, a
beolvasás viszont a megbízás iratát csak a `fuvar_megbizasok.drive_file_id`
mezőbe írta — a táblába csak a kétszer feltöltött irat második példánya
került (Micó ÁB Speed 26/3814-e ilyen volt). Javítás:
- `drive-sync-core.ts`: új sornál az irat `megbizas` típussal csatolódik.
- `sofor.ts getSoforNap`: a sofőr fuvarjainál idempotensen pótolja a
  hiányzó csatolást (`on conflict do nothing`, kivéve ha az irat egy törölt
  sorhoz volt kötve — akkor átkerül).

## 2026-09-23 — Áttekintés/Fuvar: Flotta lap F10+, kocsilapok „Tükör” (Z8)

Budaházi Zoltán 10 + 10 + 1 látványtervből választott (Flotta-tervek vászon):

- **Flotta (első) lap — F10+ „műszerfal, megbízás-állással”**: sötét fej a
  nap négy számával (fuvar, km, mai fuvardíj, a flotta 7 napos
  átlagfogyasztása). Kocsinként: bal szélen állapot-csík (áll HH:MM óta /
  úton / nincs GPS), sebesség, hely, a mostani megbízás megbízója és díja,
  **megállósáv** (✓ kész + idő, ● itt áll most, ○ következő ~ETA, ▶ a kocsi
  két megálló között), alatta egy mondat („Felpakolva · Miskolc következik ·
  lerakás holnap”), nyitott gond jelvény, 7 napos átlagfogyasztás.
- **Kocsilapok — Z8 „Tükör”**: ugyanaz a menetjegy, amit a sofőr lát
  (honnan → hová, útvonal, pozíciószám, referencia) a díjjal, alatta
  „Amit X jelzett”: a sofőr jelzései (Megérkeztem, Várakozom, Indulok, Gond,
  fuvarlevél fotó) időrendben, mellettük a GPS-idő; ahol nem jelzett, a GPS
  eseménye. A megállók részletes táblázata lenyitható; alatta a következő
  megbízás, legalul a kocsi részletei (a korábbi „Hol van most” doboz).
- „Aktuális megbízás” = amelyiknek megállóján a kocsi áll (GPS) VAGY a
  sofőr „Megérkeztem”-et nyomott (Jani GPS nélkül); a korábbi
  kovetkezoMegallo-alapú választás lerakás közben a KÖVETKEZŐ fuvart adta.
- Adat: `FuvarBlokk.referencia` (új, a `fuvar_megbizasok.referencia`
  oszlopból, `getMaiSajatFuvarok` → `TervezettFuvarSzakasz` → `FuvarBlokk`);
  a fogyasztás az `app/attekintes/fuvar/page.tsx`-ben a meglévő
  `getFogyasztas()`-ból (Ecofleet, 10 perc cache), 7 napos l/100 km, a nem
  mérő kocsi „nincs mérés”, és kimarad a flotta-átlagból.
- A régi első lap (vízszintes sebességmérő sorok, `KocsiMeroSor`,
  `MeroSav`) kikerült — a sebesség szám maradt.
- `tsc`, lint tiszta; tesztek zöldek (a `teszt-megbizas-szuro` 2 dátumfüggő
  hibája a main-en is fennáll). Próba-renderelés a minta-helyzettel
  (Tailwind-dal lefordítva, képernyőképen ellenőrizve).

## 2026-09-23 — Flotta lap: a kamion a sávon a valós helyén áll, pihenő közben is

Budaházi Zoltán jelezte: Gergő megállósávja „alapon” állt (üres vonal
Sárvártól Debrecenig), pedig már Nagyfügednél járt hazafelé. Az adat jó
volt (#223: Sárvár kész 09:41, Debrecen holnap), a sáv viszont csak az
elért megállóig töltött ki, a ▶ pedig csak MENET közben jelent meg —
pihenőn állva semmi nem mutatta, hogy az út nagyobb része megvolt.

- A kamion helye a két megálló között a légvonalbeli távolságok arányából
  (`utkozbenHelye`: előző kész → GPS-pont → következő), állva is; menet
  közben ▶, útközbeni állásnál ❚❚. Ehhez új mezők: `eloPozicio.lat/lon`,
  `MegalloBejegyzes.lat/lon` (a meglévő geokódolásból).
- A mondatban a hátralévő táv: „Debrecen következik (~113 km)”; a Tükör
  lapon „Áll útközben · Debrecen felé … · még ~113 km légvonalban · most:
  <hely>”.
- Próba-renderelés Gergő valós adataival (Sárvár 47.2475,16.9101 →
  Debrecen 47.5442,21.5664, kocsi 47.7044,20.0733): a jel az út ~70%-ánál.

## 2026-09-24 — Import: a Huncargo-megbízás nem HAPP-é

- **Probléma:** a Huncargo Forwarding Kft. 0000065055-ös megbízását (Dunaharaszti →
  Nagykálló, 150 000 Ft) HAPP Kft. megrendelővel vette fel az import. A HAPP
  ujjlenyomatai között ott volt a „Transorg Software” — a megbízás-készítő
  program neve, amit a Huncargo is használ. Ez pont az, amit a partnerek.ts
  fejléce tilt (szoftvernév nem ujjlenyomat).
- **Módosítás:** a „Transorg Software” kikerült a HAPP mintái közül (a HAPP
  láblécében a cégnév ott áll, azt felismeri); új partner a
  `huncargo` (`@hcf.hu`, „Huncargo Forwarding” — NEM a puszta „Huncargo”,
  mert az más megbízók iratain felrakóhely), postacím Sopron, Szappanfőző
  krt. 14., 30 nap. A `megrendelokHelyesbitese` eddig csak az üres
  postacímet/határidőt pótolta; ha a sort korábban MÁS partnernek néztük,
  annak tartalék-címét/napját is cseréli.
- **Éles hatás:** a meglévő sort a következő Drive-szinkron (óránként vagy a
  „Frissítés” gomb) a mentett nyers szövegből Huncargóra javítja, és
  figyelmeztetést ír róla. Számlázott sorhoz nem nyúl.
- **Teszt:** `teszt-import.mts` +3 eset (Huncargo-lábléc, a szoftvernév
  egymagában nem partner, Huncargo mint felrakóhely nem Huncargo-irat).

## 2026-09-24 — Fuvarozás 2: partner és kocsi a jóváhagyás után is frissül

- **Probléma (Budaházi Zoltán: „maradt happ, miért nincs kocsihoz rendelve?”):**
  a Fuvarozás 2 lista a partnert a `partner_id`-ből, a kocsit a `jarmu_id`-ből
  írja ki, és mindkettőt CSAK a beolvasáskor tölti ki a `frissitsdFuvarozas2Modellt`.
  - A megrendelő-helyesbítés (#216) csak a `megrendelo` szöveget írta át, a
    `partner_id` a HAPP-on maradt.
  - A kocsit jóváhagyáskor (`approveFuvar`) kapta Gergő, de a `jarmu_id` üres
    maradt → „kocsi nélkül”, miközben a GPS már Gergő fuvarjaként követte.
- **Módosítás:**
  - `approveFuvar`: ha a megrendelő / kocsi / sofőr MÁS lesz, a régi kulcsot
    eldobja, és utána a szövegből újratölti.
  - `megrendelokHelyesbitese`: ugyanez a partnerre.
  - `frissitsdFuvarozas2Modellt`: üres Kocsi mezőnél a Sofőr a tartalék (a GPS
    `driverMatchesRow` szabálya).
  - `potoldAHianyzoModelleket` (óránként + indulás után 1 perccel): a 14
    napnál nem régebbi, kulcs nélküli (partner/kocsi) sorokat is pótolja.
  - `migrate.mjs` egyszeri javítás: a 26S009326/1 sor megrendelője
    Huncargo Forwarding Kft., postacím Sopron, 30 nap; `partner_id` nullázva
    (az ütemező újratölti).
- **Teszt:** helyi Postgres-en a teljes migrate + a pótló kör + jóváhagyás-
  szimuláció: partner Huncargo, kocsi AOPU-427, majd kocsicsere NMZ-492-re
  átvezetve; második kör 0 érintett (nem pörög).

## 2026-09-24 — Sofőr: az utolsó „Indulok” lezárja a fuvart, és kéri a papír fotóját

- **Probléma:** a sofőr utolsó „Indulok” jelölése csak a megállót zárta, a
  fuvart nem (csak a GPS vagy az iroda). A fuvarlevél-fotó gombja egy
  csukott „Részletek” sor mögött volt, és semmi nem kérte.
- **Döntés (Budaházi Zoltán):** saját fuvarnál a kifelé menő szállítólevél a
  Számlázz.hu-ból jön; a befelé kapott papírt a sofőr fotózza le.
- **Módosítás:**
  - `markMegalloKesz`: az UTOLSÓ megállónál `teljesitve = true` (ugyanaz a
    szabály, mint a GPS lap pipájánál), visszaadja, hogy lezárta-e.
  - Sofőr képernyő: minden mai, lerakott, fotó nélküli fuvarhoz sárga kártya
    a lista tetején. Bér fuvar: „Fotózd le az aláírt fuvarlevelet (CMR)”.
    Saját fuvar: „Kaptál szállítólevelet? Fotózd le.” + „Nem kaptam” (ez a
    telefonon jegyződik meg, kifelé menő fuvarhoz).
  - A fotó irat-típusa mindkettőnél `fuvarlevel` (a `fuvar_dokumentumok`
    CHECK-je csak ezt ismeri; saját fuvar állapotát a fotó nem mozdítja).

## 2026-09-24 — A „Papír megjött” lépés megszűnt; Szabina „Posta” füle

- **Döntés (Budaházi Zoltán):** a külön papír-nyugtázás nem kell. A számla a
  sofőr fotója alapján készül; az eredetit Szabina viszi postára, és ő
  jelöli, hogy fel van adva.
- **Hiba, ami ezzel megszűnt:** a „Papír megjött ✓” az „e-mail elment”
  fuvart visszaléptette „számlázva” állapotba (a 002 trigger újraszámolt).
- **Módosítás:**
  - Állapotgép: a 10. él (postázva) és a 11. él (lezárás) nem kéri a
    papír-jelölést. `valtAllapot('postazva')` beírja a papír dátumát is.
  - Szabina mobil: a „Papír” fül helyett **„Posta”** (`/m/posta`): az
    e-mail-elment fuvarok postacímmel, „Feladva ✓” gombbal. A régi
    `/m/papir` ide irányít; a „Számla és posta” fül neve „Számla”.
  - Fuvarozás 2 Elszámolás és részlet: a „Papír megjött/beérkezett” gomb
    kikerült, a „Postázva ✓” feltétel nélkül nyomható.
  - Régi Számla/Posta fül: a csoportok a fotó szerint („Fotóra vár” →
    „Számlázható” → „Postázandó”), a papír-nyugtázó sáv és a „megjött”
    gomb kikerült; a „Papír” oszlop „Fotó” lett.
  - Ma lap és „Következő teendő”: „papír határidő” helyett postázási
    határidő (a partner papír-beküldési napja, amíg nincs feladva).
- **Teszt:** `teszt-allapotgep` 43/0, `teszt-megbizas-szuro` 27/0 (a
  határidőt most a megadott naphoz méri, nem a gép órájához — ezzel a két
  régi, dátumfüggő hiba is megszűnt), `teszt-backfill-allapot` 18/0.

## 2026-09-25 — Fuvarozás 2 megbízások: öt lépés, két gomb

- **Kérés (Budaházi Zoltán):** megérkezik (Gmail „Fuvarmegbízás” címke) →
  megkapja a sofőr → látom → visszaér → számlázás → számlaszám → postázás,
  amit Szabina a mobilján leokéz. A régi út kilenc állapot volt, három
  felesleges kattintással.
- **Kivett kattintások:**
  - „Számlázható (kézi)”: a fotó magától léptet, fotó nélkül pedig a
    számlaszám közvetlenül visz tovább (új él: teljesítve → számlázva).
  - „E-mail elment”: a számlát a Számlázz.hu küldi ki. A 9. él csak a
    régi sorok miatt maradt, gomb nincs hozzá. A kísérő e-mail piszkozata a
    posta-kártyán kibontható, ha egy partner kéri.
  - „Lezárás”: a „Postázva ✓” ugyanabban a tranzakcióban le is zárja a
    fuvart (11. él, feltétel: számla + postázva).
- **Öt lépés** (`LEPESEK`, `lib/fuvarozas/allapot.ts`): Beérkezett, Úton,
  Visszaért — számlázni, Számlázva — postára, Kész. A megbízás-lista
  szűrősávja és jelvénye ezt mutatja; a részleten a pontos állapot a jelvény
  súgójában és a naplóban látszik.
- **Szabina mobil:** a Számla fül a visszaért fuvarokat mutatja (fotóval vagy
  anélkül), számlaszám-mezővel. A Posta fül a számlázottakat mutatja,
  „Feladva ✓” gombbal, és ezzel a fuvar kész.
- **Asztali Elszámolás:** két szakasz maradt, Számlázni és Postára; mellette
  a kintlévőség. A Ma és a Rendszer számlálói ugyanígy számolnak.
- **Tesztek:** teszt-allapotgep 51/0, teszt-megbizas-szuro 26/0; tsc, eslint
  és next build tiszta.

## 2026-09-25 — Számla ↔ megbízás párosítás: nem bukhat el írásmódon

- **Probléma (valós számlákból):** a WLLWR-2026-320 (ÁB Speed, 26/3814)
  párosult, a többi nem:
  - **WLLWR-2026-313, ÁJ-TRANS:** a rendelésszám („ÁJ/2026/09/1279”)
    betűre egyezett a pozíciószámmal. A Számlázz.hu az Á-t `&#193;`-ként
    küldi, és a rendelésszámot nem dekódoltuk (a vevő nevét és a tételeket
    igen).
  - **WLLWR-2026-319, FLOTT-TRANS:** a számlára a Járatszám került
    (260923XX01), a kiolvasás a megbízás sorszámát (2026/01201) vette
    pozíciószámnak.
  - **Hajdúspedíció:** a megbízáson nincs hivatkozási szám.
- **Javítás (Budaházi Zoltán döntése szerint):**
  1. A rendelésszám dekódolva kerül a `szamla` táblába. A korábban
     dekódolatlanul mentetteket a szinkron helyben javítja, újralekérdezés
     nélkül.
  2. A párosítás (`lib/fuvarozas/szamla-parositas.ts`, tiszta modul) a
     megbízás minden számát nézi: pozíciószám, kanonikus hivatkozás, Reise
     ID, referencia. Ékezet, kis-nagybetű, szóköz, perjel és kötőjel nem
     számít. Ha ezek egyike sem egyezik, a megbízás irat-szövegét is nézi,
     ugyanannál a partnernél és csak egyértelmű találatnál.
  3. Tartalék, ha nincs egyező szám: partner + nettó összeg + dátum
     (felrakás −1 nap … lerakás +14 nap) + útvonal (a tétel első és utolsó
     városa a felrakó, illetve a lerakó címében). Mind a négynek egyeznie
     kell, és csak egy-az-egyhez találatot párosít.
  4. Minden párosítás naplózva: `fuvar_megbizas_esemeny` 'szamla_parositva',
     a módjával együtt, és a szerver-naplóban is. A számla-szinkron
     naplósora kiírja a párosítások számát. Az Elszámolás fülön külön
     szakasz mutatja az egyik fuvarhoz sem párosított fuvarszámlákat
     (60 nap).
- **Ellenőrzés:**
  - `scripts/teszt-szamla-parositas.ts`: 16/0, a négy valós esettel.
  - Helyi Postgres-próba: mind a négy fuvar párosult és „Számlázva” lett; a
    második kör 0; a LOGO TREK számla a párosítatlanok között maradt.
  - tsc és next build tiszta.

## 2026-09-25 — Párosítás: útvonal nélküli számla

- **Eset:** a WLLWR-2026-315 (Hajdúspedíció) tétele csak „Közúti
  árufuvarozás”; rendelésszám és útvonal nincs rajta. A partner, az összeg
  (245 000 Ft) és a dátum egyezik a #137-tel.
- **Döntés (Budaházi Zoltán):** A + B.
  - A: a számlára ezután is kerüljön rá az útvonal.
  - B: ha mégsem, a partner + összeg + dátum elég, egyértelmű találatnál.
  - Ha van útvonal a számlán, de nem egyezik, az továbbra is kizárja a párt.
- **Módosítás:** `vanUtvonal()` a `lib/fuvarozas/szamla-parositas.ts`-ben.
  Az új párosítási mód neve `partner_osszeg_datum`, ez kerül a naplóba.
- **Teszt:** teszt-szamla-parositas 20/0, a valós 315-ös számlával.

## 2026-09-25 — A megbízást kísérő levél is beolvasódik (EUCARGO)

- **Eset:** Horváth Olivér (EUCARGO 2008) megbízása (#281). A PDF-ben a
  helyek helyén „RÉSZLETES FELRAKÁSI ADATOKAT KÜLDÖM EMAILBEN” állt, a
  4 felrakó és a 10 lerakó (cím, telefon, tonna) a levélben volt. A rendszer
  csak a PDF-et olvasta: a hely-helyettesítő szöveg lett a felrakó és a
  lerakó, kocsit sem rendelt hozzá, pedig a PDF-ben ott az NMZ-492.
- **Módosítás:**
  - **Gmail-figyelő (`docs/gmail-fuvar-figyelo.gs`):** a megbízásnak
    osztályozott levelek teljes szövegét is beküldi (`/api/fuvarozas2/gmail/torzs`),
    a csatolmány ELŐTT. A `/kert` válaszban új lista: `torzs`. A szkriptet a
    script.google.com-on cserélni kell.
  - **Adatbázis:** `fuvar_level.torzs` / `torzs_at` és
    `fuvar_megbizasok.level_kiegeszitve_at` (008-as migráció).
  - **Beolvasás (`drive-sync-core.ts`):**
    - Ha van kísérő levél, a modell a PDF szövegével együtt kapja, és a
      helyeket a levélből veszi, ha az irat „e-mailben küldöm”-öt ír.
    - Több felrakó is bekerül (pontosvesszővel).
    - Ha a modell nem ad rendszámot, a saját rendszámainkat az irat
      szövegéből keresi.
    - Az „e-mailben küldöm” hely kifogás lesz („ellenőrizendő”).
  - **Új lépés, `levelSzovegPotlasa`:** a már felvett sort újraolvassa, ha
    a levél utólag jön, de csak ha a sofőr/GPS még egyik megállót sem
    érintette. A felrakó/lerakó, a kocsi (ha üres) és a megállók
    újraépülnek.
  - **Sofőr-adatok:** megállónként `rakomany` („2 t 1.fok Titus”), a sofőr
    appja mutatja („Fel: …”, „Le: …”). A megállók felső korlátja 12-ről
    20-ra nőtt.
  - **Partner:** EUCARGO 2008 Kft. (Sárvár postázási cím, 45 nap).
- **Teszt:**
  - teszt-import 106/0 (EUCARGO), teszt-sofor-adatok 37/0 (14 megálló,
    rakomány, több felrakó).
  - Helyi Postgres: a levél-szöveg mentése, a kért-lista és az
    újraolvasandó sor kiválasztása, a frissítés SQL-je.
  - A nyelvi modellt helyben nem lehetett hívni (nincs kulcs).

## 2026-09-25 — Megbízások munkaasztal (egy oldal)

- **Kérés (Budaházi Zoltán):** egy oldal, oldalsávval (folyamatban,
  számlázásra, postára vár, archív), kereséssel (cég, útvonal, rendszám,
  időszak). Jobbra mindig az, amit a kocsi éppen csinál, alatta kicsiben a
  következő fuvarja. Az Elszámolás és a Partnerek fül megszűnik. Az
  archívumnak nincs bontása, a kereső váltja ki.
- **Új oldal (`/fuvarozas2/megbizasok`):**
  - **Oldalsáv:**
    - kereső mindenre (cég, város, rendszám, sofőr, hivatkozás,
      számlaszám, hónapnév, évszám; ékezet és írásjel nélkül is);
    - Mind/Bér/Saját váltó;
    - szakaszok: Beérkezett · Folyamatban, kocsinként bontva és „kocsi
      nélkül” · Számlázásra vár · Postára vár · Archív.
  - **Lista:** megbízó + hivatkozás, első → utolsó város, kocsi, megállók
    száma, számlaszám, a következő teendő, nap, díj, és egy csík a fuvar
    útjáról.
  - **Jobb oszlop:**
    - kocsiváltó (Gergő, Micó);
    - „most ezen dolgozik”: megállónként a cég, a telefon, a rakomány és
      a sofőr „kész” jelölése, kiemelve, hol tart;
    - alatta a következő fuvar.
    - Egy sorra kattintva ugyanitt a részletek nyílnak.
  - **Figyelmeztetés felül:** párosítatlan fuvarszámla sárga sávban.
  - **Régi linkek:** a `?csoport=`, `?allapot=`, `?lepes=` a szakaszokra
    képeződik.
  - **Mobilon** a „kocsi most” kerül előre.
- **Fülsor:** az Elszámolás és a Partnerek fül kikerült, az oldalaik
  linkről elérhetők maradnak. A partner adatai a részletből nyílnak
  (`/fuvarozas2/partnerek?nyit=<id>`).
- **Szabályok:** `lib/fuvarozas2/munkaasztal.ts`. A saját fuvar lerakás
  után archív, a bér a postázás után.
- **Teszt:**
  - teszt-munkaasztal 23/0;
  - helyi dev-szerver, valós-szerű adatokkal: asztali és mobil
    képernyőkép, részlet, keresés („micó szept”), konzolhiba nélkül.
  - tsc, eslint és next build tiszta.

## 2026-09-25 — Saját fuvar előkészítése és „Kocsira adom”

- **Kérés (Budaházi Zoltán):**
  - A saját fuvarokat előre beírja, látni akarja őket, és módosítani
    tudja.
  - Egy gombbal kocsira adja, ha minden biztos. Onnantól olyan, mint egy
    megbízás: megy a sofőrnek.
  - Kötelező: honnan, hová, dátum (amit ő állít be), kocsi. Az áru nem
    kötelező.
- **Megoldás:**
  - **Adatbázis (009-es migráció):** `fuvar_megbizasok.elokeszites`,
    `elokeszites_jarmu`, `kocsira_adva_at`.
  - **Előkészítés alatt a `jarmu` üres,** a kiválasztott kocsi az
    `elokeszites_jarmu`-ban vár. A sofőr appja és a GPS-figyelő a `jarmu`
    szerint válogat, így egyik sem látja a fuvart.
  - **„Kocsira adom”:** beírja a kocsit, újraépíti a megállókat a mostani
    címekből, és naplóz.
  - **„Visszaveszem”:** a kocsira adott fuvart visszaveszi előkészítésbe,
    amíg a sofőr/GPS egyik megállót sem érintette. Módosításhoz kell.
  - **Törlés:** csak előkészítés alatt.
- **Felület (munkaasztal):**
  - „+ Új saját fuvar” gomb az oldalsáv tetején.
  - Az Előkészítés alatt új szakasz: „Előre beírt saját fuvar”.
  - Űrlap a jobb oszlopban. A helyek a telephelyekből (Szakoly, Balkány) és
    a korábbi címekből választhatók, a „Kinek” a partnerekből.
  - A sorban látszik, mi hiányzik még, vagy hogy „kocsira adható”.
  - A tervezett fuvar címkéje „Folyamatban” (nem „Beérkezett”).
- **Teszt:**
  - teszt-munkaasztal 25/0.
  - Helyi böngészős végigjátszás, valódi szerverrel: új → mentés →
    kocsi → Kocsira adom (Micó, 2 megálló) → Visszaveszem (a kocsi lekerül,
    a megállók törlődnek) → új; a napló nem duplikál; konzolhiba nincs.
  - tsc, eslint és next build tiszta.

## 2026-09-25 — Számlázz.hu-s szállítólevél párosítása a saját fuvarhoz

- **Kérés (Budaházi Zoltán):**
  - A Számlázz.hu-ban kiállított szállítólevél kerüljön a saját fuvarhoz:
    vevő, dátum, rendszám alapján.
  - A dátum a fuvaré, amit ő állít be (a szállítólevelet előre állítják
    ki). A saját fuvar lerakás és fotó után az archívba megy.
- **Minta:** S-WLLWR-2026-162 · FABRIKA + 2000 Kft. · 2026.09.23. ·
  „Rendszám:NMZ-492,XZV-926” · Használt EUR Raklap 812 db.
- **Módosítás:**
  - **Számlák modul (`lib/szamlak/poll.ts`):** külön kereső az
    `S-WLLWR-{év}-{n}` sorszámokra (2026-ban a 150-estől).
    - A találat a `szallitolevel_import` táblába kerül, NEM a `szamla`-ba,
      így a számlák és a kintlévőség tiszta marad.
    - A rendszám a megjegyzésből jön; a tételek mennyiségei és a raklap
      darabszám is mentődik.
    - A kliens ehhez a tételek mennyiségét és a megjegyzést is visszaadja.
  - **Párosítás (`lib/fuvarozas2/szallitolevel-parositas.ts`):**
    - rendszám → ugyanaz a saját kocsi;
    - vevő → a „kinek” vagy a „hová” szövegében;
    - a szállítólevél kelte a fuvar napjától legfeljebb 3 nappal tér el;
    - csak egy-az-egyhez párosít, az előkészítés alatti fuvarral is.
    - A fuvar megkapja a szállítólevél számát (`kulso_azonosito`), és ha
      üres, az árut és a darabszámot („812 db”). Naplózva.
  - **Felület:** a listában „szállító S-WLLWR-…”, a részletben
    „Szállítólevél:” sor. A kereső a szállítólevél számára is keres.
  - **Napló:** a számla-szinkron naplósora kiírja: „szállítólevél: N új /
    M párosítva”.
- **Nyitott kérdés:** nem ellenőriztem, hogy a Számlázz.hu Agent
  számla-lekérdezése a szállítólevelet is visszaadja-e. A dokumentáció
  innen nem érhető el. Ha nem adja, a kereső egyszerűen nem talál semmit;
  ezt az éles napló mutatja.
- **Teszt:**
  - teszt-szallitolevel-parositas 14/0, a valós mintával.
  - Helyi Postgres: mentés (ismételve is), párosítás, a második kör 0, a
    fuvar árut és darabszámot kap.
  - tsc, eslint és next build tiszta.

## 2026-09-25 — Saját fuvar: a „kinek” átírása megmarad

- A háttér-szinkron a „kinek” szövegéből partnert köt a fuvarhoz, a felület a
  partner nevét mutatja; a mentés csak a szöveget írta át, így a régi név
  (MTS) visszajött. Ha a „kinek” változik, a mentés eldobja a régi kötést
  (`lib/fuvarozas2/sajat-fuvar.ts`).

## 2026-09-25 — Duvenbeck: fantomsor-hurok, kiegészítő számla, kereső javaslatokkal

- **Duvenbeck-átvilágítás (e-mailek + éles napló):** a 6 Duvenbeck-fuvar
  (Út ID 23235330, 23271836, 23279022, 23288892, 23288876, 23283034) mind
  kiszámlázva (292, 303, 302, 307, 308, 309), a Duvenbeck mindet könyvelte
  (09-22-i „Egyeztetés” levél). A rendszerben viszont a #280 számlázatlan
  Duvenbeck-fuvarként állt: a #79 (23235330, WLLWR-2026-292) duplikátuma.
- **Ok:** a 23235330-as Út ID-t egy törölt sor fogta. A Duvenbeck-olvasó a
  keresésnél kihagyja a törölt sort, a beszúrás viszont az egyedi indexen
  elakadt → `null` → az irat (FRALI1980577_V1.pdf) a nyelvi modellhez ment,
  ami új sort csinált, a következő kör leváltotta — kétóránként, 09-21 és
  09-24 között (#173 … #280).
- **Javítás (`lib/fuvarozas/duvenbeck-import.ts`, `megvanMar`):** ha az Út ID-t
  törölt sor fogja, vagy egy régi, Út ID nélküli sor hordozza a számot
  (pozíciószám/hivatkozás), nem lesz új sor, és a nyelvi modell sem kapja
  meg: az irat a meglévő sorhoz kötődik, a napló kifogást ír. Az
  „Újraolvasás” gomb (`felszabaditFuvarDokumentumot`) elengedi az Út ID-t.
  A sablont fel nem ismerő Duvenbeck-irat továbbra is a nyelvi modellhez megy
  (sablonváltás esetére).
- **Nyitott:** a #280 törlése az élő adatbázisban — kézzel, a felületről.
- **Kiegészítő számla:** `fuvar_megbizasok.kieg_szamla_szamok` (010-es
  migráció). A „… kieg.” / „pótdíj” / „pótlás” rendelésszámú számla a „kieg.”
  előtti szám + a vevő szerint a már kiszámlázott fuvarhoz kerül
  (`parositKiegSzamlakat`), a fő párosításba nem. Valós eset: WLLWR-2026-316
  (Ghibli, N26/22824, +250 € kiállási díj) → #135 (fő számla WLLWR-2026-310).
  Lista, részlet, kereső mutatja; a párosítatlan sávból lekerül.
- **Kereső javaslatokkal** (`components/fuvarozas2/kereso-javaslatok.tsx`):
  gépelés közben fuvarok (kattintásra megnyílik), cégek, városok, kocsik,
  számok és hónap; nyilakkal és Enterrel is. A szerver egyszer adja az
  indexet (`getMunkaasztal` → `kereso`), a böngésző ebből válogat.
- Tesztek: teszt-szamla-parositas 31/0, teszt-munkaasztal 33/0; helyi
  Postgres: a Duvenbeck-hurok a régi kóddal előáll, az újjal nem; a
  kiegészítő számla párosul, a második kör 0. Böngészőben (asztal + mobil) a
  javaslatok, a kiválasztás és az Enter működik.

## 2026-09-25 — Megbízás törlése a részletekből

- Az új Megbízások oldal részleteiben nem volt Törlés. Most van („Fuvar
  törlése”, megerősítő kérdéssel): `statusz = 'torolt'` + `torolt_at`/`torolt_by`
  + „torolve” napló (`torolMegbizast`). Számlázott fuvart (fő vagy
  kiegészítő számla) nem enged törölni.

## 2026-09-25 — Gmail-figyelő lecserélve; a levél-újraolvasás csak számlázatlan fuvarhoz

- A szkriptcsere után (19:13) beérkezett a megbízás-levelek teljes szövege; a
  20:02-es körben a #281 (EUCARGO, Olivér) 14 megállót kapott a levélből.
- Ugyanebben a körben a régi, kiszámlázott és postázott #151 és #152 is
  újraolvasódott. A `levelSzovegPotlasa` mostantól csak számla nélküli, nem
  postázott, nem számlázott állapotú fuvarhoz nyúl.

## 2026-09-26 — Beépített segéd a Megbízások oldalon (1. rész)

- A jobb oldali kocsi-panel helyén (Budaházi Zoltán: „ez a rész nem kell”)
  csevegő segéd, csak adminnak. Mobilon összecsukva indul.
- **Eszközök** (`lib/fuvarozas2/seged/eszkozok.ts`, csak olvasnak, a meglévő
  jogosultság-ellenőrzött függvényeket hívják): fuvarkeresés, fuvar részletei,
  mai/holnapi fuvarok + teendők, heti terv (üres napok, 56 órás keret),
  kalkuláció (HU-GO + önköltség + ajánlat-sávok), élő GPS, partner, levelek,
  levél teljes szövege, párosítatlan számlák, tudás-javaslat.
- **Tudás** (`lib/fuvarozas2/seged/szakmai-tudas.ts`): a cég (kocsik,
  telephelyek a törzsből, a fordított bér/saját elnevezés, a fuvar útja,
  költségek) és szakmai alapok (561/2006 vezetési-pihenőidő, hétvégi
  korlátozás, sebesség, HU-GO, raklap/LDM/pótkocsi, CMR, ADR, tervezési
  szempontok).
- **Tanulás**: a modell `tudas_javaslat`-ot tesz, Zoltán „Megjegyzem”-mel
  jóváhagyja (`seged_tudas`, 011-es migráció); a szabályok minden válasz előtt
  a modell elé kerülnek, listázhatók, kézzel is felvehetők, törölhetők.
  A beszélgetés felhasználónként megmarad (`seged_uzenet`).
- Modell: OpenRouter, `OPENROUTER_SEGED_MODEL` (alap: google/gemini-2.5-flash).
- Teszt: helyi ál-modellel (OPENROUTER_BASE_URL) böngészőben — eszközhívás,
  válasz fuvarlinkkel, tanulás-jóváhagyás, megmaradás újratöltés után, új
  beszélgetés, mobil nyit/csuk; mind a 11 eszköz lefut a helyi adatbázison.

## 2026-09-26 — Saját fuvar: a beragadt partner-kötés is felszabadul

- Az MTS → Fabrika 2000 Kft átírás a 09-25-i javítás után is MTS maradt. Ok:
  a javítás előtti mentés a szöveget már Fabrikára írta, de a kötés az MTS-en
  maradt; a javítás csak akkor bontott, ha a szöveg VÁLTOZIK, így ez a sor
  sosem gyógyult meg.
- Most a mentés (`lib/fuvarozas2/sajat-fuvar.ts` `mentSajatFuvart`) azt nézi,
  hogy a kötött partner kulcsa (`normalizaltCegKulcs`) a beírt névé-e; ha nem,
  bontja, és rögtön (`frissitsdFuvarozas2Modellt`) a beírt névhez köt.
  Érintetlen „kinek” mellett a kötés marad.
- Helyben, böngészőben ellenőrizve a beragadt állapotból (szöveg Fabrika,
  kötés MTS): mentés után Fabrika 2000 Kft; megjegyzés-módosításnál a kötés
  változatlan.

## 2026-09-26 — Saját fuvar: „Kitől” mező

- Budaházi Zoltán kérése: a saját fuvaron a „Kinek” mellé „Kitől” is (ki adja
  az árut). Csak saját fuvarra.
- Új oszlop: `fuvar_megbizasok.kitol` (012-es migráció), csak szöveg — nem köt
  partnerhez, így nem ugorhat vissza, mint a „kinek” (MTS).
- Űrlap (`sajat-fuvar-urlap.tsx`): „Kitől (nem kötelező)” a „Kinek” fölött, a
  partnerlistát ajánlja. Lista és kereső-javaslat: „Kitől → Kinek”; a részleteknél
  „Kitől:” sor; a kereső a kitől-cégre is talál (cégek közt is).
- A sofőr appja nem mutatja.
- Teszt: `scripts/teszt-munkaasztal.ts` 34/0; helyben böngészőben: mentés,
  újratöltés, új fuvar kitől-lel, lista, kereső-javaslat.

## 2026-09-26 — Sofőr app: a „Holnap” fül a következő munkanapot mutatja

- Szombaton a sofőrök nem látták a hétfői fuvart: az app csak „Ma” és
  „Holnap” (= vasárnap) napot mutatott.
- Most a `/m/holnap` a következő munkanapot mutatja (`kovetkezoMunkanapISO`,
  `lib/fuvarozas/idozona.ts`): pénteken és szombaton a hétfőt, a fül felirata
  és a címsor ilyenkor „Hétfő”. Ünnepnapot nem ismer.
- A fül átnevezése a kliens fülsávban (`MTabbar` `holnapFelirat`): a
  `SOFOR_TABOK` kliens-modulból jön, szerveren nem módosítható.
- Teszt: a dátum-segéd hét esettel (hét közben, péntek, szombat, vasárnap,
  hónap- és évváltás); helyben sofőrfiókkal böngészőben a „Hétfő” fül a
  hétfői fuvart mutatja, a „Ma” fül változatlan.

## 2026-09-26 — A segéd cselekedni is tud (2. rész), jóváhagyással

- Budaházi Zoltán: a segéd ne csak mondja, tegye is. Elv: a modell **soha nem
  ír** — művelet-eszközt hív (`javasol_*`), abból javaslat lesz
  (`seged_muvelet`, 013-as migráció), és csak a „Jóváhagyom” gombra fut le.
- **Műveletek** (`lib/fuvarozas2/seged/muveletek.ts`, mind egy meglévő,
  jogosultság-ellenőrzött függvényt hív, saját UPDATE nincs): állapotváltás
  (`valtAllapot`), papír beérkezett (`setPapirBeerkezett`), számlaszám
  (`setSzamlaSzam`), megjegyzés hozzáírása/cseréje (`setMegjegyzes`), saját
  fuvar előkészítése (`mentSajatFuvart`), kocsira adás (`kocsiraAdom`), levél
  állapota/osztálya (`setLevelAllapot`, `setLevelOsztaly`), partner-adat
  (`updatePartner`: fizetési és papír-határidő, postázási cím, számlázási
  e-mail, megjegyzés). Megbízás törlését a segéd nem javasolhat.
- **Korlátok**: jóváhagyás nélkül semmi nem fut; egy jóváhagyás egy művelet;
  válaszonként legfeljebb 3 javaslat; az állapotváltást az állapotgép szűri
  (`getMegbizas().celok`) — kézi kiskapu (`kezi`) a segédnek nincs;
  végrehajtás előtt ellenőrző pillanatkép (a fuvar állapota / előkészítése, a
  levél állapota) — ha közben megváltozott, elmarad és szól; a javaslatot csak
  az hagyhatja jóvá, akinek a segédje tette; „Új beszélgetés” a váró
  javaslatokat elveti.
- A levél szövege **adat, nem utasítás**: ha a modell a körben levélszöveget
  olvasott, a kártyán ott a „levél szövegéből” jelzés; a rendszerutasítás
  kimondja, hogy műveletet csak Zoltán kérése indíthat, és hogy sosem írhatja
  azt, hogy „megtettem”.
- Felület: „Ezt fogom tenni” kártya (összefoglaló, Jóváhagyom / Elvetem),
  végrehajtás után `router.refresh()`, és „Mit tett” — az utolsó 10 művelet
  eredménnyel. Minden javaslat és döntés naplózva (`seged_muvelet`), a
  tényleges változás a szokásos helyen (`fuvar_megbizas_esemeny`).
- Ellenőrzés: `npx tsc --noEmit`, eslint az érintett fájlokra, `next build` —
  mind hibátlan. **Böngészőben nem futott le**: ezen a gépen nincs helyi
  Postgres (és Docker/brew sem), ál-modellel sem tudtam elindítani — a
  jóváhagyás→végrehajtás kört éles/staging adatbázison kell végigpróbálni.

## 2026-09-26 — A régi sofőr-nézet (/erkezes) is a következő munkanapot mutatja

- A #234 után Gergő továbbra sem látott semmit: a sofőrök nem az /m appot,
  hanem a régi dolgozói oldalt (/erkezes → Fuvarok) használják, és annak
  saját „Holnap” előnézete (`components/erkezes/sofor-fuvar-nap.tsx`) még a
  naptári másnapot kérdezte.
- Most ez is `kovetkezoMunkanapISO`: pénteken és szombaton a hétfő első
  fuvarja jelenik meg „Hétfő” címkével a „Mára nincs fuvarod” alatt.
- Teszt: helyben Gergőhöz kötött sofőrfiókkal, szombaton: „Mára nincs
  fuvarod.” + „HÉTFŐ · … Biharkeresztes → Szentendre”.

## 2026-09-27 — Sofőr: a megállók telefonszáma hívható, 06-tal

- Micó holnapi, sok fel- és lerakós fuvarján a levélből jött számok 06
  nélkül álltak („30 123 4567”), és az előnézetben csak szövegként — a
  telefon nem tudta hívni őket.
- `kontaktTelefon` (`lib/fuvarozas/sofor-adatok.ts`): előhívó nélküli
  belföldi szám (8–9 jegy, nem 0-val kezdődik) elé 06 kerül; a 36-tal kezdődő
  11 jegyű +36 lesz; a 06-os és +36-os marad.
- A régi sofőr-nézet (`/erkezes` → Fuvarok) következő/holnapi előnézetében a
  megállók kontaktja is hívható link lett („név · 06…”), nem csak az aktuális
  megállóé.
- Teszt: `scripts/teszt-sofor-adatok.mts` 43/0 (6 új eset); helyben
  sofőrfiókkal a holnapi előnézetben mindkét kontakt `tel:06…` link.

## 2026-09-26 — A segéd okosítása (a 2. rész után, éles próba alapján)

Budaházi Zoltán kipróbálta a cselekvő segédet („nagyon buta”). A prod
beszélgetést kiolvasva négy konkrét ok látszott — a gépezet (javaslat →
jóváhagyás → végrehajtás → napló) hibátlanul működött, a modell tudása volt
rossz, és egy művelet hiányzott:

- **Ellentmondott magának**, mert az eszköz egyszerre adta vissza az
  `allapot`-ot és a `szakasz`-t: „már folyamatban van” (miközben tervezett
  volt, csak a Folyamatban fülön áll). Most az `allapot` magyar címkével megy
  (`ALLAPOT_CIMKE` átkerült a `lib/fuvarozas/allapot.ts`-be, egy forrás a
  felülettel), a szakasz neve `lista_ful`, és a rendszerutasítás kimondja,
  hogy a kettő nem ugyanaz.
- **Nevet költött a rendszámhoz** („Micó viszi”): a #281 sofőr mezőjében
  `N M Z - 4 9 2 , X Z V - 9 2 6` áll. Az eszköz ezt mostantól nem sofőrként
  adja át, hanem `sofor_megjegyzes`-ben jelzi, hogy ez rendszám.
  A `kocsi: null` helyett kiírja: „NINCS kocsi hozzárendelve”.
- **Keresés helyett visszakérdezett** a cégnévre. A rendszerutasítás: cégnév,
  város, rendszám, számlaszám, hónap → először `keres_fuvarok`.
- **Nem tudott kocsit adni a fuvarnak** — pedig pont ez kellett. Új, szűk
  függvény: `setFuvarJarmu` (csak a Kocsi mező + kulcs-újraépítés + napló; a
  régi `approveFuvar` az egész sort újraírta), és rá a `javasol_kocsi`
  művelet. Előkészítés alatti saját fuvart nem bánt.
- **Modell**: az alap a `google/gemini-2.5-flash` helyett
  `anthropic/claude-sonnet-5`, rövid gondolkodással;
  `OPENROUTER_SEGED_MODEL`-lel továbbra is cserélhető.

Az ok, amiért a #281 kocsi nélkül állt, nem a segéd: a beolvasás a rendszámot
karakterenként, szóközökkel a sofőr mezőbe írta. A `findJarmuInSzoveg` most a
szóközök összehúzása után is felismeri (csak PONTOS rendszám-egyezéssel, két
különböző kocsi esetén nem tippel), és egy egyszeri migrációs lépés
(`potoldSzetszortRendszamKocsitOnce`) a már felvett sorokat is pótolja.

Teszt: új `scripts/teszt-rendszam.ts` (8 eset, a `npm run teszt` része) — a
teljes készlet 0 hibával fut; `tsc --noEmit`, eslint, `next build` rendben.
Böngészőben itt sem futott (nincs helyi Postgres) — a segéd okosodását éles
kérdésekkel kell megnézni.

## 2026-09-28 — Ma oldal: négy kocsi-oszlop

- Budaházi Zoltán: a Ma oldal legyen átlátható, négy kocsira, minden
  szükséges infóval (a javasolt vázlat „pont így”).
- Elrendezés (`components/fuvarozas2/ma-vaszon.tsx`): fent eltérés-sáv csak ha
  van (egyébként egy zöld sor); középen négy egyforma kocsi-oszlop
  (asztalon egymás mellett, telefonon egymás alatt, `<details>`-szel
  összecsukható); alul „Kocsi nélkül” és „Iroda és holnap”. A hat
  számcsempe és a Rendszer-doboz megszűnt (a számok az iroda-dobozban, a
  rendszer a Rendszer fülön).
- Kocsi-oszlop sorrendje: fejléc (sofőr, rendszám, GPS: megy X km/h / áll
  N perce / nem jelez, hely) → vezetés ma / 9 óra, szünet, szolgálat, heti
  óra / 56, napi km (GPS-becslés) → Most (az első nem kész mai megálló:
  hányadik, cég, cím, ablak, várakozás/késés színnel, ETA, hívható kontakt)
  → Ma (fuvarok, megállók pipával; 6 megálló felett összecsukva) → Holnap
  / pénteken-szombaton Hétfő (`kovetkezoMunkanapISO`) → Papír/számla (csak
  ha hiányzik). Üres napnál „keress fuvart” link a Tervezésre.
- `lib/fuvarozas2/ma-vaszon.ts`: minden aktív kocsi (a GPS nélküli „még nem
  üzemel”), 4 oszlopra kiegészítve „N. kocsi — még nincs beállítva”
  helykitöltővel; heti vezetési perc az Ecofleet heti útjelentéséből, 10
  percig gyorsítótárazva; kocsinkénti fotó/számlázandó (30 nap).
- Teszt: helyben böngészőben asztalon és telefonon, próbaadatokkal (Gergő
  2 megálló, Micó 8 megállós túra várakozással, holnapi és kocsi nélküli
  fuvar). A GPS-fejléc és a heti óra helyben nem próbálható (nincs Ecofleet-kulcs).

## 2026-09-28 — Sofőr fuvarlevél-fotó: az adatbázisba, nem a Drive-ra

- A sofőrök nem tudtak fotót küldeni a papírokról; a telefonon „Minified
  React error #441” jelent meg (a szerver-akció hibájának éles, rejtett
  alakja). A szervernaplóban minden próbálkozás (09-24 óta, a napló eleje)
  ugyanazzal bukott: Google Drive 403 „Service Accounts do not have storage
  quota”. A service account nem tud saját fájlt létrehozni egy magán-Drive
  mappában, megosztott meghajtó pedig csak Workspace-szel van — a
  fotófeltöltés soha nem működött.
- Most a fotó a `fuvar_dokumentumok`-ba kerül (`tarolas = 'db'`, új
  `tartalom bytea` + `mime_type`, 014-es migráció); a `dokumentum_url` a
  saját kiszolgálónkra mutat. A `/api/fuvarozas/dokumentum/[dokId]` a 'db'
  tárolásút az adatbázisból adja ki, a többit továbbra is a Drive-ról.
- A halott Drive-feltöltő (`feltoltFuvarlevelFotot`) törölve.
- Teszt: helyben sofőrfiókkal a /erkezes → Fuvarok „Fuvarlevél fotó”
  gombjával feltöltve: a sor létrejött (db, image/png, 9,9 KB, Vadon Gergő),
  a letöltő-cím 200-zal adja vissza, a fuvar „számlázható” lett (003
  trigger).

## 2026-09-28 — Többoldalas fuvarlevél-fotó + PDF

- Budaházi Zoltán: „az okmányok több oldalasak, akár 10 vagy több … kell pdf”.
  Eddig az első fotó után a „Fotózd le” kártya eltűnt, több oldalt nem lehetett
  hozzáadni.
- Sofőr (régi dolgozói nézet `/erkezes` és az `/m` app): a kártya az első
  kép után is kint marad („✓ N oldal feltöltve”), gombok: „+ Még egy oldal”
  (kamera), „Több kép a fotótárból” (több kép egyszerre), „Kész, ez minden”
  (eltünteti; saját fuvarnál fotó nélkül „Nem kaptam”). Az oldalak egyenként,
  kicsinyítve mennek fel („Feltöltés 3/10…”); egy elakadt oldal nem viszi a
  többit. Közös segéd: `lib/fuvarozas/fuvarlevel-feltoltes.ts`.
- Az /m appban a „Megbízás PDF” gomb a megbízás iratát nyitja, nem az első
  dokumentumot (ami már fotó is lehet).
- Iroda: `/api/fuvarozas/fuvarlevel-pdf/[fuvarId]` — a fuvar összes
  fuvarlevél-oldala egy PDF-ben, feltöltési sorrendben, A4 (fekvő képhez
  fekvő lap), mindig a pillanatnyi oldalakból (`pdf-lib`). A Megbízások
  részleteinél „Fuvarlevél PDF (N oldal)” gomb, az oldalak „Fuvarlevél
  1/N…” sorszámmal; a régi Fuvarozás „fotó (N)” linkje több oldalnál a PDF.
- Teszt: helyben sofőrfiókkal /erkezes: 1 kamera + 2 fotótár-kép (egy
  2400×1800-as → JPEG-re kicsinyítve), a kártya végig kint, „Kész” után
  eltűnik; a PDF 3 oldal (842×595, 595×842, 842×595). /m: 2 kép a
  fotótárból, 3 → 5 oldal.

## 2026-09-28 — Ma oldal: a kocsi-oszlop „tükörben”, a GPS-állások a helyükön

- Budaházi Zoltán: a lap tetején lévő „nem tervezett állás” sáv „nem jó így”,
  épüljön be a helyére, és kocsinként legyenek átláthatóbbak a megbízások.
  20 tervből a 18-ast (Tükör) választotta.
- Kocsi-oszlop „Ma” része (`components/fuvarozas2/ma-vaszon.tsx` `Tukor`):
  középen a lépcső (pont + vonal), balra a TERV (város, fel/le, ablak, más
  napra a nap neve), jobbra a TÉNY (GPS/sofőr idő ✓, „ott … óta”, ETA) és az
  eltérés-címke („ablakban”, „+18 p”, „késik …”, „+35 p várható”). A mostani
  / következő megállónál cég és hívható kontakt.
- A GPS nem tervezett állása kikerült a felső eltérés-sávból, a kocsi
  oszlopába került (`lib/fuvarozas2/ma-tukor.ts` `tukorSorok`, tiszta
  függvény): ha egy GPS-érkezés nélküli megálló városában volt (a cím nincs
  pontosan meg — Micó: Polgár, Pap tanya; Gergő: Budapest, Sörgyár u.), a
  megállónál jelenik meg „Ez a hely” gombbal; egyébként külön borostyán sor,
  időrendben a helyén, bal (terv) oldal nélkül.
- „Ez a hely” (`rogzitAllasMegalloHelyekent`): a GPS-állás koordinátáját a
  megálló címéhez írja (`fuvar_helyszin_koordinata`, forrás „diszpecser”) —
  ugyanaz a szótár, amit a sofőr „Rossz a cím? Itt vagyok” gombja ír —, így a
  GPS legközelebb felismeri, és nem jelez hamis állást.
- Teszt: `scripts/teszt-ma-tukor.ts` 10/0 (a 09-28-i Gergő- és Micó-nap,
  köztes állás, két állás ugyanoda); helyben böngészőben a tükör-oszlop.

## 2026-09-29 — Micó EUCARGO-fuvarja (#281): a nap aktualizálása + korábbi lerakás felismerése

- **Összevetés:** Horváth Olivér 09-25-i levele (4 felrakó, 10 lerakó, útvonal-
  sorrenddel) és a rendszer: mind a 14 megálló megvan, de a lerakók össze
  voltak keverve, és a GPS szerint Jászberény (09-28 15:54), Farmos (16:47)
  és Galgamácsa (09-28 19:03-tól, reggel lerakva) megvolt, a rendszerben
  mégis nyitottként álltak.
- **Egyszeri javítás (`aktualizaldMicoEucargoNapjatOnce`, migrate.mjs):** a
  lerakók a levél sorrendjében (Hejőpapi, Jászberény, Farmos, Galgamácsa,
  Ete ×2, Császár, Bakonycsernye, Nagyalásony, Mezőlak) — a sorrend három
  helyen él, együtt mozog: `lerako` szöveg, `fuvar_megallok.sorszam`,
  `fuvar_megallo_allapot.megallo_index`. A három megálló kész a GPS szerinti
  idővel; hat hely koordinátája (Polgár, Palotás, Hejőpapi, Jászberény,
  Farmos, Galgamácsa) a kocsi tényleges állásából a helyszín-szótárba.
  Csak akkor ír, ha a fuvar pontosan a várt régi állapotban van.
- **Hibajavítás (`jelolMegallokat`):** a csak napra szóló lerakó-ablak (nincs
  megadott lerakási ablak) a fuvar első GPS-felrakásáig előrejön — a tervezett
  nap előtt lerakott megálló így is kész lesz, a rakodás előtti ottlét (az
  ingázó kocsi esete, #128) továbbra sem számít. Megadott ablaknál nincs
  tágítás. `scripts/teszt-erintes.mts`: 70/0.

## 2026-09-29 — Flexlog megbízása RBT-ként jött be: a partnerfelismerés javítása

- **Ok:** az RBT ujjlenyomatában a `SpedINFORM` programnév is szerepelt — a
  fájl saját szabálya szerint szoftvernév nem lehet ujjlenyomat. A Flexlog
  Kft. is SpedINFORM-mal ír (poz. F26 / 3682 / 4173), így az irata RBT
  EUROPE megrendelőt kapott.
- **Javítás (`lib/fuvarozas/import/partnerek.ts`):** a SpedINFORM kikerült az
  RBT ujjlenyomatából; új partner: Flexlog Kft. (`flexlog.hu`, „FLEXLOG
  KFT”, 30 nap, „Poz.számunk”, a szerződéses rész levágása). Teszt:
  `scripts/teszt-import.mts` 107/0.
- Ugyanez a hiba a Trans-Sped bejegyzésében: az „InnoManagement” programnév
  is kikerült az ujjlenyomatból. Teszt: 108/0.
- A már felvett 4173-as sor megrendelője még RBT — a felületen kell átírni.

## 2026-09-29 — Ma oldal: a kocsi fuvarjai a valós sorrendben

- **Hiba:** Gergő oszlopában a saját fuvar (#275, Szigetszentmiklós →
  Tompaládony) a bér fuvar (#284, RBT, Téglás → Budapest) ELŐTT állt, pedig
  az RBT-t már felrakta, a saját csak utána jön. A lista dátum + sorszám
  szerint rendezett, a két fuvar egy napra esett, a #275 kisebb sorszámú.
- **Javítás (`lib/fuvarozas2/ma-tukor.ts` `fuvarSorrend`):** előbb a már
  elkezdett fuvarok (GPS-érkezés / kész jelölés) a legkorábbi tényük szerint,
  utánuk a többi a tervezett idejük szerint — ugyanaz az elv, mint a sofőr
  telefonján és a GPS lapon. Teszt: `scripts/teszt-ma-tukor.ts` 12/0.

## 2026-09-29 — Sztornózott számla helyére az új számla (Huncargo 325, Lösung 328)

- **Hiba:** a Megbízások oldal „2 fuvarszámla nincs fuvarhoz párosítva”
  sávja a WLLWR-2026-325-öt (Huncargo) és a -328-at (Lösung Trans) mutatta.
  Mindkét partner hibás teljesítési dátum miatt sztornót és új számlát kért
  (09-28): a régi számla sztornózva, a fuvaron viszont a RÉGI szám maradt, és
  a párosító (`szinkronizalSzamlaSzamokat`) csak a számla nélküli fuvarokat
  nézte — az új számla így sehova nem került.
- **Javítás (`lib/fuvarozas/megbizasok.ts`):** a sztornózott számlaszámú fuvar
  a párosításban számla nélkülinek számít, az új számla a sztornózott helyére
  kerül (esemény: `sztornozott_elozo`, napló: „a sztornózott … helyett”).
  Egy érvényes számlát nem ír felül. A két mostani eset a következő
  számla-szinkronnál (15 percenként) magától rendbe jön.

## 2026-09-29 — Élő ETA: a már elkezdett fuvar megállói jönnek előbb

- **Hiba:** Gergő ETA-ja a MERKAPT-hoz (Budapest X, #284) 20:50-et mutatott,
  pedig 11:37-kor Mezőkövesdnél járt, ~13:00-ra ér oda. Az ETA-lánc
  (`lancoltEloBecsles`) a hátralévő pontokat fuvartól függetlenül a statikus
  becslés szerint fűzte fel: a később jövő saját fuvar (#275) korai statikus
  idejű pontjai (Szigetszentmiklós → Tompaládony) a budapesti lerakó ELÉ
  kerültek.
- **Javítás (`lib/fuvarozas/idovonal.ts` `eloLancSorrend`):** a lánc fuvaronként
  egyben, útvonal-sorrendben halad; elöl a már elkezdett fuvar, utána a többi
  a legkorábbi hátralévő tervezett idő szerint, a nap végére sorolt a végén.
  Teszt: `scripts/teszt-erintes.mts` 71/0.

## 2026-09-29 — Micó Etén: „ott 09:50 óta”, rossz cég, rossz „most”

Három hiba Micó oszlopában (Ete, Ady u., 11:54-től áll ott):
- **„ott 09:50 óta” — két órával korábbi érkezés** (`idovonal.ts`
  `kiegesziteloAllapottal`): a Galgamácsáról induló trip órákig nem zárult le,
  az érkezést a 07:39-es utolsó lezárt pontból becsült menetidő adta (09:50),
  és a megfigyelés helyett ez nyert — ez került a GPS-naplóba is (a várakozás
  2 órával hosszabbnak látszott). Mostantól ha egy megfigyelés később is úton
  látta a kocsit, az érkezés legkorábban onnan számít. Megfigyelés nélkül
  marad a becslés (Nyírjákó-eset). Teszt: `teszt-erintes.mts` 73/0.
- **„Mácsa 99 Kft.” az etei lerakónál** (`sofor-adatok.ts`
  `megalloReszlete`): két azonos városú lerakónál a sorszám döntött, ami a
  reggeli átrendezés után elcsúszott — mostantól az utca/házszám dönt.
  Teszt: `teszt-sofor-adatok.mts` 45/0.
- **A valódi „most” szürke, az ETA rossz megállón** (`ma-tukor.ts`): „most”
  az a megálló, ahol a kocsi GPS szerint áll, akkor is, ha előtte egy másik
  még nyitott; az ETA csak a célja szerinti megállón jelenik meg.
  Teszt: `teszt-ma-tukor.ts` 14/0.

## 2026-09-29 — Ma oldal: tömör fejléc + üres csempesor

Budaházi Zoltán a 8 látványtervből az 1-est választotta, üres csempékkel.

- A cím a fülsorba került (`Fuvarozas2Fulek` új `cim` propja), az alcím kimaradt.
- A zöld „Minden terv szerint megy” sáv helyén 10 üres, sorszámozott csempe
  (`CSEMPE_HELYEK` a `components/fuvarozas2/ma-vaszon.tsx`-ben): asztalon egy
  sorban 10, közepes szélességen 5-ösével, telefonon oldalra húzható sor.
- Az eltérés-sáv megmaradt: ha van késés/várakozás/levél, a csempék alatt
  ugyanúgy megjelenik.
- Következő: sorban funkció a csempéknek (a hely kitöltése = a tömb elemének
  cseréje `{ cimke, ertek, also?, szin, href? }`-re).

## 2026-09-29 — Ma oldal, 1. csempe: havi bérfuvar kocsinként (D terv)

- Felül zöld fejlécben a hónap bérfuvarjainak nettó díja (Ft), alatta külön
  „+ … €” — az euró nincs átváltva.
- Alatta kocsinként: név, összeg, csík a kocsi színében (Gergő kék, Micó
  sárga, Jani zöld; a 4. hely szürke „—”). A csík hossza csak a forintos részt
  mutatja.
- Szabály: az a fuvar számít a hónapba, amelyik első felrakása (`m.datum`) ebben
  a hónapban van és legkésőbb ma kezdődött; előző havi megbízás e havi
  lerakása nem. Ellenőrzésre váró import és törölt megbízás nem számít.
- Kód: `BerHavi` a `lib/fuvarozas2/ma-vaszon.ts`-ben, `BerHaviCsempe` a
  `components/fuvarozas2/ma-vaszon.tsx`-ben. A 2–10. hely még üres.

## 2026-09-29 — Ma oldal: alacsonyabb bérfuvar-csempe + 2. csempe heti nézetben

- Az 1. csempe alacsonyabb: egy sor a fejléc (címke, Ft, „+ … €”), kocsinként
  egyetlen sor (név · csík · összeg; ha van euró is, „+€” jel, az összeg a
  súgóban).
- 2. csempe: ugyanez a hétre (hétfőtől máig, ISO-hét, pl. „40. hét”), ugyanazzal
  a szabállyal (első felrakás a héten, legkésőbb ma).
- `BerHavi` → `BerOsszesito` (`cim` mező), `berHeti` a `MaVaszon`-ban.

## 2026-09-29 — Ma oldal: a havi bérfuvar-csempe lenyitható hetekre

- Az 1. csempére kattintva alatta lenyílik egy sor: a hónap hetei, ugyanolyan
  bérfuvar-csempékben („39. hét · 21–27.”). A hetek a hónapba eső napokra
  vannak vágva, így az összegük kiadja a havit (szeptember: 5 hét, mert 1-je
  kedd; február 2027: 4).
- Ugyanaz a szabály (első felrakás az időszakban, legkésőbb ma); a még el nem
  kezdődött hét „—”.
- A csempesor külön kliens-komponens lett: `components/fuvarozas2/csempesor.tsx`.
- Mellette: a heti csempe számainak magyarázatához csak olvasó napló a
  `scripts/migrate.mjs`-ben (`naplozBerCsempeHetet`, #250).

## 2026-09-29 — Ma oldal, 3. csempe: havi átlag km-díj (rakott km)

- Km-díj = a hónapban kezdett díjas bérfuvarok díja ÷ rakott km-jük
  (összegek hányadosa, nem fuvaronkénti átlag). Felül a flotta, alatta
  kocsinként; EUR fuvar külön €/km, nem váltjuk át. „N fuvar még km nélkül”,
  ha van díjas fuvar km nélkül.
- Rakott km: felrakó → megállók → utolsó lerakó, HU-GO útvonaltervező
  (J5, EURO6, 40 t — mint a Kalkulátor). Új oszlopok: `rakott_km`,
  `rakott_km_kulcs` (az útvonal szövege, változáskor újraszámol),
  `rakott_km_hiba`. Háttérben, óránként (`modell-szinkron-scheduler` →
  `lib/fuvarozas2/rakott-km.ts`), az előző hónap elejétől, körönként max 30.
- Végleges hiba (nem található cím, nincs útvonal) → `rakott_km_hiba`, nem
  próbálja újra, amíg az útvonal nem változik; átmeneti (hálózat, 429/5xx) →
  a kör megáll, a következő újrapróbálja. Szándékosan nem a
  `geokodolCachelve`-t használja, mert az a hálózati hibát is „nincs
  találat”-nak veszi.
- Helyben kamu szolgáltatással tesztelve (5 eset); a valódi útvonaltervező a
  fejlesztői gépről nem érhető el (proxy), élesben még nem látott.

## 2026-09-29 — Rakott km: ha a cím nem található, a település szerint

- Élesben az első kör 28 fuvart kiszámolt, 2 zavaros cím miatt elbukott
  (#225 „1. Szállítólevél szerint - Debrecen GLOBUS …”, #149 „EMSR
  Tiszaújváros TVK-Ipartelep …”). Most ilyenkor a `varosNev` szerinti
  településre esik vissza (pár km pontatlanság).
- Új hibaszöveg: „nem található cím (településsel sem): …”; a régi „nem
  található cím” hibás sorokat egyszer újrapróbálja.
- Utána #76 („Nyírjákó (Baromfi-Coop Kft.)”) bukott el: a zárójeles cégnév
  miatt a `varosNev` az egész szöveget adta. A visszaesés előtt a zárójeles
  rész lekerül; a hibaszöveg „nem található cím (település szerint sem):”
  lett, így az eddigi hibás sorokat egyszer újra megpróbálja.

## 2026-09-29 — A Megbízások oldal segédje megszűnt

- Budaházi Zoltán kérésére kikerült a beépített segéd (#231, 2. rész): nem
  hozta azt, amiért készült. Törölve: `lib/fuvarozas2/seged/`,
  `components/fuvarozas2/seged.tsx`.
- A jobb oldali panelen újra a „Kocsi most” (`KocsiMostPanel`, `getKocsiMost`)
  van, ahogy a segéd előtt; a „← vissza a kocsihoz” link is visszaállt.
- A `seged_tudas`, `seged_uzenet`, `seged_muvelet` táblák (011, 013-as
  migráció) és adataik megmaradtak, a kód nem használja őket; eldobásuk
  külön döntés.

## 2026-09-29 — Megbízások oldal: átnézés utáni rendbetétel

- **Jogosultság a részleteknél:** a „Megjegyzés → Ment” és a „Fuvar törlése”
  szerver-akciója (`setMegjegyzes`, `torolMegbizast`) csak a Fuvarozás
  szerkesztőjét engedi, a részlet viszont az elszámolás-joggal is
  szerkeszthetőnek mutatta őket — kattintásra kezeletlen kivétel lett
  hibaüzenet helyett. A `MegbizasReszlet` új `fuvarozasJog` propot kap: e
  nélkül a megjegyzés csak olvasható, a törlés-link nem látszik. Mindkét hívás
  hibája toast-ként jelenik meg.
- **Útcsík:** ha egy saját fuvar a saját útján kívüli szakaszban áll (a régi
  modellből „számlázható” vagy „ellenőrzésre vár”), a csík a bér útját
  rajzolja (`utSzakaszai(jelleg, szakasz)`); eddig egyik szakasz sem volt
  kiemelve. Teszt: `scripts/teszt-munkaasztal.ts`.
- **Halott kód törölve** (a munkaasztal előtti szűrősávos vászon maradéka,
  sehonnan nem hivatkozott): `components/fuvarozas2/megbizas-vaszon.tsx`,
  `components/fuvarozas2/megbizas-lista.tsx`, `getMegbizasokVaszon`,
  `idoszakVodor` és a hozzá tartozó tesztsorok.
- **Sebesség — megmérve, nincs teendő:** a `getMunkaasztal` `limit 3000`-e
  és a soronkénti 5 alkérdés gyanús volt, de a Railway HTTP-naplója szerint
  (2026-09-29, 296 GET) a lap mediánja 14 ms, p90 44 ms, max 114 ms — élesben
  ~290 megbízás van, a 3000 csak felső korlát. Akkor érdemes újranézni, ha a
  megbízások száma a több ezret közelíti (a lekérdezés és a kereső-index a
  sorszámmal arányosan nő).

## 2026-09-30 — Megbízások oldal: két oszlop (Bér | Saját), lenyíló saját fuvar, becsúszó részlet

Budaházi Zoltán választása 10 asztali terv közül az 1-es („Bér | Saját”),
a saját fuvar bevitelére az 5 változatból a B („helyben lenyíló”), a
részletre a becsúszó lap. A jobb oldali „Kocsi most” panel kikerült — az a
Ma fülön látszik.

- **Elrendezés** (`app/fuvarozas2/megbizasok/page.tsx`): felül a kereső
  (javaslatokkal), alatta két oszlop: Bérfuvarok és Saját fuvarok, mindkettő
  minden nyitott fuvarral, szakaszonként (Beérkezett · Előre beírt saját ·
  Folyamatban · Számlázásra vár · Postára vár) fejléccel és darabszámmal
  (`OszlopLista`, `components/fuvarozas2/munkaasztal.tsx`). A bal oldalsáv
  (szakasz-, jelleg-, kocsi-szűrő) megszűnt.
- **Keresés:** keresőszóval mindkét oszlop a találatokat mutatja az archívval
  együtt; az archívum így érhető el. Adat: `getKetOszlop` (a `getMunkaasztal`
  és a `getKocsiMost` helyett), sorrend: `szakaszSorrendben`
  (`lib/fuvarozas2/munkaasztal.ts`, teszt: `scripts/teszt-munkaasztal.ts`).
- **Új saját fuvar:** a Saját oszlop tetején zöld sáv; rákattintva helyben
  kinyílik a meglévő űrlap (`SajatFuvarUrlap`, új `bezarHref` → „× bezár”;
  honnan/hová és kitől/kinek párban). Mentés vagy „Kocsira adom” után
  visszacsukódik. Egy előre beírt saját fuvarra kattintva ugyanez az űrlap
  nyílik, kitöltve.
- **Részlet:** jobbról becsúszó lap (`components/fuvarozas2/reszlet-lap.tsx`),
  bezárás ×-szel, a háttérre kattintva vagy Esc-kel; az URL-ből él
  (`?reszlet=…`), így a Ma oldal linkjei is ide nyitnak. A régi `szakasz`,
  `jelleg`, `kocsi`, `km` paraméterek nem szűrnek többé.
- **Törölve:** `Oldalsav`, `KocsiMostPanel`, `getKocsiMost`, `getMunkaasztal`.
- Ellenőrzés: `tsc` 0 hiba, eslint tiszta, `next build` sikeres,
  tesztek 40/0 és 21/0. Böngészőben helyben nem próbálható (nincs helyi DB).

## 2026-09-30 — Megbízások: a régi Fuvarozás bérfuvar-eszközei átköltöztek (1/3 a régi oldal kivezetéséhez)

Budaházi Zoltán: a régi „Fuvarozás” megszűnik, mindenki a Fuvarozás 2-re áll
át. Előtte átjön, ami csak a régiben volt. Ez az első kör (a 2. a közös
kalkulátor, a 3. a kikapcsolás: `FUVAROZAS_REGI=off`).

- **Bérfuvarok fejléce:** „↻ Frissítés” — azonnal átnézi a Drive-mappát új
  megbízásokért (a régi gomb üzeneteivel), és „+ Új bérfuvar” (kézi felvétel,
  a becsúszó lapon). `components/fuvarozas2/berfuvar.tsx`.
- **Bérfuvar szerkesztése:** a részlet-lapon „✎ Szerkesztés (minden mező)”:
  dátum, lerakás napja, felrakó, lerakó, időpont, megrendelő, hiv. szám
  (+ „nincs ilyen szám”), kocsi, sofőr, fuvardíj (Ft/EUR), költség, áru,
  mennyiség, súly, postázási cím, megjegyzés. Szerver: `modositBerFuvart`,
  `getBerFuvarAdat`, `ujBerFuvar` (`lib/fuvarozas2/megbizasok.ts`); ellenőrzés:
  `lib/fuvarozas2/berfuvar.ts`, teszt: `scripts/teszt-berfuvar.ts` (14/0).
  **Eltérés a régitől:** a mentés az állapotot NEM számolja újra (a régi
  `approveFuvar` után a 002 trigger a dátumokból újraszámolta — egy úton lévő
  fuvar dátumjavítása „teljesítve” lett volna), és nem hagy jóvá; a naplóba
  kerül, mely mezők változtak. A fuvardíj/költség egész Ft (az oszlop
  integer; a tizedes eddig mentési hibát okozott volna).
- **Újraolvasás:** a Drive-ból jött bérfuvar részletén „↻ Újraolvasás az
  iratból” (a régi gomb logikájával: a sor törlődik, az irat újra beolvasódik).
- **Jogosultsági javítás:** a `frissitsDriveBol` szerver-akció eddig semmilyen
  jogot nem ellenőrzött (bármely bejelentkezett felhasználó indíthatott
  Drive-szinkront OpenRouter-költséggel); mostantól Fuvarozás-szerkesztés kell.
  Az óránkénti automatika nem ezt hívja.
- `kanonikusMegrendeloNev` külön modulba költözött (`lib/fuvarozas/megrendelo-nev.ts`),
  mert a régi és az új mentés is használja.

## 2026-09-30 — Fuvarozás 2: közös Kalkulátor, a Megbízások után (2/3 a régi oldal kivezetéséhez)

Budaházi Zoltán: „a kalkulátor oldalt minden tudásával hozd át, a Megbízások
után legyen” — a döntés a közös kalkulátor (a régi + a tervvászon D6 egyben).

- **Fül:** Ma · Megbízások · **Kalkulátor** · Levelek · … (`fulek.tsx`).
- **Felület** (`components/fuvarozas2/kozos-kalkulator.tsx`, a régi
  `KalkulatorVaszon` és a lenyitható régi kalkulátor helyett): megállók
  címjavaslattal (minden kitöltött mező után új üres mező, mint a régiben),
  kocsi a mért fogyasztáshoz, a megbízó ajánlata, visszfuvar; térkép az összes
  eddigi számítással (élő előnézettel); a kiválasztott eredmény teljes bontása
  (rakott és üres km, menetidő, útdíj, üzemanyag literben és Ft-ban, napi
  költség, önköltség, Ft/rakott km, 500/600/700 Ft/km sáv és a megbízó
  ajánlata minősítéssel); alul az eredménycsempék, amelyek a böngészőben
  megmaradnak. A Tervezés linkje (`?honnan=…&hova=…`) az első két megállót tölti.
- **Számolás** (`szamoljKozosKalkulaciot`, `lib/fuvarozas2/kalkulator.ts`):
  a rakott út az összes megállón át; üres km: telephely → első megálló és
  utolsó → telephely. **Javítás:** az új kalkulátor eddig a NAV-árral
  számolt, a régi viszont levonta az 50 Ft/l tankolási kedvezményt — most
  mindkettő ugyanazt a forrást használja (`lib/fuvarozas/gazolaj.ts`).
- **Jogosultsági javítás:** a HU-GO-hívó `searchAddressSuggestions`,
  `calculateTollForPoints`, `calculateTollForAddresses` szerver-akciók eddig
  nem ellenőriztek jogot — mostantól Fuvarozás-megtekintés kell. (A
  `getGazolajAr` marad, azt az Áttekintés is hívja.) Törölve a sehonnan nem
  hívott, jog nélküli `kalkulatorHiba` export és a `KalkulatorVaszon`.

## 2026-09-30 — A régi Fuvarozás kikapcsolása (3/3)

Budaházi Zoltán: „a régi fuvarozás megszűnik, áttérünk a Fuvarozás 2-re”.
Az 1–2. körrel (#258 bérfuvar-eszközök, #259 közös kalkulátor) minden
átjött, ami csak a régiben volt.

- **Kapcsoló:** Railway `FUVAROZAS_REGI=off` (lib/fuvarozas2/flag.ts): a régi
  menüpont eltűnik, a `/fuvarozas` a `/fuvarozas2`-re irányít, a Fuvarozás 2
  menüpont mindenkinek látszik. **Visszakapcsolás:** a változó törlése.
- A Fuvarozás 2 fülsorában a „régi Fuvarozás →” link és a kezdőlap
  Fuvarozás-kártyája a kapcsolót követi; a modul leírása frissült.
- A régi kód (components/fuvarozas, app/fuvarozas) egyelőre bent marad a
  visszakapcsolhatóság miatt; a törlése és a 002 trigger kivezetése külön kör.

## 2026-09-30 — „Fuvarozás 2” → „Fuvarozás”

A régi modul kikapcsolása után (FUVAROZAS_REGI=off) a menüpont, az oldalcímek
(Tervezés, Levelek, Kimutatás, Partnerek, Rendszer), a mobil Rendszer-link és a
két jogosultság-felirat „Fuvarozás” lett. Az útvonal marad `/fuvarozas2`
(a régi `/fuvarozas` a kapcsoló miatt oda irányít).

## 2026-09-30 — Tervezés: bejövő · döntés · hét, tárolt kalkulációkkal

Budaházi Zoltán választása a Kalkulátor 2+5+9 terveiből az 1-es („három
oszlop”), de a **Tervezés** oldalra; kérése: ami egyszer ki van számolva,
rögzüljön, és ne lassítsa az oldalt.

- **Oldal** (`app/fuvarozas2/tervezes/page.tsx`, `components/fuvarozas2/tervezo.tsx`):
  - **Bejövő:** a döntésre váró bérmegbízások (ellenőrzésre vár, vagy
    tervezett kocsi nélkül) három jelzéssel: *magában* (a tárolt pontos
    kalkulációból), *hét* (a legjobb kocsi hetébe illesztve mennyit hoz),
    *előzmény* (a korábbi Ft/km-hez képest).
  - **Döntés:** a kiválasztott pontos kalkulációja (rakott/üres km, üzemanyag,
    útdíj, napi, önköltség, a megbízó ajánlatának minősítése, célár 8%
    árréssel) és az ár-előzmény (saját archívum: ugyanaz a partner és út,
    ugyanaz az út, ugyanaz a partner), figyelmeztetéssel, ha olcsóbb.
  - **Hét:** a kocsik közti váltóval (mindegyiken a heti hatás vagy „ütközik”),
    a hét napjai a fuvarokkal (az új szaggatott kerettel), bevétel, km, üres
    arány, önköltség, eredmény, és hogy mennyit hoz a fuvar a hétnek.
  - **Döntés-sáv** (`tervezo-dontes.tsx`): „Jóváhagyom → kocsi, nap”
    (`setFuvarJarmu` + `valtAllapot` → tervezett), „Visszaírok más árral…”
    (ajánlat-szöveg a vágólapra, a célárral), „Elutasítom” (`torolMegbizast`).
  - Alul, összecsukva a korábbi Tervezés (minden kocsi hete, üres napok,
    Timocom, kocsi nélküliek), `Suspense`-szel utólag betöltve, mert az
    Ecofleet-lekérés lassabb (`regi-terv-het.tsx`).
- **Tárolt kalkulációk** (új tábla `fuvar_kalkulacio`, `lib/fuvarozas2/kalkulacio-tar.ts`):
  az eredmény megbízásonként, a bemenet ujjlenyomatával (megállók, díj, kocsi,
  hónap, napi költség, verzió); eltérő ujjlenyomat vagy 7 napnál régebbi →
  elavult, újraszámolódik, addig a régi látszik. Az óránkénti modell-szinkron
  kör számolja a nyitott bérmegbízásokra; az oldal csak olvas, egyedül a
  kiválasztott, soha ki nem számolt megbízásra vár egyszer.
- **Heti becslés** (`lib/fuvarozas2/tervezo-alap.ts`, teszt: `scripts/teszt-tervezo.ts` 22/0):
  rakott km a tárolt HU-GO-értékből, üres utak a tárolt megálló-koordinátákból
  légvonalból ×1,3, útdíj a tárolt kalkulációból vagy km-arányosan, napi
  költség a hét 5 munkanapjára fix. Külső hívás nincs.
- A kalkulátor számoló magja külön modulba került (`kalkulator-szamitas.ts`),
  hogy a háttér munkamenet nélkül is hívhassa; a "use server" burok marad a
  jogosultsággal.

## 2026-10-10 — Menetterv (3. fázis): a feladat-sorrend egyetlen forrása

Tulajdonosi döntés (2026-10-10): a `fuvar_menet` + `menet_feladat` a kocsinkénti,
naponkénti sorrend EGYETLEN forrása; 4 kamion (a kocsik a `getJarmuvek()`-ből,
JANI is), km HU-GO-ból, légvonal × 1,3 csak „becslés” jelöléssel.

- **Séma** (`db/migrations/032_menetterv.sql`, csak additív): `fuvar_menet`
  (kocsi × nap, állapot javaslat/jovahagyott/folyamatban/lezart, `verzio`
  optimista zár), `menet_feladat` (sorszám — halasztott egyediség —, típus
  bérfuvar / saját áru / üres pozicionálás / telephelyi rakodás / várakozás,
  km + forrás, figyelmeztetések, lezárás), `menet_esemeny` (napló), `fuvar_valtozas`
  (mező-szintű napló; írja a bérfuvar-szerkesztő és a kocsi-hozzárendelés is:
  kocsi, napok, felrakó, lerakó, fuvardíj).
- **lib/menet/**: `menet-alap.ts` (tiszta: típus, üres pozicionálás, figyelmeztetések
  — üres indulás > `ures_indulas_figyelmeztetes_km`, kapacitás 33/28 hely ·
  660/812 raklap, ütközés, hiányzó cím —, `alkalmazMenetSorrendet`, ellenőrzések),
  `generalas.ts` (adatgyűjtés, HU-GO/becslés távolság, javaslat mentése csak
  változáskor), `muveletek.ts` (jóváhagyás, átrendezés indokkal, lezárás,
  visszavonás — jog nélküli mag), `akciok.ts` ("use server" burkok jogellenőrzéssel),
  `repo.ts` (`getMenet`, `getMenetek`, `menetSorrend`, `menetSorrendek` — egy lekérdezés).
- **Árnyék-javaslat**: az óránkénti modell-szinkron kör minden aktív kocsira ma
  és holnap frissíti a 'javaslat' menetet; a jóváhagyotthoz nem nyúl, nem dob.
- **Egyetlen sorrend-forrás**: ha a kocsi napjára jóváhagyott menet van, azt
  követi a Ma tükör, a holnapi lista és a heti rács, a GPS lap / sofőr app
  blokkjai és párosítási sorrendje, a GPS-figyelő bemenete és a Tervezés
  (heti rács, kocsi-hét); különben marad a `napiSorrend`. Az `idovonal.ts`
  párosítási szabályai nem változtak.
- **Felület**: Tervezés → „Menetterv” panel (nap-léptető, minden kocsi):
  feladatok típus-címkével, honnan → hová, tervezett idő, km („becslés”),
  figyelmeztetések; Javaslat frissítése, Jóváhagyás, ▲/▼ (indok kötelező),
  ✓ kész, Vissza javaslatba, napló.
- **Teszt**: `scripts/teszt-menetterv.ts` (76/0) a `teszt` láncban; a scratch
  Postgresen a teljes kör (javaslat → elavult verzió → jóváhagyás → átrendezés
  → lezárás → árnyék-kör) végigfutott.

## 2026-10-10 — Optimalizáló (4. fázis): csak javaslat, jóváhagyott menetet magától nem ír át

- **Séma** (`db/migrations/033_optimalizalo_javaslat.sql`, additív): `optimalizalo_javaslat`
  (menet, kocsi, nap, típus sorrend/hozzarendeles, bemenet-ujjlenyomat, javasolt sorrend,
  célfüggvény-tagok a javaslatra és a mostani tervre, megtakarítás, figyelmeztetések,
  állapot nyitott/elfogadva/elutasitva/elavult, ki és mikor döntött). Menetenként
  legfeljebb egy nyitott javaslat (részleges egyedi index).
- **Tiszta mag** (`lib/menet/optimalizalo.ts`): J = üzemanyag (üres + rakott km × fogyasztás ×
  gázolajár) + útdíj (HU-GO szakaszonként, különben flottaátlag Ft/km) + napi költség (fix)
  + késés- és várakozás-büntetés + hazaút − p × saját áru értéke. Kemény korlát: késés az
  ablak vége után, kapacitás (660/812 db, 33/28 hely, a hozott rakomány is), lerakó a
  felrakó után, elkezdett/lezárt munkák a helyükön, 540 perc napi vezetés és 270 perc után
  45 perc szünet (becslés, nem tachográf). Az első időzített megállóra az ablak VÉGÉRE ér
  (tulajdonosi elv), ha ez késést okozna, az elejére. 30 km-es üres indulás csak
  figyelmeztetés. ≤ 7 mozgatható munkánál teljes bejárás, fölötte beszúrás + 2-opt +
  áthelyezés; determinisztikus. Hozzárendelés: egy bejövő bérfuvar legjobb helye mind a
  4 kocsi napjában (GPS nélküli is), a J határváltozásával.
- **Szerver** (`lib/menet/optimalizalo-szerver.ts`): a menetterv adatgyűjtéséből számol,
  és csak 1 000 Ft vagy 5 km fölött (vagy ha a mostani terv sért egy kemény korlátot) ír
  nyitott javaslatot; más ujjlenyomatnál a régi nyitott elavul. **Elfogadás**: jóváhagyott
  menetnél KIZÁRÓLAG az átrendezés-úton (verzió, indok „optimalizáló javaslat #id”,
  menet_esemeny + fuvar_valtozas); javaslat-menetnél újragenerálás ebben a sorrendben,
  javaslat marad (az óránkénti kör az elfogadott sorrendet tartja). Elavult verzióra
  hiba, a javaslat elavult.
- **Akciók** (`lib/menet/optimalizalo-akciok.ts`, jogellenőrzéssel): `optimalizalas`,
  `elfogad`, `elutasit` (szerkesztés), `hozzarendelesJavaslat` (megtekintés, nem ír).
- **Felület**: Menetterv kocsikártyán „Optimalizálás” gomb és javaslat-doboz (most vs
  javasolt sorrend, km, J tagjai, megtakarítás, korlát-megjegyzések, Elfogadás /
  Elutasítás); Tervezés döntés-sáv: „Optimalizáló: melyik kocsi?” (legjobb kocsi, hely,
  határköltség, kocsinként).
- **Óránkénti kör**: ma és holnap a menetekre javaslat (egy try/catch blokk, nem dob).
- **Teszt**: `scripts/teszt-optimalizalo.ts` (120/0) a `teszt` láncban; scratch Postgresen a
  teljes kör (javaslat → nincs duplikátum → elfogadás javaslat-menetnél → árnyék-kör tartja
  → jóváhagyás → elavulás → elavult elfogadás elutasítva → elfogadás átrendezéssel → elutasítás
  → hozzárendelés 4 kocsira → óránkénti kör) 35/0.
## 2026-10-10 — Diszpécser (6. fázis): a fuvarszervező egy képernyője

Új fül: **Fuvarozás 2 → Diszpécser** (`/fuvarozas2/diszpecser`; megtekintés a
fuvarozás nézési jogával, a feladat-lezárás a meglévő `feladatLezaras`
szerver-akción át, szerkesztési joggal). A Ma oldal nem változott.

- **Felső sáv** (sötét antracit, `--f2-dark`): nap-léptető (alapból ma,
  Budapest) és nézetváltó: Idővonal · Heti beosztás · Lista · Térkép.
- **Szűrők**: jármű, sofőr, partner, telephely, státusz (tervezett /
  folyamatban / kész / problémás) — a betöltött napra a kliensen hatnak, és
  az URL-ben is megjelennek (`?nap=&nezet=&jarmu=…`).
- **Probléma-sáv** (`aria-live="polite"`): késésveszély (élő ETA vagy terv a
  lerakási/felrakási ablak vége után), a menet figyelmeztetései (üres indulás
  a beállítás küszöbe fölött, időütközés, kapacitás, hiányzó cím), GPS
  elavult/nincs (csak ha a kocsinak van nyitott feladata), kocsi nélküli
  fuvar (ma). Kattintásra kijelöli a feladatot.
- **Idővonal**: minden aktív kocsi egy sáv (JANI is, „nincs GPS”), a fejben
  rendszám + pótkocsi + sofőr + GPS-frissesség (friss ≤ `gps_kesei_perc`,
  késői ≤ `gps_elavult_perc`, elavult, nincs GPS — pozíciót nem találunk ki),
  a sorrend a jóváhagyott menetből, különben a javaslatból („javaslat”
  címkével), menet nélkül a megbízások terv-ideje szerint („menet nélkül”).
  A tengely a nap feladataihoz igazodik, „most” vonal, típus-színek a
  Menetterv panel szerint + betűjel, állapot ikonnal és szöveggel.
  Billentyűzet: minden blokk gomb szöveges címkével, nyilak/Home/End a
  sávon belül. Telefonon a sávok egymás alatti listák, a részletek a lista alatt.
- **Részlet-panel**: típus, honnan→hová, ablakok, terv/tény, ETA (különben
  „nem számolható”), raklap/kapacitás, üres és rakott km („becslés” jellel),
  költség a költségmodul tárolt soraiból (tény/becslés), megbízás- és
  dokumentum-link; „Feladat lezárása” (megerősítéssel, csak jóváhagyott
  menetben), „Átrendezés a Tervezésben”.
- **Heti beosztás**: kocsi × 7 nap, feladatszám és típusok, sofőr szabadsága /
  betegsége (Jelenlét-joggal, a meglévő `getSzabadsagIgenyek` /
  `getSzabadsagTavolletek`), 30 napon belül lejáró (borostyán) és lejárt
  (vörös) okmányok a `jarmu_okmany`-ból (pótkocsié is).
- **Lista**: rendezhető táblázat (jármű, sorszám, típus, partner, felrakó,
  lerakó, ablak, státusz, km, költség), ugyanazokkal a szűrőkkel.
- **Térkép**: Leaflet (dinamikus import, ssr nélkül): utolsó ismert pozíció
  idővel és frissességgel, szaggatott vonal a következő ismert koordinátájú
  megállóig; jel nélküli kocsi csak a listában.
- **Adat** (`lib/fuvarozas2/diszpecser.ts`, server-only): `getMenettervNap`,
  `getIdovonalak` (a gyorsítótárazott GPS-lánc — saját Ecofleet-hívás nincs;
  hibánál „GPS nem elérhető”, az oldal megjelenik), `getFuvarBeallitasok`,
  `getJarmuvek`, `getSajatTelephelyek`, `getMenetek` (hét), plusz egy-egy
  lekérdezés a nap megbízás-adataira, a tárolt költségsorokra, a pótkocsi-
  kapacitásra, az okmányokra és a heti megbízás-számokra — nincs N+1.
- **Teszt**: `scripts/teszt-diszpecser.ts` (90/0) a `teszt` láncban; a
  betöltő a scratch Postgresen (Ecofleet-kulcs nélkül → GPS-hiba ág) lefutott,
  a négy nézet és a részlet-panel szerveroldalon renderelve.

## 2026-10-10 — Menetterv / optimalizáló QA-javítások

- **Idő-lánc minden sorrendre** (`lib/menet/menet-alap.ts` `epitMenetJavaslat`): átrendezés,
  optimalizáló-elfogadás és újragenerálás után a TELJES lánc újraszámolódik (indulási hely →
  menetidő → fel-/lerakási ráhagyás), az első időzített megálló ablakának VÉGÉRE (ha az több
  késést okoz, az elejére); ha előtte más feladat is van, a kocsi a nap kezdeténél korábban nem
  indul — így a lekésett 06–08 ablak ütközés-figyelmeztetést ad. Ablak nélküli menet (JANI) a nap
  kezdetétől láncol: új beállítás `nap_kezdes_ido` = "06:00" (`db/migrations/035_nap_kezdes_ido.sql`,
  kódbeli tartalékkal). Lezárt előtag után legkorábban a lezáráskor indul tovább.
- **Vezetési idő a kártyán** (`menetVezetes`, `akciok.ts` → `vezetes`): 540 perc felett
  „vezetesi_ido” sáv. Az optimalizáló „nincs megengedett sorrend” eredménye a kártyán marad
  (melyik korlát nem teljesül, a mostani terv sérülései), nem csak toast.
- **Nyitott javaslat**: az „Optimalizálás” gomb ilyenkor „Javaslat #id”, és a javaslat-dobozhoz
  görget (nem hiba).
- **Másnapi indulási hely**: az előző (≤ 3 napos) menet utolsó feladatának célja (jóváhagyott
  elsőként), különben a régi megbízás-lekérdezés, végül a telephely (`elozoMenetVege`).
- **HU-GO terhelés**: `lib/menet/hugo-megszakito.ts` — körönkénti megszakító (az első időtúllépés /
  hálózati hiba után légvonal × 1,3), a hozzárendelés-javaslat legfeljebb 120 hívás / 20 s;
  az óránkénti kör a `kulso-hivas.ts` háttér-sorába megy (`hatterHivasban`, "hugo:hatter",
  elengedi az interaktív hívásokat); a jóváhagyott menetet a számolás ELŐTT kihagyja; > 7
  mozgatható munkás menetre óránként nincs optimalizálás (kézzel igen).
- **Verzió-ingadozás** (`osszevetJavaslatot`): ha csak a km (< 2 km) vagy a km-forrás változott,
  az új számok verzió-ugrás nélkül íródnak; HU-GO → becslés romlás nem íródik.
- **Tervezés**: a Bejövő chip a most kiszámolt kalkulációt mutatja („nem számolható”, ha hibás);
  a heti panel mind a 7 napot mutatja, a hétvége jelölve (kamionstop).
- **Teszt**: `teszt-menetterv.ts` 118/0, `teszt-tervezo.ts` 27/0, `teszt-kulso-hivas.ts` 19/0,
  `teszt-optimalizalo.ts` 120/0; a QA-adatbázis másolatán böngészőben: Gergő átrendezése (06:00-tól
  teljes lánc, 08:00-s ablak-ütközés), Micó javaslat-elfogadása (javaslat- és jóváhagyott menetnél),
  JANI 06:00-tól, másnapi indulás a jóváhagyott menet végéről.
## 2026-10-10 — Diszpécser és Ma: QA-javítások (ETA, ▲-jel, chipek, névszabály, telefon, hétvége)

- **ETA csak élő GPS-szel** (`diszpecser-alap.ts` `etaMutathato`, betöltő): élő ETA csak friss/késői
  GPS-jellel és ugyanarra a megbízásra; különben a menet terve látszik, „nem számolható (nincs friss
  GPS-jel — a terv látszik)”. **Vég < kezdet soha** (`feladatIdok`, `idoSzoveg`): ellentmondásnál csak
  a megbízhatóbb idő (tény > ETA > terv); más napra eső idő „(−1)”/„(+1)” jelet kap.
- **▲-jel = a probléma-lista**: a `Problema` `szint` mezőt kapott (feladat / kocsi / flotta); a feladat
  jelét csak a feladat-szintű elemek adják (`problemasFeladatKulcsok`) — a kocsi GPS-hiánya nem jelöl
  feladatot. A részlet-panel a feladat saját és „(a kocsira)” problémáit listázza.
- **Idővonal**: chip min. 4rem, a sorszám mindig olvasható (teljes címke aria-label/title), a sorokba
  bontás a min. szélességgel számol; a „most” címke alatt az ütköző óra-felirat elmarad, a szélen nem lóg ki.
- **Lista**: a Költség oszlop asztalon is kifér (tény/becslés jellel); telefonon kártyalista rendezés-választóval.
- **Egy névszabály** (`jarmuNev`): „kód · címke”, ha a címke nem tartalmazza a kódot („JANI · DAF XG
  (gyártás alatt)”) — Diszpécser minden nézete és a Ma oldal.
- **Heti beosztás telefonon**: ragadó kocsi-oszlop, a kiválasztott nap oszlopa görgetve látszik.
- **Ma oldal**: „még nem üzemel” csak fuvar nélkül, GPS és rendszám nélkül (`kocsiHelykitolto`); a fuvaros
  GPS nélküli kocsi a feladataival, „nincs GPS” állapottal látszik. A heti rácsba a fuvaros hétvégi nap
  bekerül, „hétvége” jellel (`hetNapjaiHetvegevel`). A csempesor telefonon elhalványuló széllel és
  „húzd oldalra” felirattal.
- **Teszt**: `teszt-diszpecser.ts` 125/0, `teszt-ma-het.ts` 35/0; teljes `npm run teszt`, typecheck, eslint,
  build; Playwright 1440×900 és 390×844 (`/tmp/qa-shots/fixdisz_*.png`).

## 2026-10-17 — Kezdőlap: Napi napló (C6 terv)

- **Mi**: az asztali kezdőlap (`app/page.tsx`) tetején „Napi napló”: ‹ › lapozás, Nap / Hét / Hónap
  (`?nap=YYYY-MM-DD&idoszak=nap|het|ho`), nyomtatás / PDF (böngésző). Alatta változatlanul az Info + modul-rács.
- **Blokkok** (csak annak, akinek joga van; hibánál a blokk kimarad, a lap megjelenik):
  Felvásárlás · Nyíregyháza (típusonként db / átlagár / Ft, kp / átutalás, kassza nyitó → záró, kifizetésre váró) ·
  Be- és kiszállítás telepenként (nyitó / be / ki / záró, típusonként, átvételre váró, mozgáslista) ·
  Kamionok (a meglévő `getKimutatas(idoszak, nap)`) · Számlák (`szamla` tükör + `getPenzLista("teendo")`) ·
  Teendők (automatikus: számlázatlan, papír, lejárt, függő felvásárlás, átvétel, szabadság-kérelem, álló kocsi + Jelenléti feladatok) ·
  Folyamatban · Jelentések (nap/hét/hó linkek, Kimutatás) · Mini naptár + szabadság.
- **Adat**: `lib/kokpit/naplo.ts` (csak olvas, nem "use server"; a jogot a lap ellenőrzi). Telep-készlet ugyanazzal a
  szabállyal, mint a `getStock` (mozgatas_be az átvételkor számít, „Csere” kimarad).
- **Még nincs**: projektek tábla, automatikus e-mail kiküldés, bejövő (szállítói) számlák.
- **Teszt**: typecheck, eslint, `npm run teszt` (0 hiba), build; scratch Postgres-en mintaadattal Playwright 1440 px (nap/hét/hó).

## 2026-10-19 — Drive-import: régi Word .doc megbízás csendben kimaradt
- Tünet: a Drive `Fuvarmegbizások` mappába tett új megbízás (`fuvarmegbízás 2 (1)(127).doc`, Krajnik Sped) nem jelent meg az appban, naplóbejegyzés sem lett róla.
- Ok: a `listazDriveFajlok` csak PDF / .docx / Google Docs / Excel MIME-típust enged; a régi bináris Word (`application/msword`) már a listázásnál kiesett.
- Javítás (`lib/fuvarozas/drive-sync-core.ts`): `application/msword` felvéve a támogatottak közé, szöveg-kinyerés `word-extractor`-ral (a mammoth csak .docx-et olvas). Új függőség: `word-extractor` (+ `@types/word-extractor` dev).
- Teszt: az éles .doc-ból a word-extractor teljes szöveget adott (felrakó, lerakó, időpont, fuvardíj, rendszám); tsc (a meglévő LayoutProps-hibán kívül tiszta), eslint, `next build` OK.

## 2026-10-19 — Sofőr-app: „Összes” fül
- Kérés: a sofőr lássa az összes megbízását, ne csak a Ma/Holnap napot (pl. Micó 21-i fuvarjai hétfőn nem látszottak).
- Új fül: `/m/osszes` (Ma · Holnap · Összes · Profil). A saját kocsi következő 14 napjának megbízásai naponként egymás alatt, időrendben, ugyanazokkal a kártyákkal (idő, megállók, Navigáció/térkép), mint a Holnap fül; teendő-gombok továbbra is a Ma fülön.
- `lib/fuvarozas/sofor.ts` → `getSoforNapokElore`: a napokat a DB-ből gyűjti, a kocsira szűrést napról napra a meglévő `getSoforNap` végzi (ugyanaz a besorolás). `components/m/sofor-nap.tsx`: üres `cim` esetén csak a dátum a fejléc.
- Teszt: a napgyűjtő SQL élesben lefutott (10-19, 10-20, 10-21), tsc, eslint, `next build` OK.

## 2026-10-19 — Heti tervező: „fuvar helye nem ismert” cégnévvel írt címnél
- Tünet: #329 (Krajnik Sped, Záhony → Dunakeszi) a Tervezés hetében „helye nem ismert”.
- Ok: a címekben telepnév áll („Záhony, Solinwest Agro Telep”, „Dunakeszi, Solinwest Telep, Tőzegtavi út 9.”); a HU-GO címkereső ezekre 0 találatot ad.
- Javítás (`lib/fuvarozas2/tervezes-het.ts` `geo`): tartalék-sorrend — teljes cím → település + számot tartalmazó részek → csak település. Csak a heti rés-számítást érinti, az érintés-felismerést nem.
- Teszt: HU-GO élesben: a teljes címekre 0 találat, „Záhony” és „Dunakeszi, Tőzegtavi út 9.” megtalálva; a jelöltlista ezeket adja. tsc, eslint, `next build` OK.
## 2026-10-19 — Megbízások › Partnerek: automatikus kitöltés + áttekinthető fül
- Tünet: 55 partnerből 49-nél nem volt postacím, 50-nél számlázási e-mail, 54-nél adószám; 52 nyitott javaslat egy
  hosszú kártyán ült elfogadatlanul; a saját fuvar „partnerei” (Fabrika, Keter, Jupiker…) üres sorokként keveredtek a megbízók közé.
- Ok: a javaslat-rendszer (2026-10-01) csak javasolt, a törzsbe semmi nem került magától; az adószámot és a
  számlázási címet senki nem gyűjtötte, pedig a saját kiállított számláink (`szamla.raw_xml`) tartalmazzák.
- Javítás: `lib/fuvarozas2/partner-kitoltes-alap.ts` (tiszta) + `partner-kitoltes.ts` (futtató). CSAK üres mezőt tölt:
  adószám, számlázási cím ← számláink vevője; postacím ← egyértelmű megbízás-PDF > számla postacím > vevőcím;
  e-mail ← számláink vevő-e-mailje > PDF; fizetési határidő ← PDF > számlák medián napja (8/15/30/45/60/90-re kerekítve);
  papír-határidő ← csak PDF. Eltérő adószámú számlák esetén a számlákból semmit. Óránként fut (modell-szinkron kör), és a fülön
  „Hiányzók kitöltése” gombbal. A felhasznált javaslat „elfogadva”, a mező többi nyitott javaslata „elvetve” (dontes_by: automatikus kitöltés).
- Fül: szűrő (Bérfuvar megbízók · Saját fuvar · Mind), „csak hiányos”, keresés, hiányszámláló; Adószám oszlop (a Sablon a lenyitott sorba került);
  hiány narancs „hiányzik” jelöléssel csak bérfuvar-megbízónál; a javaslat-kártya összecsukva („Eldöntendő javaslatok”); szerkesztőben Adószám, Székhely.
- Teszt: `teszt-partner-kitoltes.ts` 16/0, teljes `npm run teszt`, tsc (csak a meglévő LayoutProps), eslint, `next build`.

## 2026-10-19 (2) — Partnerek fül: letisztítva
- A tulajdonos szerint az adatkitöltés után is „katyvasz”: 9 zsúfolt oszlop, szinte minden sorban narancs „hiányzik” (a papír-határidő miatt), eltérő írásmódú címek, nyers „pozicioszam”.
- Most 5 oszlop: Partner (+ adószám alatta) · Fuvar (db + utolsó dátum) · Határidők („60 nap” + „papír 7 napon belül” / „papír: nincs kikötve”) · Számla e-mail (első cím + „+1”) · Postacím. A „számlán kért szám” és a sablon a lenyitott sorban.
- A papír-határidő nem számít hiánynak (csak az adja meg, aki kiköti). Címek egy alakra: `lib/fuvarozas2/cim-formazas.ts` `cimSzep` (H-/HU- le, csupa nagybetű szelídítve, fordított sorrend javítva) — kijelzéskor és az automatikus kitöltéskor.
- Teszt: `teszt-partner-kitoltes.ts` 22/0, teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-19 — Napi sorrend: közelség-alapú láncolás
- Tünet: Gergő 10.20-i holnapja #324 (Szakoly → Kisvárda), #325 (Tata → Tompaládony), #329 (Záhony → Dunakeszi) sorrendben, azaz id szerint állt — egyiken sincs időpont, és a régi láncolás csak PONTOS városegyezést ismert.
- Javítás: `lib/fuvarozas2/napi-sorrend.ts` d) szabály — ha a települések koordinátái ismertek, az időpont nélküli fuvarok mohó legközelebbi-szomszéd láncot alkotnak (az előző lerakóhoz legközelebbi felrakó jön). Hiányzó pontnál a régi szabály. Időpontos/elkezdett fuvarok sorrendje változatlan.
- Új: `varos-pont-tar.ts` (tiszta, szinkron tár + haversine), `varos-pont.ts` (`melegitVarosPontokat`, HU-GO gyorsítótárazott geokód, max 3 mp). Melegítés a betöltőkben: Ma (ma-vaszon), idővonal/sofőr-app (actions), Tervező, elvinni-hét, lancKm.
- Teszt: teszt-napi-sorrend +3 eset (Gergő 10.20.: 324 → 329 → 325), 33 ok; ures-km, ma-tukor, tervezo, elvinni-valo, ma-het, tervezes-het, menetterv, optimalizalo, eta-lanc, het-utemterv, kocsi-sav, ma-kartya, kereses-javaslat mind zöld; tsc, eslint, build OK.

## 2026-10-19 (3) — Partner-adat Word-megbízásból is
- Tünet: Krajnik Sped Kft. e-mailje és fizetési határideje üres maradt, pedig a megbízásban (régi .doc) benne van — a tulajdonos az első számlát mindig ebből állítja ki.
- Ok: a partner-javaslat kiolvasó csak `.pdf` megbízást keresett.
- Javítás (`lib/fuvarozas2/partner-javaslat.ts`): `.doc` (word-extractor, fej- és lábléccel) és `.docx` (mammoth) szövege is a modellhez megy; a „Hiányzók kitöltése” gomb előbb lefuttat egy kiolvasási kört (max. 5 irat), aztán tölt.
- Teszt: teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-19 (4) — Partnerek: kapcsolattartó és munkák előre
- A tulajdonos: „nekem az adószám nem is fontos — partner, kapcsolattartó, hány munkánk volt”.
- Sor: Partner · Kapcsolattartó (a megbízást küldő levelek feladói a Levelekből — partnerhez kötve vagy a cég e-mail-domainje alapján — + Kapcsolatok törzs név szerint párosítva; a leggyakoribb elöl, „+N”) · Munkák (db, bérfuvar-forgalom pénznemenként, utolsó dátum) · Fizetés · Számla · posta. Adószám nincs a sorban és nem hiány (a szerkesztőben megmaradt).
- Teszt: teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-19 (5) — Készpénzes partner nem hiány; önszámlázás
- Tímár Dávid mindig készpénzzel fizetett: ha a partner összes számlája 0 napos, a fizetési határidő 0 = „készpénz” (kijelzés is így), nem hiány.
- Kuehne + Nagel önszámlázással (Gutschrift) dolgozik: a partneren a „nem kér számla-e-mailt (pl. önszámlázás)” jelölés, a fuvar számlaszáma „GS-<bizonylatszám>”. Parkolt bővítés (csak ha lesz több ilyen partner): „Számlázás módja” mező, „jóváírásra vár” státusz 14 napos riasztással, Gutschrift rögzítés + egyeztetés, Gmail-figyelés „Gutschrift” tárgyra.
- Teszt: `teszt-partner-kitoltes.ts` 24/0, teljes `npm run teszt`, tsc, eslint, build.
## 2026-10-19 — Rugalmas saját fuvar, 1. lépés: határidő + Elvinni való sor
- Cél (Zoltán): a saját fuvar töltelék — nem fix napra kerül, hanem az ablakában (legkorábban … legkésőbb) oda, ahol a kocsinak útba esik; nem maradhat hetekig tallonban.
- `db/migrations/047_elvinni_legkesobb.sql`: új `legkesobb` (határidő); a nyitott elvinni valók alapértéke legkorábban/rögzítés + 7 nap.
- Rögzítés/szerkesztés (`akciok.ts` `elvinniDatumok`): üres határidő = legkorábban (vagy ma) + 7 nap; legkorábban előtti határidő hiba.
- `elvinni-szabalyok.ts` `elvinniSurgosseg`: a határidő előtti 3 munkanapon sárga, az utolsó munkanapon és lejárat után piros.
- Felület: Megbízások → Elvinni való kártya „határidő” címkével, „Legkésőbb” mező a rögzítőben és a panelben; Ma oldal: „Elvinni való” doboz sürgősség szerint; Tervezés hét: „Elvinni való” sor — minden fuvar a vihető napjain, szaggatott kártyán, az utolsó napon jelölve.
- Következik: 2. lépés (legjobb hely kiszámítása kocsinként/naponként + „Ide” gomb), 3. lépés (áthúzás, bérfuvar elsőbbsége).
- Teszt: teszt-elvinni-valo (+8 sürgősségi eset), tervezes-het, ma-het, ma-kartya, letrehoz-parancs, jogosultság-tesztek; migráció élesen tranzakcióban kipróbálva (rollback); tsc, eslint, build OK.

## 2026-10-19 (6) — Saját utak útnaplója
- Kérdés: „saját fuvaroknál mindig a Well-Worn a megbízó — hol találom, mikor hová mentünk saját áruval, egy-egy útnak mennyi lett volna a díja?”
- Pénz › Kimutatás › „Saját” szűrő: külön útnapló (Nap · Honnan → hova · Kitől → kinek · Kocsi · Rakott km · Költségünk (+Ft/raklap) · Díja lett volna), felül összesítés (utak, km, költség, díj; alap: rakott km × `sajat_fuvar_km_dij_ft`). Közvetlen link: `/fuvarozas2/kimutatas?idoszak=ho&jelleg=sajat` (a Nap/Hét/Hónap lapozás megtartja).
- Partnerek › Saját fuvar: magyarázó sáv (megbízó mindig a WWP, itt a címzettek/feladók) + link az útnaplóra.
- Teszt: teljes `npm run teszt`, tsc, eslint, build.
- (20:20) A „díja lett volna” alapja ezentúl a bérfuvarjaink tényleges átlagos Ft/rakott km-e (forintos fuvarok, az időszak végéig 90 nap, ugyanaz, mint a kocsi-kihasználtság belső díja); a `sajat_fuvar_km_dij_ft` beállítás csak tartalék, ha nincs adat. `koltseg-adat.ts` `sajatKmDijFt`/`sajatKmDijForras`; a Kimutatás kiírja az alapot.

## 2026-10-19 — Rugalmas saját fuvar, 2. lépés: legjobb hely + „Ide” gomb
- `lib/megbizasok/elvinni-het.ts` `legjobbElvinniHelyek`: az ablakon belül (legkorábban/ma … határidő, hétköznap, max 3 hét) minden üzemelő kocsi minden napjára az üres km a felrakóig (foglalt napon az aznapi utolsó lerakótól, szabad napon az állóhelytől — a meglévő getElvinniHet cellái). Legkevesebb km nyer, egyezésnél a korábbi nap. Rendszám nélküli kocsi (JANI) kimarad.
- Tervezés hét, Elvinni való sor: a legjobb nap cellájában ★ kártya („Gergő · Dunakeszi után · +40 km”) és „Ide” gomb (`kocsihozAdom` — egy kattintással kocsin, a sofőr látja). Csillag csak „útba esőnél” (≤ 80 km, `UTBA_ESO_KM`), piros határidőnél kerülővel is. Számítás párhuzamosan, 6 mp-es korláttal.
- Teszt: Postgres-teszt adatbázison ideiglenes elvinni fuvarral (Záhony → Szakoly, 10.20–10.24): Micó szabad napjai +109 km, Gergő +137 km, JANI kimarad; első futás 3,9 s, második 0,3 s (geokód-gyorsítótár). Tesztek, tsc, eslint, build OK.
- Javítás (2026-10-19 este): a Ma oldalon Gergő holnapja továbbra is id-sorrendben állt — a „Dunakeszi, Solinwest Telep, Tőzegtavi út 9.” címből a `varosNev` nem vágta ki a települést, ezért a pont hiányzott és a régi szabály futott. `varos-pont-tar.ts` `megalloTelepules`: ilyenkor az első vessző előtti rész; a tár kulcsa és a lekérdezés is ezt használja. A teszt most az éles címmel fut (324 → 329 → 325).

## 2026-10-21 — Word-megbízás: a fejlécben álló megbízó (PÁNTYA #330)
- Tünet: #330 megbízója „Pántya Gáborné” (az aláíró), a megállóknál csak „Osli Tőzegüzem” / „Kurucz kertészeti Áruház” cím nélkül, a kocsi kétszer („AOPU-427/AOTY-474 · AOPU-427/AOTY-474”).
- Ok: a .docx-ből a mammoth csak a törzsszöveget adja — a „PÁNTYA Teherfuvarozó és Szolgáltató Kft.” a Word-fejlécben állt, a modell nem látta; egy-egy rakodóhelynél a modell a `felrako`/`lerako` mezőbe a nevet tette, a megálló címét nem; a részlet a rendszámot sofőrként is kiírta.
- Javítás (`lib/fuvarozas/drive-sync-core.ts`): .doc/.docx fej- és lábléce (word-extractor) „=== AZ IRAT FEJLÉCE ===” blokként a szöveg elejére; a prompt: a fejléc cége a megbízó, aláíró személy soha. Egy fel-/lerakónál, ha a mező szám nélküli név, a megálló teljes címe kerül be. Részlet: a sofőr-mező nem ismétli a rendszámot.
- A #330-at a javítás után az „Újraolvasás az iratból” gombbal kell újraolvasni.
- Teszt: word-extractor próba-.docx fejléccel, teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-21 (2) — Új megbízó adatai magától, a megbízásból
- Tünet: PÁNTYA Kft. (új megbízó, #330) postacíme, e-mailje, fizetési határideje egy óra után is üres maradt; a tulajdonos: „ezt tényleg nekem kell?”.
- Ok: (1) a partner-kitöltés nem használta a megbízáson MÁR kiolvasott `postazasi_cim` / `fizetesi_hatarido_nap` mezőt; (2) a partner-irat kiolvasó csak a fájlnévvel rendelkező dokumentum-sort nézte — a #330 dokumentum-sora `fajlnev = null`; (3) a Word-irat fejlécét itt sem olvasta.
- Javítás: `partner-kitoltes(-alap).ts` — forrás a partner bérmegbízásainak mezője is (ha nem mondanak ellent; PDF-javaslat > megbízás-mező > számla); `partner-javaslat.ts` — fájlnév nélküli dokumentum és a megbízás `drive_file_id`-ja is, Word-fejléc. Óránként magától fut (modell-szinkron kör, a partner bekötése után); a fülön a gomb „Frissítés most”.
- Teszt: `teszt-partner-kitoltes.ts` 28/0, teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-21 (3) — #330 felrakó helye ismeretlen a Hét nézetben
- Tünet: „1 fuvar helye nem ismert … PÁNTYA (Florasca Tőzegüzem → Debrecen)”.
- Ok: a kézi javításkor (06:23) a felrakó „Florasca Tőzegüzem, Osli” lett; a geokód-tartalék a települést az első részből vette („Florasca Tőzegüzem”), az „Osli”-t sosem próbálta.
- Javítás: a #330 felrakója „9354 Osli, 035/6 hrsz. (Florasca tőzegüzem)” (a Florasca Kft. osli telephelye, kormányhivatali építési engedély szerint); `tervezes-het.ts` `geo`: a további, településnévnek látszó címrészek is jelöltek.
- Teszt: élőben a figyelmeztetés eltűnt; tsc, eslint, teljes `npm run teszt`.

## 2026-10-21 (4) — Hét: a már megtörtént fuvar a tényleges napján és sorrendjében
- Tünet: Gergő „ma: Dunakeszi … → Osli · 200 km üres ≈ 85 e Ft”, pedig közben ma reggel lement a Tata → Tompaládony saját fuvar (06:03–09:43), és Tompaládonyból Osli pár km.
- Ok: a lánc a TERVEZETT napokból dolgozott: a saját fuvar keddre volt írva (szerdán ment), így kedden a Krajnik elé került, a Dunakeszi lerakó után pedig közvetlenül a PÁNTYA osli felrakója jött.
- Javítás: `tervezes-het.ts` — a megállók tényleges ideje (GPS / sofőr) felülírja a fel-/lerakás napját; `tervezes-het-alap.ts` — `felIdo`: egy napon belül a megtörtént felrakások a tényleges sorrendjükben jönnek (a legközelebbi szomszéd csak a még nem teljesítetteknél dönt). A heti ütemterv ugyanezt az adatot kapja.
- Teszt: `teszt-tervezes-het.ts` 79/0 (+2), teljes `npm run teszt`, tsc, eslint, build.
- (11:05) Szabály kiegészítve: ami még NEM történt meg (ellenőrzésre vár / tervezett / folyamatban, nincs lerakás-tény) és a terve a múltba esik, a mai napra tolódik (felrakva → csak a lerakás; különben az egész fuvar, a hossza megmarad) — így csúszás miatt egy fuvar sem esik ki a heti láncból.
- (11:25) „Ezt a kocsik GPS-ből simán lehet látni”: a mai nézetben a kocsi MOSTANI helye (Ecofleet `getFleetLastPositions`, friss jel ≤ 3 óra) a kiindulópont az első még el nem kezdett fuvar előtt; a már megtörtént felrakás előtti útra nem számolunk rést (elmúlt). `HetiKocsi.most`. Teszt: `teszt-tervezes-het.ts` 82/0 (+3).
- (12:25) Ugyanez a „tény > terv” szabály a közös üres-km láncban (`ures-km.ts` `lancKm`: `tenyTol`/`tenyIg` — a tényleges nap és egy napon belül a tényleges sorrend), amit a Kimutatás/Költség (`koltseg-adat.ts`, már volt `teny_tol/teny_ig`) és a kocsi-kihasználtság (`kihasznaltsag.ts`, új al-lekérdezés) használ. Teszt: `teszt-ures-km.mts` 12/0 (+2).

## 2026-10-21 (5) — Ma: a vezetési sor a tachóból, nem GPS-becslés
- Kérdés: „ha már van konkrét tachó adat, miért nem látom, egyáltalán használjuk-e?”
- Állapot: a tachót (Ecofleet `getLastData` → `tcoData`) 2 percenként gyűjtjük (`jarmu_tacho_pillanat`), de a Ma kártyán csak egy kis csík és súgó használta; a fő sor („Vezetés ma 6:36 / 9:00 · szünet esedékes”) GPS-útjelentésből becsült, és ellentmondott a tachónak (Gergő 12:22: tachó szerint ma még 5:49). A 15 percnél régebbi tachó eldobódott — álló kocsinál (Micó, 11:38 óta nincs jel) így semmi nem látszott.
- Javítás: `tervezes-het-tacho.ts` `maTachoSor` — „Tachó: <állapot> HH:MM óta · ma még X vezethet · műszak még Y · hét Z/56 ó”, 15 perc fölött „· adat HH:MM”, 12 óra fölött nincs; `ma-vaszon.ts` / `.tsx`: ha van tachó, ez a fő sor „tachó” jellel, a GPS-becslés csak tartalék (`vezetesForras`).
- Teszt: új `teszt-ma-tacho.ts` 5/0, teljes `npm run teszt`, tsc, eslint, build.

## 2026-10-27 — Logo Trek megbízás: a lerakó Szakoly volt Győr helyett
- Hiba: a Logo Trek „Fuvarmegbízás” (Dunaharaszti–Győr) lerakója Szakolyra olvasódott. Ok: a PDF-ben a lerakónál csak „GYŐR” áll (utca nélkül), a teljes címes Szakoly a MEGBÍZOTT blokkunk; a pdf-parse a címkéket/értékeket szétszórja, a modell a rossz címet párosította.
- Javítás: új `lib/fuvarozas/import/logotrek.ts` (felrakó/lerakó/fuvardíj a pdfjs koordinátából), `partnerek.ts` új „Logo Trek Kft.” bejegyzés (45 nap, postacím Győr, Iktatószám), új `scripts/teszt-logotrek.mts` (4/0, `npm run teszt` láncban).
- Nyitott: általános védelem (saját cím lerakóként ➜ „ellenőrizendő”) nincs — csak a sablonos olvasók védenek; már beolvasott (hibás) soron a lerakót kézzel kell javítani vagy újraolvastatni.

## 2026-10-27 (2) — Szerkesztés: a megálló címe is követi a javítást
- Hiba: a Logo Trek sor lerakóját kézzel GYŐR-re javítva a fuvar mezője megváltozott, a megálló (`fuvar_megallok.cim_nyers`) és a lista „→ Szakoly” maradt (a `modell-szinkron.ts` csak a hiányzó ablakot/napot pótolta).
- Javítás: ugyanannyi megállónál a `cim_nyers` is frissül, de csak ha a megállót még nem érintette GPS-érkezés / sofőr-jelölés. Teszt: `teszt-modell-szinkron.ts` 23/0, eslint, tsc (csak a korábbi `app/layout.tsx` LayoutProps hiba).

## 2026-10-27 (3) — Sofőr „Hívás”: a mi saját számunk volt a lerakó kontaktja
- Hiba: Logo Trek lerakónál a sofőr appban a Hívás gomb „Budaházi Zoltán” volt. Ok: a „Kontakt:” rovat üres volt, a modell a legközelebbi ügyintézőt (a MEGBÍZOTT blokk — a miénk) írta a megálló kontaktjának; semmi nem szűrte.
- Javítás: `sajatKontaktE` (fuvar-constants.ts: név + saját számok végei); a `sofor-adatok.ts` ír- és olvasáskor is kiszűri (a már mentett sorok azonnal javulnak, DB-módosítás nélkül); a modell-utasítás pontosítva (kontakt csak a megálló „Kontakt:” rovatából; KISZOLGÁLTATÓ = felrakó cég, ÁTVEVŐ = lerakó cég, „Száll.szerint” → ceg null). Teszt: teszt-sofor-adatok 63/0.
- Nyitott: a mentett lerakó cég (Coca-Cola HBC) a Logo Trek soron még a régi — az utasítás csak új beolvasásra hat; a bevitt számú (saját) telefonvégek a fuvar-constants.ts-ben vannak, új saját szám esetén bővítendő.

## 2026-10-29 — Redesign 0c: C színséma + térhatás
- Tokenek (#EEF3FB alap, #0A84FF primary, árnyék/gradiens tokenek), kártya/gomb/fül/jelvény/oldalsáv térhatással; mobil érintetlen. Nyitott: beégetett színű modulok (Fuvarozás 2, Számlák, Jelenlét saját témái) a saját lépésükben.
