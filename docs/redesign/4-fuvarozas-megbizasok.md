# Redesign – 4. modul: Fuvarozás · Megbízások (R1 terv) + a Fuvarozás színtéma

Branch: `redesign/4-megbizasok` (main-ről). NE pusholj, NE deployolj.
SZABÁLY: a Megbízások életút-tábla (bér: Beérkezett → Úton → Lerakva·számlázásra → Számlázva·postára → Kiküldve → Lejárt → Fizetve; saját: Saját fuvar → Előkészítés → Tervezett/úton → Lerakva·fotóra vár → Kész·utolsó 7 nap) MÁR MŰKÖDIK (`components/fuvarozas2/megbizasok-asztal.tsx`, `app/fuvarozas2/megbizasok/page.tsx`). Logika, adat, szerver-akció, szűrők, gombok, a saját fuvar gyors rögzítése, a kocsi-hét panel, a navigáció NEM változik — csak a kinézet.
Mobil (768 px alatt, a meglévő kártyanézet) érintetlen. Adatbázis: semmi.

## 1. Fuvarozás színtéma
A `.fuvarozas2` téma (app/globals.css: menta elsődleges, zöldes-szürke háttér) helyett a modul az app közös sémáját kapja (#EEF3FB háttér, #0A84FF primary, 0c tokenek).
A `.fuvarozas2` blokkban csak azt hagyd meg, ami NEM szín-alaptoken (pl. modul-specifikus segédváltozók, ha vannak); a background/primary/card/border/muted/accent/ring tokeneket töröld onnan, hogy a :root érvényesüljön.
Ha a modul komponensei beégetett menta/zöld színt használnak elsődlegesként (pl. `bg-emerald-*`, `#..` menta), azokat a Megbízások oldalon cseréld tokenre; a többi Fuvarozás oldalon csak listázd a KIMARADT.md-be (azok a 5. lépésben jönnek).
Szemantikus színek maradnak: zöld = kész/fizetve/saját fuvar gomb, piros = lejárt/baj, narancs = figyelmeztetés.

## 2. Megbízások oldal (R1)
- **Felül 5 szám-csempe + figyelmeztetés-kártya egy sorban** (ha ma is van ilyen összesítő az oldalon; ha a csempék ma más formában vannak, ugyanazokkal az adatokkal): Számlázatlan (narancs szám, alatta összeg) · Papír hiányzik (narancs, „a legrégebbi N napos”) · Kintlévőség (fekete; alatta korosítás 0–30 / 31–60 / 60+, ha az adat megvan) · Lejárt (piros) · Befolyt · {hónap} (zöld). A meglévő figyelmeztetés (pl. „N fuvarszámla nincs fuvarhoz párosítva”) halvány narancs kártyában a sor végén. Kártyák: 0c tokenek, szám 24 px félkövér.
- **Eszközsor:** kereső (bal, kb. 1/3), szűrő-pirulák szegmentált sávban (Minden nyitott · Teendő · Számlázatlan · Papír hiányzik · Kiküldve · Lejárt · Fizetve, darabszámmal), Mind/Bér/Saját szegmentált, „Drive frissítése” (outline), „+ Új bérfuvar” (kék fő gomb), „+ Új saját fuvar” (zöld gomb). Csak a meglévő elemek, új funkció nincs.
- **„Bérfuvarok” szakasz** (cím + szürke alcím „beérkezéstől a pénzig — a kész fuvar a fizetésig a táblán marad”), a 7 oszlop egy sorban egyenlő szélességgel, oszloponként: felül 3 px színes csík (Beérkezett szürke, Úton kék, Lerakva narancs, Számlázva lila, Kiküldve világoskék, Lejárt piros, Fizetve zöld), fejléc név + darabszám az oszlop színével, halványszürke (#F2F5FA) oszlop-háttér, belül görgethető.
- **Kártya (bér):** fehér, radius 12, `--shadow-card`; 1. sor: `#azonosító` szürke + „Bér” kék pirula + jobbra dátum; 2. sor: megbízó (14 px félkövér); 3. sor: honnan → hova; 4. sor: rendszám vagy „nincs kocsi” · **összeg** félkövér · hivatkozás (szürke, levágva); 5. sor: állapot-üzenet színesen (piros „Kocsit kell adni”, „N napja lejárt”; narancs „Papír (CMR) még nincs”; szürke „esedékes nov. 15.”). Egér alatt enyhe emelés (kattintható).
- **„Saját fuvarok” szakasz** ugyanígy, 5 oszlop (Saját fuvar zöld csík, Előkészítés szürke, Tervezett/úton kék, Lerakva·fotóra vár narancs, Kész zöld); a „Saját fuvar” oszlop tetején a meglévő gyors-rögzítő (Honnan * · Hová * · Rögzítem zöld gomb). Saját kártya: „Saját” zöld pirula, cím „Szakoly → [Vevő]”, alatta útvonal, kocsi · vevő, időablak/állapot.
- 1920×1080-on a két szakasz egymás alatt kiférjen: a bér-oszlopok kb. 380 px, a saját-oszlopok kb. 300 px magasak, belül görgetnek.

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` kiszűrve), `git diff --stat`.
- Build és böngésző NE — a felügyelő végzi.
- Commit (a feladatleírással együtt): `redesign 4: Fuvarozás színtéma + Megbízások (R1)`. PROGRESS.md egy sor, KIMARADT.md frissítés.
- A végén röviden: módosított fájlok, mi nem valósult meg és miért, futtatott parancsok.
