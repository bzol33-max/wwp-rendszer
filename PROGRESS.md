# PROGRESS

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
