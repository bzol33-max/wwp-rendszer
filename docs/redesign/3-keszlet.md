# Redesign – 3. modul: Készlet (P2 = havi/„Október” fül, Q1 = telephely fülek)

Branch: `redesign/3-keszlet` (main-ről). NE pusholj, NE deployolj.
SZABÁLY (a felhasználó döntése): a Készlet szerkezete (fülek) és MINDEN funkciója marad, csak a kinézet és az elrendezés változik.
Nincs új funkció, nincs törölt funkció, a billentyűs navigáció (`kbNav`, Enter: következő típus), a jogosultság (`useCanEdit`), a megerősítő dialógusok, a visszavonás (×) mind marad.
Adatbázis/szerver-akció NEM változik (ha egy kijelzett számhoz kell adat, az a már betöltött adatból számolódjon kliensen).
Mobil (768 px alatt) érintetlen marad — a lenti elrendezés `md:`/`xl:` töréspontokra, alatta a mostani egymás alatti sorrend.
Két külön commit: előbb P2, aztán Q1.

## Közös stílus
0c tokenek: kártyák `--shadow-card`/`--hi`, gomb a `Button` default (gradiens). Szöveg #1D1D1F / #48484A / #6E6E73, 12 px alatt semmi, számok `tabular-nums`.
Csoportszínek: EUR #0A84FF, Egyutas #28A745, Egyéb #AF52DE (a típusok csoportja a meglévő típus-adatból; ha nincs csoport mező, a név alapján: „EUR…”/„Vegyes EUR”/„Csere” → EUR, „Egyutas…” → Egyutas, minden más → Egyéb).
1920×1080-on a cél: a fő tartalom görgetés nélkül kiférjen, a hosszú listák a saját kártyájukban görgessenek.

## P2 – `components/keszlet/nyiregyhaza-havi.tsx` (havi / „Október” fül)
Felső sor (teljes szélesség, egy kártya), két rész:
1. **Bal: „Ma, {nap} — gyors rögzítés” mátrix.** Oszlopok = a típusok (most 11, de a szám dinamikus: `grid-template-columns: 96px repeat(N, minmax(0,1fr))`). Sorok:
   `FT/DB` (egységár) · `DB` (beviteli mezők — a mostani mezők, kbNav-val) · `ÖSSZEG` · `HAVI` (kék) · `MAI` (zöld, 0 szürke). Felül jobbra apró szürke: „Enter: következő típus”.
2. **Jobb (kb. 280 px, halványkék háttér): „Aktuális kifizetés”** nagy összeg (32 px), alatta a meglévő gombok egymás alatt: „Vétel — készpénzből fizetve” (fő gomb), „Vétel — átutalással”, „Vétel — egyedi áron” (outline).
Alsó sor 3 oszlop (≈ 1fr · 1.15fr · 0.95fr):
- **Bal oszlop:** „{Hónap} naponta” oszlopdiagram fix 170 px magasan (a mai nap kék, a többi halványkék, szaggatott átlag-vonal + „átlag N db/nap”), alatta „A hét napjai” kis vízszintes sávok (ha ez az adat ma is megvan; ha nincs, hagyd ki). Alatta külön kártya: **„Korábbi napok”** – naponta egy blokk: „okt. 21., szerda · 380 db”, jobbra kék „ebből átutalással …”, alatta a típus-chipek (név + db, „átutalással” jelölés, × törlés a meglévő funkcióval).
- **Középső oszlop:** **„Havi felvásárlások”** táblázat (Dátum/idő · Típus · DB · Egységár · Összeg · Ki · ×), fejlécben jobbra „ma · N tétel · X Ft”. Belül görgethető.
- **Jobb oszlop:** felül két csempe egy kártyában: **„Kassza egyenleg”** (narancs címke, nagy szám, alatta kék link a tételes listához — a meglévő) | **„Mai kiadás”**. Alatta **„Kifizetésre váró tételek”**: fix fejléc (cím + összeg-badge + „Lista (N)” + „+ Új tétel”), görgethető lista eladónként (név, összeg, „+”, „Kifizetés” gomb, alatta a tételsorok), a lábléc-megjegyzés (ⓘ nyitvatartáson túl…) mindig látszik alul. Legalul **„Egyéb kassza-mozgás”** (leírás + összeg + Rögzítés).
- Fejléc jobb oldalán (a fülek sorában): „{Hónap} **N db** · X Ft   Ma **N db** · {nap}” – a már betöltött adatból.

## Q1 – `components/keszlet/telephelyek-view.tsx` (+ `movement-form.tsx`, `mozgas-oszlopok.tsx`, `bejovo-szallitmanyok.tsx`) – Szakoly / Balkány / Nyíregyháza fül
Felső sor: 
- **Bal (kb. 2/3): „Jelenlegi készlet — {telep}”** + jelmagyarázat (EUR/Egyutas/Egyéb pötty) + „a sáv: arány a telep teljes készletéből (N db)” + jobbra „Leltár indítása” (meglévő). Alatta **nagy csempék** rácsban (6 oszlop 1920-on): bal oldalt 3 px csoportszínű csík, típusnév (14 px), **nagy szám 38 px félkövér** + „db”, alatta vékony arány-sáv csoportszínnel és „X% a készletből” (12 px). A 0 db-os típus is látszik, halványítva.
- **Jobb (kb. 1/3): „Szétválogatás”** – a meglévő szétválogató funkció (Vegyes EUR, Vegyes…) lenyitható sorokként, nyitva: célmezők, „Szétválogatva: N db · Marad: N db”, Mégse / Szétválogatás.
Alsó sor:
- **Bal (kb. 1/3): „Mozgás rögzítése”** – szegmentált fül (Beérkezés / Kiszállítás / Telephelyek közti mozgatás), típus+darab sorok × törléssel, „+ Típus hozzáadása”, Partner mező (ajánlással, „Eseti felvásárlás” gomb), alul összegző sáv („Beérkezés · 184 db kerül a szakolyi készletbe”) és nagy „Mentés” gomb.
- **Jobb (kb. 2/3):** felül (ha van) **„Beérkező szállítmány (N)”** narancs-halvány sáv, tételenként „Átvétel” gomb; alatta **„Legutóbbi mozgások”** három oszlopban: **Be** (zöld felső csík, +összeg), **Ki** (piros felső csík), **Telephelyek közti** (kék felső csík, „Átvételre vár” címke) – soronként típus, dátum · partner · felhasználó, jobbra a mennyiség színesen, × visszavonás (meglévő).
- A fül fejlécében jobbra: „{Telep} készlet **N db**   Ma **+N** be · **−N** ki”.
- A meglévő „Mozgások — típusonként” / havi bontás kártyák maradnak, a fenti blokkok ALÁ kerülnek (nem törlődnek).

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` hiba figyelmen kívül hagyható), `git diff --stat` — csak a Készlet komponensek + docs + PROGRESS.md változhat.
- Buildet és böngészős ellenőrzést NE – azt a felügyelő végzi.
- Commitok: `redesign 3a: Készlet havi fül (P2)` és `redesign 3b: Készlet telephely fülek (Q1)`. PROGRESS.md egy-egy sor.
- A végén röviden: módosított fájlok, mi NEM valósult meg a tervből és miért (pl. hiányzó adat), futtatott parancsok.
