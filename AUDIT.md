# WWP-rendszer — átvizsgálás (2026-10-25)

Ág: `audit/2026-10`, alap: `origin/main` f2ec9a2. Ebben a fázisban **semmi nincs javítva**. Az ágon csak a smoke tesztek (b29d279) és ez a jelentés van. Előzmény: a 2026-10-04-i audit (`helyi/audit-2026-10-04.md`). Annak tételeit egyenként újraellenőriztem a kódban (lásd 7. fejezet). 45 tétel javítva vagy megszűnt, 17 részben vagy egészben nyitott.

## 0. Hogyan készült, mit nem fed le

| Lépés | Eredmény |
|---|---|
| Smoke tesztek (Playwright, `e2e/`) | 7/7 zöld `next dev` és buildelt `next start` ellen is. **Ez a kiinduló állapot.** |
| `tsc --noEmit` | 0 hiba |
| `eslint` | 19 hiba, mind `react-hooks/set-state-in-effect`, 15 fájlban (korábban 36) |
| `knip` | 1 nem használt fájl, 158 nem használt export, 131 nem használt típus, `server-only` nincs a függőségek között |
| `jscpd` (≥70 token) | 19 klón, 215 sor, 0,29%: alacsony |
| Bundle (`next build` + `experimental-analyze`) | Minden oldal első betöltése 188–267 KB gzip. Az alap 188 KB minden útvonalon (Next + React-DOM + Base UI). Kiugró: `/erkezes` 267 KB, `/keszlet` 247 KB |
| `next build` | rendben, 18 s |
| DB: EXPLAIN (ANALYZE, BUFFERS) | **Nem az éles DB-n futott**, lásd lent |

**Éles DB:** az éles Railway `Postgres` szolgáltatásnak nincs nyilvános TCP-proxyja, kívülről nem érhető el. Proxyt nyitni infrastruktúra-módosítás lett volna, ezért nem nyitottam. Az EXPLAIN-ek a `Postgres-teszt` szolgáltatáson futottak, read-only munkamenetben (`default_transaction_read_only=on`, `begin read only`, csak SELECT). Ez a teszt-DB **2026-10-07 óta nem frissül**: 220 megbízást tartalmaz, és a 028-as migrációig jut. Az időértékek tehát a mai adatméretre vonatkoznak, nem a jövőbelire. Ha éles méréseket szeretnél, egy rövid időre nyitott TCP-proxyval megismételhetők (`scratchpad/explain_queries.sql`, 15 lekérdezés).

**Helyi teszt-környezet:** eldobható Postgres 16 (embedded-postgres, 55432-es port), `.env.audit.local`, a leírás az `e2e/README.md`-ben. Felépítése közben derült ki az A1 és az A2.

Jelölések: **⚠ viselkedés** = a javítás megváltoztatja, amit a felhasználó lát vagy amit a rendszer csinál, ezért külön döntés kell. Ezek nélkül a lista „a működés nem változik” szabály szerint végrehajtható.

---

## 1. Rangsor hatás szerint (a javítási sorrend javaslata)

| # | ID | Mi | Kockázat | Nyereség | Ráfordítás |
|---|---|---|---|---|---|
| 1 | A1 | Üres DB-ről a rendszer nem építhető fel (séma ↔ migráció sorrend) | **magas** (katasztrófa-helyreállítás) | a visszaállítási terv működik | kicsi |
| 2 | A2 | Friss DB-n a `mozgatas_be` CHECK nem bővül, a raktármozgatás hibát dob | **magas** (helyreállítás után) | ua. | kicsi |
| 3 | A3 | `visszaveszem` / `kocsiraAdom`: ellenőrzés és írás tranzakción kívül | közepes (sofőr-adat elveszhet) | adatintegritás | kicsi |
| 4 | A4 | Hitelesítés nélküli `/api` végpontok a teljes body-t beolvassák | közepes (memória-kimerítés) | stabilitás | kicsi |
| 5 | A5 | Fotófeltöltés: lezárás és fotó két külön tranzakcióban | közepes | adatintegritás | közepes |
| 6 | D1 | Holt, de élő végpontként elérhető szerverakciók (`setFuvarPostazva` stb.) | közepes (az állapotgépet megkerülik) | kisebb támadási felület | kicsi |
| 7 | P1 | Megbízások lap: a 3000 soros SOR_SQL kétszer fut, soronként ~8 al-lekérdezéssel | ma alacsony, négyzetesen nő | gyorsabb lap | közepes |
| 8 | P2 | Tervezés: legfeljebb kb. 200 párhuzamos lekérdezés, a 10-es pool telítődik | közepes (a többi kérés vár) | gyorsabb, stabilabb | közepes |
| 9 | P3 | Kocsik lap: kb. 20 lekérdezés percenként, nyitott fülenként | alacsony-közepes | kisebb DB-terhelés | közepes |
| 10 | P4 | Sofőr app: 15 napra egyenként `getSoforNap`, mindegyik ír is | közepes | gyorsabb appnyitás | közepes |
| 11 | P5 | Hiányzó indexek (lista: 4. fejezet) | ma alacsony | jövőálló | kicsi |
| 12 | E1–E6 | Félrevezető dokumentáció (CLAUDE.md, runbook, README) | közepes (rossz döntéshez vezet) | — | kicsi |
| 13 | Q1 | Nincs CI-kapu; a lint 19 hibával bukik | közepes | regresszió ellen véd | kicsi–közepes |
| 14 | A6–A9, D2–D5, P6–P9, Q2–Q4 | Kisebb tételek | alacsony | — | kicsi |
| — | B1–B3 | Üzleti döntést igénylő tételek (⚠ viselkedés) | — | — | döntés kell |

---

## 2. Hibák (A)

### A1 — Üres adatbázisra a `migrate.mjs` elhasal (KRITIKUS a helyreállításhoz)
- **Hol:** `db/schema.sql:1105` és `:1122` (`fuvar_partner_javaslat`, `fuvar_partner_kiolvasas`) a `fuvar_partnerek`-re hivatkozik. Ezt a táblát a `db/migrations/001_fuvarozas2_sema.sql` hozza létre, a `migrate.mjs:42-44` viszont előbb a teljes sémát futtatja, csak utána a migrációkat. 2026-10-01 óta (bf8848d, #265) ez a helyzet.
- **Bizonyíték:** üres Postgres 16-on `relation "fuvar_partnerek" does not exist`, a migráció leáll. Élesben nem jön elő, mert ott a tábla már létezik.
- **Hatás:** a `docs/visszaallitas-30-perc.md` szerinti, üres DB-re visszaállítás, egy új környezet vagy a teszt-DB újraépítése nem működik.
- **Javítás:** a két táblát (és indexét) a schema.sql-ből egy új migrációs fájlba kell áttenni (`if not exists`, élesben no-op). A smoke-környezet felépítése üres DB-ről igazolja.
- **Nyereség:** működő katasztrófa-helyreállítás. **Viselkedés: nem változik.**

### A2 — Friss DB-n a `keszlet_movements` CHECK nem engedi a `mozgatas_be`-t
- **Hol:** `db/schema.sql:95` (beágyazott `check (direction in ('be','ki','mozgatas'))`, a Postgres automatikus neve `keszlet_movements_direction_check`) és `:113-118` (a bővítés csak akkor fut, ha még nincs ilyen nevű constraint).
- **Bizonyíték:** üres DB-n a migrate a `mozgatas_be` sor beszúrásánál elhasal. A beágyazott CHECK ugyanazt a nevet kapja, ezért a bővítés sosem fut le. Az audit DB-2 javítása (8138c5d) hozta be.
- **Hatás:** helyreállítás után a telephelyek közti mozgatás hibát dob.
- **Javítás:** a `create table`-ben a CHECK legyen eleve a 4 értékes. A DO-blokk maradjon, ha egy régi DB-n még a 3 értékes él (vagy a feltétel a definíciót nézze, ne a nevet). **Viselkedés: nem változik.**

### A3 — `visszaveszem` és `kocsiraAdom`: versenyhelyzet
- **Hol:** `lib/megbizasok/akciok.ts:860-882` (`visszaveszem`) és `:847-856` (`kocsiraAdom`).
- **Forgatókönyv:** az iroda a „Visszaveszem”-re kattint. A kód ellenőrzi, hogy a sofőrnek még nincs aktivitása, de ez tranzakción kívül történik. Ha közben a sofőr megnyomja a „Megérkeztem”-et, a feltétel nélküli `delete from fuvar_megallok` törli a sofőr rögzített tényét. A `kocsiraAdom` hasonló: dupla kattintásnál, vagy ha a `frissitsdFuvarozas2Modellt` elhasal, a fuvar kocsin van, de megálló nélkül.
- **Javítás:** `withTransaction` plusz `select … for update` a fuvar sorára. Az aktivitás-ellenőrzés a tranzakción belül fusson, vagy legyen az `update … where not exists (…)` része. **Viselkedés: nem változik** (csak a versenyhelyzet szűnik meg).

### A4 — Hitelesítés nélkül elérhető végpontok korlát nélkül olvassák a body-t
- **Hol:** `app/api/csp-jelentes/route.ts:10` (`req.text()`, csak utána vág 2000 karakterre) és `app/api/fuvarozas/fuvarlevel-feltoltes/route.ts:19` (`request.formData()` a session-ellenőrzés előtt). Az `/api` ki van véve a proxy alól (`proxy.ts:56`).
- **Forgatókönyv:** bejelentkezés nélkül nagy POST-okkal memóriát lehet foglalni, egy Railway-példány le is állhat.
- **Javítás:** CSP-végpont: `content-length` vizsgálat (nagyobb body esetén 413), streamből legfeljebb 8 KB-ot olvasni. Feltöltés: előbb `verifySession()`, azonnal 401, ha nincs session, plusz `content-length` > 9 MB esetén 413. **Viselkedés: nem változik** a jogos hívóknak.

### A5 — Sofőr-fotó: a lezárás és a fotó nem atomikus
- **Hol:** `lib/fuvarozas/sofor.ts:871-874` (`megalloKeszLezarassal` commitol) és `:900` (külön insert).
- **Forgatókönyv:** ha a fotó beszúrása elbukik (méret, timeout), a megálló már „kész”, a fuvar „teljesítve”, fotó nélkül.
- **Javítás:** egy tranzakció, vagy a fotó előbb, a lezárás utána. **Viselkedés:** a sikeres út nem változik. Hibánál a lezárás is elmarad, és a sor újrapróbálja.

### A6 — A fotó idempotencia-kulcsa globális, nem fuvaronkénti
- **Hol:** `db/migrations/048…sql` (unique `kliens_kulcs`), `sofor.ts:898` (`on conflict (kliens_kulcs) … returning id`). Az előellenőrzés (`:846`) fuvar szerint szűr, az ütközéskezelés nem.
- **Kockázat:** alacsony, mert a kulcs véletlenszerű. Ütközésnél viszont egy másik fuvar dokumentum-azonosítóját adná vissza.
- **Javítás:** unique `(fuvar_id, kliens_kulcs)` és `on conflict (fuvar_id, kliens_kulcs)`.

### A7 — Google Drive kliensnek nincs időkorlátja
- **Hol:** `lib/fuvarozas/drive-sync-core.ts:104-112`.
- **Hatás:** egy beakadt hívás újraindításig fogja a driveSync zárat (PERF-1 maradéka).
- **Javítás:** `timeout` a kliens opcióiban.

### A8 — A kézi „Frissítés most” számla-szinkronon nincs példányok közti zár
- **Hol:** `lib/szamlak/actions.ts:351-354`, `poll.ts:346`.
- **Hatás:** deploy-átfedéskor dupla Számlázz.hu-lekérdezés.
- **Javítás:** ugyanaz az `egyetlenPeldanyban` (`lib/db.ts:69`), mint az ütemezőnél.

### A9 — Kisebb biztonsági maradékok (a 10-04-i auditból)
- **SEC-5:** `megallo-naplo.ts` még `"use server"`. Fuvarozás-szerkesztő joggal hamisítható a GPS-idő → a direktíva le, csak belső modul legyen.
- **SEC-10:** a 4 Gmail-route még elfogadja a `?token=` paramétert.
- **SEC-6:** a minimális jelszóhossz 6; a `bejelentkezes_hiba` sorai sosem törlődnek.
- **SEC-8:** a kijelentkezés nem érvényteleníti a sütit.
- **DB-5:** `addAdvance` dupla kattintásra két sort hoz létre.
- **CFG-6:** koordináta és cím a logban (`sofor.ts:~829`).
- **⚠ viselkedés:** a jelszóhossz-emelés és a `?token=` megszüntetése (a Gmail Apps Script-et is át kell írni) igen, a többi nem.

---

## 3. Duplikációk és halott kód (D)

### D1 — Holt, de végpontként elérhető szerverakciók
- **Melyek:** a knip szerint nincs hívójuk:
  - `lib/fuvarozas/megbizasok.ts`: `addFuvar`, `setFuvarPostazva`, `setMegalloKesz`, `setFuvarSzamlaSzam`, `getFuvarokIdoszakban`
  - `lib/megbizasok/akciok.ts:499, 529`: a párjaik
- **Miért számít:** `"use server"` exportként ezek nyilvános POST-végpontok. A `setFuvarPostazva` megkerüli az állapotgépet (BIZ-2 maradéka).
- **Javítás:** törlés. A fájlmozgatási szabály miatt egy függvény törlése kódváltozás, nem fájltörlés. **Viselkedés: nem változik** (nincs UI-hívó).

### D2 — Nem használt fájl
- **Melyik:** `lib/auth/api-guard.ts` (a route-ok saját guardot használnak, csak egy komment hivatkozik rá).
- **Javítás:** áthelyezés az `archive/` mappába.

### D3 — 158 nem használt export és 131 típus (knip)
- **Mi ez:** többségük konstans vagy segédfüggvény, amelyet a tesztek importálnak, vagy csak „biztonsági” export.
- **Javítás:** csak a `"use server"` fájlokban lévőket érdemes kezelni (D1). A többi zaj, alacsony prioritás.

### D4 — Párhuzamos implementációk
- **Telephely-listák (BIZ-12):** legalább 7 helyen (`nav.ts:39`, `keszlet/actions.ts:51,80`, `attekintes/actions.ts:546`, `erkezes-sajat-view.tsx:77,714`, `telephelyek-view.tsx:43,77`, `archivum-view.tsx:34`).
- **Pénzformázók (DEAD-8):** 24 találat, ebből 4 `de-DE`.
- **Két `jarmuMatch`:** `attekintes/actions.ts:220` és `sofor-jarmu.ts:17`.
- **`tipus` vs. `jelleg`:** az új `sofor-app.ts:91,114` megint a `tipus`-t használja (BIZ-3).
- **jscpd legnagyobb klónjai:** `employee-card.tsx` (3 blokk), `users-manager.tsx`/`employees-manager.tsx` fejléc, `keszlet-mobil.tsx` (2 blokk), `generalas.ts`/`optimalizalo-szerver.ts`.
- **Javítás:** közös modulba kiemelés, egyenként, mindegyik után smoke-futtatással. A pénzformázók egységesítése **⚠ viselkedés**, mert látható formátum-eltérést szüntet meg.

### D5 — Függőség-higiénia
- `server-only` 35 fájlban importálva, de nincs a `package.json`-ban (a Next-ből jön tranzitívan) → felvenni.
- A knip `tw-animate-css` és `tailwindcss` jelzése téves (CSS-ből használt).

---

## 4. Lassító pontok (P)

A mai adatmérettel (teszt-másolat, 220 megbízás) **minden gyanús lekérdezés 7 ms alatt fut**. A lassúság ma a körutak számából jön, nem az egyes lekérdezésekből. A soronkénti seq scanek a megbízás-számmal négyzetesen nőnek.

### P1 — Megbízások lap (`/fuvarozas2/megbizasok`)
- **Hol:** `lib/megbizasok/repo.ts:70` (SOR_SQL, limit 3000). Kétszer fut ugyanarra a lapra: `getKetOszlop` és `getPenzLista`, `page.tsx:59`.
- **EXPLAIN:** soronként `szallitolevel_import×137`, `fuvar_elszamolas×42`, `fuvar_partnerek×32` seq scan, 5,9 ms.
- **Javítás:**
  - index `szallitolevel_import (megbizas_id)`;
  - a „partner utolsó postai címe” egy CTE-ben (`distinct on (partner_id)`);
  - a két hívás egy lekérdezésből dolgozzon;
  - plusz FE-5: 1500 elemes keresőindex a kliensnek.
- **Viselkedés: nem változik.**

### P2 — Tervezés hete
- **Hol:** `lib/fuvarozas2/tervezes-het.ts:446` → `legjobbElvinniHelyek` × 15 → `getElvinniHet` × 3 hét → ~5 lekérdezés. Legfeljebb kb. 200 lekérdezés, egyszerre indítva.
- **Hatás:** a `max: 10` pool telítődik, a többi oldal kérései várnak.
- **Javítás:** hetenként egyszer betölteni a munkákat, járműveket és telephelyet, a jelölteket memóriában számolni. **Viselkedés: nem változik.**

### P3 — Kocsik lap (`/fuvarozas2`), percenkénti frissítés
- **Hol:** `ma-vaszon.ts:332`. Kb. 20 egymás utáni lekérdezés; `canNapok` járművenként külön (`:703`, ugyanez `jarmuvek/actions.ts:125`).
- **Javítás:**
  - `jarmu_id = any($1)` kötegelés;
  - az `elsz`/`papir`/`papirKocsinkent` egy aggregátumba;
  - folyamaton belüli cache 30–60 s-ra a lassan változó részekre.

### P4 — Sofőr app megnyitása
- **Hol:** `lib/fuvarozas/sofor.ts:496`. A `getSoforNapokElore` 15 napra egyenként hívja a `getSoforNap`-ot, mindegyik `getIdovonalak`-ot és egy `insert … on conflict` **írást** végez (`:530`) minden olvasáskor.
- **Javítás:** egy lekérdezés 14 napra; a dokumentum-csatolás az import útra kerüljön. **Viselkedés: nem változik.**

### P5 — Hiányzó indexek
| Tábla | Index | Melyik lekérdezésnek |
|---|---|---|
| `szallitolevel_import` | `(megbizas_id)` | SOR_SQL (P1) |
| `fuvar_megbizasok` | `(szamla_szam)` és `gin (kieg_szamla_szamok)` | párosítatlan számlák, 15 perces szinkron (`megbizasok.ts:346,451`) |
| `fuvar_elszamolas` | `(szamla_szam)` | ua. |
| `fuvar_import_naplo` | `(fuvar_id)` | szinkron (`:330`) |
| `fuvar_level` | `(drive_file_id)` | Drive-sync (`drive-sync-core.ts:466,941`) |
| `fuvar_megbizasok` | `((coalesce(lerakas_datum, datum)) desc, id desc) where torolt_at is null` | rendezés, napi szűrők |
| `keszlet_movements` | `(site_id, created_at desc)` | `getMovements` (`keszlet/actions.ts:180`) |

- Mind `create index if not exists` új migrációban; a mai mérettel ezredmásodperces, zárolásmentesen is felvehető.
- Mellé a `getParositatlanFuvarszamlak`-ban az `OR`-t két `NOT EXISTS`-re kell bontani.
- **Viselkedés: nem változik.**

### P6 — Minden cache-találat egy UPDATE
- **Hol:** `lib/fuvarozas/kulso-hivas.ts:141` (`talalat + 1`). A táblában nagy jsonb van (14 MB a teszt-DB-n), a becslés napi 10–15 ezer hívás.
- **Javítás:** sima SELECT; a számláló kötegelve vagy elhagyva.

### P7 — GPS-figyelő (5 percenként)
- **Hol:** `megallo-naplo.ts:53` → `megallo.ts:57`. Megállónként select, majd update, változatlan értékkel is (nem HOT update, index-churn).
- **Javítás:** egy `update … from unnest(…) where … is distinct from …`. Telemetria: többsoros insert (`jarmu-telemetria/repo.ts:21`).

### P8 — Számla-poll sztornó-újraszámolás
- **Hol:** `lib/szamlak/sztorno.ts:36-96`. Tranzakció nélkül nulláz, majd újrajelöl, ezért az olvasók egy pillanatig nyitottnak látják a sztornózott számlát. Minden sort újraír.
- **Javítás:** `withTransaction` plusz `is distinct from` feltétel.

### P9 — Bundle
- Az alap 188 KB gzip minden oldalon, a `/login`-on is (Next, React-DOM, Base UI, sonner).
- `/erkezes`: +123 KB saját chunk (sofőr app, egyben töltődik). `/keszlet`: +64 KB.
- Nagy könyvtár (xlsx, pdfjs, leaflet) nem kerül az első betöltésbe, ez rendben van.
- **Javaslat:** a sofőr app ritkán használt lapjai (fotózás, OpenCV-alapú lap-kereső) `next/dynamic`-kal. Mérhető nyereség: kb. −30–60 KB az `/erkezes` első betöltésén. Alacsony prioritás.

---

## 5. Elavult tervek és leírások (E)

| # | Hol | Mit állít | Valójában | Javaslat |
|---|---|---|---|---|
| E1 | `docs/visszaallitas-30-perc.md:10` (runbook) | `FUVAROZAS_REGI=on` visszahozza a régi fület | A kapcsolót semmi nem olvassa, a régi UI 2026-10-04-én törölve | 1. lépés törlése; a DB-visszaállító rész marad (A1 javítása után működik is) |
| E2 | `CLAUDE.md` „Mobil UX nyitott hibák” | 3 nyitott hiba | Az 1. (font) és a 2. (narancs szín) javítva, a 3. részben (Készlet, Számlák, Dolgozók táblái maradtak) | Frissíteni. **Fontos:** egy session most „javítaná” a már narancs színt |
| E3 | `CLAUDE.md` Ecofleet | csak `getLastData` | `getTrips`, `getRawData`, `Reports/getReport`, webhook és telemetria is be van kötve | Átírni, hivatkozás a `docs/ecofleet-telemetria-terv.md`-re |
| E4 | `README.md:12,16` | GPS, elszámolás; `FUVAROZAS_REGI=off` | Mindkettő megszűnt | Javítani; hiányzó env változók felvétele (`ECOFLEET_WEBHOOK_TOKEN`, `SEED_*`, `OPENROUTER_*`, `TELEMETRIA_NAPLO`…) |
| E5 | `lib/attekintes/actions.ts:231` | „lásd lib/dashboard/actions.ts” a fordított Saját/Bér címkéhez | A fájl nem létezik, a magyarázat elveszett | A magyarázatot a helyére írni (különben valaki „kijavítja” a fordítást) |
| E6 | `scripts/migrate.mjs:56-61,80-84` | `app/mobil`, `app/posta` | Nem léteznek; a BudahaziZoltan seed `mobil` jogot ad, ami már nem `ModuleKey`, így friss DB-n a fiók semmit nem lát | Komment és seed-kulcs javítása (`attekintes`). Jelszó nem kerül vissza |
| E7 | `AGENTS.md` mobil konvenció | `/mobil`, `/posta` átállítva | `/mobil` nincs, `/posta` átirányítás; az új `/m` saját palettát használ, `PullToRefresh` nélkül | Útvonal-lista frissítése, `/m` kivételként |
| E8 | ~20 komment | „GPS lap” élő oldalként | 2026-10-12 óta nincs (`napi-fuvarok.ts`, `fuvar-constants.ts`, `teljesites-figyeles.ts`…) | Szövegcsere: „idővonal (getIdovonalak)” |
| E9 | `app/m/layout.tsx:9`, `lib/fuvarozas/megbizasok.ts:212` | „Ma · Fuvar · Cég · Rendszer”, `app/posta` | Megszűntek | Javítani |
| E10 | `docs/*.md` | 7 terv | Megvalósult vagy felülírt: sofor-mobil, ma-n1, ajanlat-q2, ecofleet-telemetria, fuvarozas-1-hullam (egy maradék: `getFuvarokIdoszakban`, lásd D1), fuvarozas-2-kor, het-b1, het-racs-2 | `docs/archive/`-ba mozgatni, „megvalósult / felülírta: …” fejléccel |
| E11 | `PROGRESS.md` (4099 sor) | — | Vegyes sorrend (újak felül a 285. sorig, aztán régi→új, a végén megint 10-21-es bejegyzések) | Újak elöl; a 2026-09-es rész `archive/PROGRESS-2026-09.md`-be |
| E12 | `lib/modules.ts` | Járművek: `fejlesztes-alatt` | Használatban van; a Számlák leírásából hiányzik a kontókivonat | Állapot: **döntés kell**; a leírás bővíthető |
| E13 | `helyi/modul-inditok.md` (nem verziózott) | nem létező utak (`app/posta`, `app/m/fuvar`, `lib/dashboard`), Járművek „tervezés alatt” | — | Frissíteni |
| E14 | `.env.teszt.local` (main checkout) és `.claude/launch.json` `dev-teszt-db` | „teszt” | A Railway `Postgres-teszt`-re mutat, ami 10-07 óta elavult (028-as migráció); a dev szerver ráadásul ütemezőket is indít ellene | Átnevezni vagy frissíteni a teszt-DB-t; ne keverhető legyen az éllel |

---

## 6. Folyamat és minőség (Q)

- **Q1 — Nincs CI.** Nincs `.github/workflows`, nincs pre-push hook. Javaslat: GitHub Actions, `typecheck`, `teszt`, `build`. A smoke tesztek Postgres service-konténerrel futhatnak, miután az A1 és az A2 javítva van (üres DB-ről kell felépülnie).
- **Q2 — eslint 19 hiba** (`set-state-in-effect`, 15 fájl). A javítás komponensenként apró refaktor (betöltés `useEffect` helyett eseménykezelőben, vagy a kezdőérték `useState(() => …)`), mindegyik után smoke. Utána a lint mehet a CI-be.
- **Q3 — Tesztlefedettség.** Nincs teszt a login/session-re, a részfizetésre, a számla-pollra; a `teszt-akcio-jogok` a `requireSession`-t is guardnak fogadja el (gyenge ellenőrzés).
- **Q4 — FE-1 maradéka.** Nincs `loading.tsx`; a kliens-oldali betöltések hibakezelése nem egységes.

---

## 7. A 2026-10-04-i audit tételeinek állása

**Javítva vagy megszűnt (45):**
- SEC-1, 2, 3, 4, 7, 11, 12, 13
- RACE-1, 2, 3, 4, 5, 6
- DB-1, 2, 3
- BIZ-4, 7, 8, 9, 10, 13
- PERF-2, 3, 4, 5, 6, 7
- FE-2, 3, 8
- DEP-1, 2, 4, 5
- CFG-5
- TEST-1
- C-F04
- DEAD-1..6

**Részben (a maradékot ez a jelentés tartalmazza):**

| Tétel | Hol szerepel itt |
|---|---|
| SEC-5, 6, 8, 10 | A9 |
| SEC-9 | a CSP még csak Report-Only |
| DB-5 | A9 |
| BIZ-1 | B1 |
| BIZ-2 | D1 |
| BIZ-3, 5/6 | D4 |
| PERF-1 | A7 |
| PERF-8 | P6 |
| FE-1 | Q4 |
| TEST-2 | Q3 |

**Nyitott:** DB-4 (→ P5), BIZ-12 (→ D4), FE-5 (→ P1), CFG-6 (→ A9), TEST-3 (→ Q1), DEAD-8 (→ D4).

---

## 8. Üzleti döntést igénylő tételek (B, ⚠ viselkedés — ezekhez NEM nyúlok jóváhagyás nélkül)

- **B1 (BIZ-1):** a régi írók nem az állapotgépen mennek át: `sofor.ts:111`, `megbizasok.ts:263,288`, és a trigger újraszámol. Melyik a mérvadó szabály?
- **B2:** Járművek modul státusza (`fejlesztes-alatt` → `elkeszult`?), és a mobil kártyanézet a Készlet, Számlák és Dolgozók táblákhoz (CLAUDE.md 3. pont).
- **B3:** CSP élesítése (Report-Only → tiltó); jelszó minimum 8+; a Gmail `?token=` megszüntetése (az Apps Script módosításával együtt).

---

## 9. Javasolt végrehajtás (5. lépés, jóváhagyás után)

Egy tétel = egy commit. Minden commit után: `npm run typecheck`, `npm run teszt`, `npm run build`, `npm run smoke:build`.

1. **A1, A2:** séma-sorrend és CHECK (+ ellenőrzés: üres DB-ről felépül)
2. **A3, A4, A5, A6, A7, A8:** egyenként
3. **D1, D2:** holt végpontok törlése, `api-guard.ts` az `archive/`-ba
4. **P5:** indexek egy migrációban, a P1 SOR_SQL-javítással együtt
5. **P2, P4, P3, P6, P7, P8:** egyenként, előtte-utána lekérdezésszám-méréssel
6. **E1–E14:** dokumentáció (a terveket az `archive/`-ba mozgatva)
7. **Q2:** lint (15 fájl), majd **Q1:** CI-workflow
8. **D4, A9:** konszolidáció, maradékok (a ⚠ jelöltek csak külön igennel)

A B1–B3 és minden ⚠ tétel csak külön döntés után kerül sorra.
