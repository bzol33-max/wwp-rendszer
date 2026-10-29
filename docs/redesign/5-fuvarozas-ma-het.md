# Redesign – 5. modul: Fuvarozás · Ma + Hét egy oldalon (U2c terv) + a Fuvarozás maradék színei

Branch: `redesign/5-ma-het` (main-ről). NE pusholj, NE deployolj. Adatbázis/séma/migráció: semmi. Mobil (768 px alatt) érintetlen.
Ez nem csak kinézet: a Ma és a Hét lap EGY lappá válik (a felhasználó jóváhagyta, 2026-10-26, részletek: a projekt „ma-het-osszevonas-szakertok” döntései — lent kivonatolva).
SZABÁLY: egyetlen meglévő funkció sem veszhet el. Ami a két lapon ma elérhető (döntés, nyugtázás, kocsihoz adás, bejegyzés, Timocom-ajánlat a réshez, „kiket hívj”, bejövő megbízás döntése kalkulációval/árlétrával/ár-előzménnyel, kocsi-lap link), az az új lapon vagy egy kattintással onnan elérhető maradjon. Csak a meglévő szerver-akciókat és adatforrásokat használd (`getMaVaszon`, `getKocsiSavok`/`elotoltKocsiSavok`, `getTervezesHet`, `getTervezo`, `nyugtazElterest`, `kocsihozAdom` stb.). Új adatot nem találsz ki, becslést nem mutatsz.

## Jogosultság (fontos)
A Ma lapot ma az is látja, akinek csak `elszamolas` joga van (Szabina); a Hét `csakFuvarozas`. Az új lapon: aki nem `fuvarozas` jogú, annak a heti részek (napok előre, rések, ajánlatok, döntés-gombok) NEM jelennek meg, csak az, amit ma a Ma lapon lát. Ellenőrizd a `lib/fuvarozas2/fulek-szerkezet.ts` és a session `can("fuvarozas")` logikáját.

## Navigáció
- `fulek-szerkezet.ts`: a Kocsik csoportban „Ma” + „Hét” helyett egy fül: **„Ma + hét”** → `/fuvarozas2`. Az „Ajánlat” (Timocom) marad.
- A `/fuvarozas2/tervezes` útvonal megmarad, de csak a **„Bejövő megbízások — döntés”** részt mutatja (BejovoLista + DontesOszlop + HetOszlop + DontesSav, változatlanul), fejlécben „‹ vissza a Ma + héthez”. A tabsorban nem szerepel; az új lap „Most dönts” → Határidős/Bejövő tételeiről nyílik (`?m=<id>`). A `het`/`res` paraméterek az új lapra irányítsanak (`/fuvarozas2?het=…&res=…`), ha ma vannak rá linkek.

## Az új `/fuvarozas2` lap (U2c, 1920×1080, görgetés nélkül; az oszlopok belül görgetnek)
**Fejléc-sor:** a meglévő Fuvarozas2Fulek; jobbra „{nap}, {dátum} · {idő}”, ‹ Ma › lapozó (a meglévő `het` paraméterrel), „+ Bejegyzés” (meglévő).
**Iroda-sor:** „Iroda” felirat + kattintható címkék CSAK a nem nulla számlálókkal (Számlázandó · Postára vár · Fotó hiányzik · Kocsi nélküli fuvar · Holnapi megbízás — a meglévő Ma-oldali iroda-számokból), mindegyik a meglévő céloldalára visz.
**Fő rész:** 4 kocsi-oszlop (a kocsik száma dinamikus, ne legyen beégetve) + jobbra egy 380–400 px-es panel.
### Kocsi-oszlop
- Felül 3 px csík a kocsi színével (a kocsiszín CSAK itt). Ha a kocsi bajban (várakozik/késik, kevés tachó): az egész oszlop 2 px piros keretet kap.
- **Fehér élő fejléc** (a `getMaVaszon` N1-kártya adataiból): rendszám 18/700 + jobbra sofőr (12, szürke); állapot-pirula 14/600 (Úton kék · Várakozik N perce piros + „!” · Áll/telephelyen narancs · Távollét szürke); „hol van” 14; következő feladat TERV idővel 13; tachó-sáv + hátralévő idő (ha van adat); GPS-frissesség CSAK ha nincs GPS vagy elavult (12, szürke/narancs); figyelmeztető szalag a meglévő szabályokból (Üresen indul – N km rés; Ma nincs fuvar – keress rá; Várakozik…; Jelenlétből · ne tervezz).
- **Szürke (#F5F5F7) napok-lista** (a `getTervezesHet` adataiból): napok szakaszcímként „Kedd · okt. 27.” (12–13 px, nem a bal szélen); a **Ma** blokk kék keretes fehér kártya „Ma · hétfő” + jobbra „TERV · TÉNY”, benne a mai megállók FEL/LE sorokkal, TERV idő és TÉNY idő (kész = zöld, késés = piros) — a meglévő Ma-vászon megálló-adatai; a többi nap tömör kártyák: „BÉR/SAJÁT #id”, megbízó 14/600, útvonal 13; a rés piros keretes kártya „Rés · 240 km üres / Kecskemét → haza”; a szabad nap csak „szabad” szöveg; távollét narancs csíkos blokk; a múlt nap halványítva. A kártyára kattintva a meglévő megbízás-részlet nyílik.
- **Oszlop alja:** egy sor „Hét: 727 000 Ft · üres 560 km · 3 nap fizetős” (a meglévő heti összegző/kihasználtság adatból; ha valamelyik nincs, az kimarad).
- A rendszámra kattintva a meglévő kocsi-lap (`/fuvarozas2/kocsi/[kod]`) nyílik.
### Jobb panel – fülek: **Most dönts (N)** · **Ajánlatok (N)** · **Rés**
- **Most dönts:** csoportok ebben a sorrendben, csak a nem üresek: Élő · most (piros keretes tétel, pl. várakozó kocsi; gombok: „Hívom a sofőrt” = `tel:` link a sofőr meglévő telefonszámával, ha van; „Megnéztem” = a meglévő `nyugtazElterest`) → Ma–holnap kockázat → Határidős (bejövő megbízások: „Elfogadom · {szabad kocsi} {nap}”, „Ajánlat”, „Elutasítom” — CSAK ha ezek az akciók ma is léteznek; ha nem, a tétel a `/fuvarozas2/tervezes?m=<id>` döntés-oldalra visz) → Kocsira vár (a meglévő `kocsihozAdom`, a gombon a ténylegesen szabad kocsi és nap) → Rések (üres km szerint) → Javaslat (★ útba eső saját fuvar, ha a meglévő logika ad ilyet). Csoportcím 14/600 + jobbra darabszám; tétel: cím 14/600, alsor 13, gombok 32 px magasak (fő gomb kék gradiens, másodlagos outline).
- **Ajánlatok:** a meglévő Timocom-ajánlatok/„kiket hívj” a résekhez.
- **Rés:** a meglévő rés-lista részletesen.
### Tipográfia / színek
5 méret: 24/700 oldalcím · 18/700 rendszám · 14 fő tartalom · 13 másodlagos · 12 meta. 12 px alatt semmi; legvilágosabb szövegszín #6E6E73. Kék csak: fő gomb, Ma blokk, „Úton”. Piros csak azonnali baj (+ „!” jel). Narancs: figyelem. Zöld: kész TÉNY idő. Oszlopköz 20 px, kártyaköz 6–8 px, belső margó 14–16 px. 0c tokenek (`--shadow-card`, `--hi`, `--grad-primary`).

## B rész (külön commit): a Fuvarozás maradék színei
A `--f2-mint`/`--f2-blue` és a beégetett menta/acélkék színek a Fuvarozás többi komponensében (lista: KIMARADT.md, pl. timocom.tsx, eredmeny-nezet.tsx): elsődleges/kiemelés szerepben → tokenek (`--primary`), szemantikus szerepben (kész/zöld, hiba/piros, figyelem/narancs) maradhat a jelentésnek megfelelő szín. Csak szín, logika nem.

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` kiszűrve), `git diff --stat`.
- Build és böngésző NE — a felügyelő végzi.
- Commitok: `redesign 5a: Fuvarozás Ma + hét egy lapon (U2c)` és `redesign 5b: Fuvarozás maradék színei`. PROGRESS.md, KIMARADT.md frissítés.
- A végén röviden: módosított fájlok, minden funkció hova került (táblázatosan: régi hely → új hely), mi nem valósult meg és miért, futtatott parancsok.
