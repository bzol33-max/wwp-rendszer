# Sofőr mobil nézet — terv (2026-09-17)

Cél: Gergő és Micó a telefonján lássa a megbízások RÁ tartozó részét, és a
nézet egyben adatot is adjon vissza a GPS és a Megbízások oldalnak. A
Duvenbeck-megbízások kapják a legnagyobb figyelmet, mert azok a
legsűrűbbek és a legtöbb hibalehetőséget hordozzák.

## 1. Mi van már meg (erre épül a terv)

| Elem | Hol | Mit ad |
| --- | --- | --- |
| Dolgozói mobil hub | `app/erkezes/page.tsx`, `components/erkezes/erkezes-sajat-view.tsx` | Csempés, bejelentkezés mögötti mobil nézet (Jelenlét, Feladatok, Készlet, Fuvarok, Profil) |
| Fuvarok képernyő | ugyanott, `FuvarokScreen` | EGY aktuális fuvar megállói, FELRAKVA/LERAKVA gomb, egy dokumentum-link |
| Sofőr-adat | `lib/fuvarozas/sofor.ts` | `getSoforAktualisTura`, `markMegalloKesz` (ír: `fuvar_megallo_allapot.kesz/kesz_at/kesz_by`) |
| Jogosultság | `lib/auth/permissions.ts` `fuvarozas_sajat` | Opt-in modul, `view`/`edit` külön |
| Mobil konvenció | `lib/mobil-theme.ts`, `components/mobil/pull-to-refresh.tsx` | Menta-antracit séma + lehúzásra frissítés (AGENTS.md szerint kötelező) |
| Fuvar-blokkok | `lib/fuvarozas/actions.ts` `fuvarBlokkok` | Fuvaronkénti, útvonal-sorrendes csoportosítás, csúszó jelölés |
| Időablakok | `fuvar_megbizasok.felrakas/lerakas_ablak_tol/ig` | Óra:perc pontos határidő (Duvenbeck PV/PB) |
| Dokumentum-pár | `fuvar_dokumentumok` (`tipus`, `verzio`) | Megbízás (TA…) + rakománylista (FRALI…) egy fuvaron |

### A mai Fuvarok képernyő négy hiányossága

1. **Csak egy fuvar látszik.** `getSoforAktualisTura` a legkorábbi nyitott
   fuvart adja. A Duvenbeck-napokon egy kocsin 2-3 fuvar van (Pápa ↔
   Debrecen ingázás), a sofőr a másodikat nem látja.
2. **Nincs időablak.** Csak dátum jelenik meg, pedig az ablak a valódi
   határidő, és ez már az adatbázisban van.
3. **Egy „Dokumentum" gomb.** A Duvenbecknél kettő van, és a kapuban a
   rakománylista kell (tiszta címek, referenciák, súly), az ablakok meg a
   megbízáson vannak. Ráadásul a link nyers Drive-URL: a sofőr Google-fiókja
   nem biztos, hogy megnyitja.
4. **Nincs visszacsatolás.** A sofőr csak pipálni tud; ha a cím rossz vagy
   a megbízásról hiányzik a pozíciószám, nincs mit tennie.

## 2. Elvek

- **Pénz nem látszik.** Fuvardíj, költség, eredmény, számla nem megy ki a
  sofőr nézetre. A logisztikához nem kell, a telefon viszont elveszhet.
  (Egy sorban átállítható, ha mégis kell.)
- **Ugyanaz a sorrend, mint a GPS oldalon.** A sofőr nézet a meglévő
  `fuvarBlokkok`-ra épül, nem külön logikára — különben a két oldal
  elcsúszhat egymástól, és a sofőr mást lát, mint a diszpécser.
- **A dátum irányadó, az állapotot a GPS dönti** (a már rögzített elv):
  a csúszó fuvarok a sofőrnél is látszanak, jelöléssel.
- **Egy koppintás, nagy célpont.** Vezetés közben használják: 44px-es
  célpontok, a következő megálló egy nagy kártya, navigáció egy gombbal.

## 3. Képernyők

### 3.1 „Ma" — a fő nézet

- Fejléc: sofőr neve, kocsi rendszáma, a nap.
- **Következő megálló** nagy kártyán: város, teljes cím, „Fel"/„Le" címke,
  időablak (`07:00–15:00`) és visszaszámolás, navigáció-gomb (Google Maps /
  Waze a koordinátára vagy a címre), „Megérkeztem" gomb.
- Alatta **fuvaronkénti blokkok** (a GPS oldal blokkjaival egyező
  sorrendben), blokkfejléc: megrendelő, Reise ID / pozíciószám, irány
  (`Pápa → Debrecen`), csúszó fuvarnál „Korábbról csúszik" jelölés.
- Minden megálló sora: város, ablak, állapot (kész pipa / GPS szerint
  érintve / hátra van), és a megerősítő gomb — **nem csak a soron
  következőn**, mert a valóságban nem mindig sorrendben történik.

### 3.2 „Fuvar" — részletek

- Reise ID nagy betűvel, koppintásra vágólapra (a kapuban ezt kérik, és ez
  a számlázási kulcs is).
- Megrendelő, áru, **súly kg-ban**, megjegyzés.
- **Két dokumentum külön gombbal**: „Megbízás (TA…)" és „Rakománylista
  (FRALI…)", a `fuvar_dokumentumok.tipus` szerint, verziószámmal.
- Kapcsolattartó telefonszám a `fuvar_kapcsolatok`-ból, koppintásra hívás.
- Megállók listája ablakokkal, alattuk a megerősítő gombok.

### 3.3 „Holnap" — előnézet

A meglévő `getKovetkezoNapokElonezet` 3 napos előnézete, csak olvasható:
mit kell holnap, hánykor, hol. A sofőr ma este tudja, mikor kell indulni.

### 3.4 „Papírok"

Fuvaronként a lerakásnál a fuvarlevél/CMR lefotózása. Lásd 5.2.

## 4. Duvenbeck-specifikumok

Ezekre külön figyelni kell, mert a Duvenbeck az egyetlen gépi sablonos,
napi több fuvart adó partner:

1. **Reise ID a főcím.** Nem a belső fuvar-azonosító, nem a dátum: a kapuban
   és a számlán is ez a hivatkozás. Minden blokkfejlécen ott van.
2. **Két irat, külön névvel.** A rakománylista a kapu-irat, a megbízás az
   ablakokat és az utasításokat tartalmazza. Egy „Dokumentum" gomb helyett
   kettő, a hiányzót letiltva mutatjuk (látszódjon, hogy nem érkezett meg).
3. **Időablak megállónként.** PV/PB órára pontosan; a lejáró ablakot
   sárgán, a lejártat vörösen jelöljük. Ez a legerősebb új információ a
   sofőrnek.
4. **Ingázó körök.** Ugyanaz a telephely (BMW Debrecen, Yanfeng Pápa) egy
   fuvar lerakója és a következő felrakója. Sima megálló-listában ez
   „fel-le-le-le" káosznak látszik — ezért kötelező a fuvaronkénti blokk és
   az irány kiírása. (Ugyanez a hiba volt a GPS oldalon, ott már javítva.)
5. **Rossz rendszám a megbízáson.** A Duvenbeck következetesen „NZM-492"-t
   ír. A felismerés ezt már kezeli (`irasvaltozatok`), de ha a megbízáson
   lévő rendszám mégsem oldódik fel a sofőr kocsijára, halk figyelmeztetés
   kell („a megbízáson más rendszám áll"), nem elrejtés — különben a sofőr
   nem látja a saját fuvarját.
6. **Súly.** A megbízás kg-ban adja; a sofőrnek a rakodásnál kell.
7. **EUR-os díj.** Nem látszik (2. pont, pénz nem megy ki).

## 5. Funkciók, amik a GPS oldalt segítik

### 5.1 Pontos idő a becslés helyett

A „Megérkeztem" / „Elindultam" koppintás a mostani `markMegalloKesz`-nél
többet ad: tényleges érkezés és távozás. A `fuvar_megallo_allapot` már
tárol `gps_erkezes`/`gps_tavozas` oszlopot, a kézi idő ettől függetlenül
kell (új oszlop vagy a `kesz_at` pontosítása). Haszna:

- a `lerakas_tenyleges_at` (papír- és számlázási határidő alapja) tény lesz,
  nem becslés;
- a GPS-felismerés melléfogása (pl. két megálló egy gyáron belül) mellett is
  helyes marad a lezárás.

### 5.2 Rossz cím javítása a helyszínről

Ez a legnagyobb nyereség. A GPS-felismerés akkor hiúsul meg, ha a cím
geokódolása bizonytalan (`cimPontossaga` → `ismeretlen` / `csak_varos`) —
pont ez volt az RBT „[H-4243] TÉGLÁS" eset. Ha a sofőr a megállóban egy
gombbal elküldi a telefon (vagy a kocsi) tényleges koordinátáját mint a
megálló valódi helyét, onnantól minden ugyanoda tartó fuvar automatikusan
lezáródik. Tárolás: telephely-szótár a cím normalizált kulcsával
(`fuvar_helyszin_koordinata` tábla), amit a geokódoló a külső hívás előtt
megnéz.

### 5.3 Várakozás jelölése

Start/stop gomb a megállóban. A GPS-ből az állás látszik, de az OKA nem —
a Duvenbecknél a várakozás pótdíjas, tehát pénz. A jelölés a diszpécsernek
szól, nem automatikus számlázás.

## 6. Funkciók, amik a Megbízások oldalt segítik

1. **Elakadt fuvar felvétele.** A GPS oldal „elakadtak" doboza azokat
   mutatja, amiken nincs kocsi. Ha a sofőr egy gombbal magára veheti („ez
   az enyém"), a diszpécser munkája elmarad. Naplózva (ki, mikor), csak a
   mai/holnapi, kocsi nélküli sorokra.
2. **Papír-fotó a lerakásnál.** A számlázás ma azon áll, hogy a papír
   fizikailag beérkezik (`papirok_beerkeztek_at`). A fotó nem váltja ki, de
   aznap megmutatja, hogy a papír létezik és mi van rajta — az elveszett
   fuvarlevél ma két hét múlva derül ki.
3. **Pozíciószám beírása.** Ha a megbízásról nem sikerült kiolvasni, a
   kapuban kapott számot a sofőr beírhatja — a Megbízások oldal
   pozíciószám-hiány jelzése megszűnik, és a számlára rákerül.
4. **Gondjelzés.** Szabad szöveg + fotó, ami a `feladatok` táblába kerül, és
   a diszpécser oldalán megjelenik (a Feladatok csempe már létezik).
5. **Papíron kapott megbízás lefotózása.** Ami nem a Drive-on jön, az ma
   nincs a rendszerben. A fotó bekerül az import naplóba feldolgozásra.

## 7. Technikai terv

- **Adat egy helyről.** Új `getSoforNap(employeeId, napISO)` a
  `lib/fuvarozas/sofor.ts`-ben, ami a `lib/fuvarozas/actions.ts`
  `fuvarBlokkok`-ját használja. A sorrend- és csúszó-logikát NEM másoljuk.
- **Sofőr ↔ kocsi összerendelés.** A mai `findJarmuByEmployeeName`
  névtartalmazásra épül („Vadon Gergő" tartalmazza a „Gergő"-t). Ez időzített
  bomba: egy másik Gergő nevű alkalmazott átveszi a fuvarokat. Explicit
  összerendelés kell (`alkalmazottak` oszlop vagy a `vehicles.ts`-ben a
  teljes név), migrációval.
- **Dokumentum-proxy.** `app/api/fuvarozas/dokumentum/[dokId]/route.ts`, ami
  a meglévő service accounttal (`GOOGLE_SERVICE_ACCOUNT_KEY`,
  `drive.readonly`) streameli a PDF-et, `fuvarozas_sajat` jog mögött. A nyers
  Drive-link a sofőr fiókjával nem nyílik meg.
- **Fotó-tárolás.** Kérdés: Drive-ba (a fuvar mappájába, `drive.file` scope
  kell, ma csak readonly van) vagy adatbázisba. Javaslat: Drive, mert a
  papírok is ott vannak, és a Posta/Számlák oldal onnan dolgozik.
- **Jogosultság.** A meglévő `fuvarozas_sajat` elég; az írásokhoz `edit`.
- **Megjelenés.** `MOBIL_THEME` + `PullToRefresh` (AGENTS.md).
- **Tesztek.** A sorrend és a Duvenbeck-blokkosítás már tesztelt
  (`scripts/teszt-erintes.mts`, `teszt-duvenbeck.mts`); az új
  `getSoforNap`-ra a blokk-sorrendre és a csúszó fuvarra kell eset.

## 8. Fázisok (mindegyik önmagában értékes, külön PR)

1. **A mai nap teljes képe.** `getSoforNap`, fuvaronkénti blokkok,
   időablakok, Reise ID, két dokumentum a proxyval, minden megálló
   megerősíthető, holnapi előnézet. Ez oldja meg a kérést: „lássák a rájuk
   tartozó részt".
2. **Visszacsatolás a GPS-nek.** Megérkeztem/Elindultam pontos idővel,
   rossz cím → valódi koordináta (5.2), ami a felismerést javítja.
3. **Papír és hibajelzés.** Fuvarlevél-fotó, gondjelzés a feladatokba,
   pozíciószám beírása.
4. **Diszpécser-tehermentesítés.** Elakadt fuvar felvétele, várakozás
   jelölése.

## 9. Nyitott döntések

1. Lássa-e a sofőr a fuvardíjat? (Javaslat: ne.)
2. Felvehet-e magára kocsi nélküli fuvart? (Javaslat: igen, naplózva.)
3. Fotók Drive-ba vagy adatbázisba? (Javaslat: Drive, scope-bővítéssel.)
