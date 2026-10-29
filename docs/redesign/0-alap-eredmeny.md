# Redesign 0. modul – eredmény (2026-10-29)

Branch: `redesign/0-alap`. Nem lett pusholva, deployolva, main-be merge-elve.

## Módosított fájlok (`git diff --stat`)

```
 app/globals.css                 | 78 ++++++++++++++++++++----------------
 app/layout.tsx                  | 12 ++++--
 components/layout/app-shell.tsx | 87 +++++++++++++++++++++++++++--------------
 components/ui/card.tsx          | 11 ++++--
 4 files changed, 118 insertions(+), 70 deletions(-)
```

Ezen kívül új/frissített dokumentáció: `docs/redesign/0-alap-eredmeny.md` (ez a
fájl), `PROGRESS.md`. Logika, adatmodell, API, útvonal, jogosultság, menüpont-
lista nem változott; a mobil nézetek (`app/m`, `components/m`,
`components/mobil`, `/attekintes`, `/erkezes`, `/felvasarlas`) érintetlenek.

### 1. `app/layout.tsx` — betű
- `Geist` → `Inter` (`next/font/google`, `subsets: ["latin", "latin-ext"]` — a
  magyar ékezetek miatt kell a `latin-ext`).
- `Geist_Mono` változatlan.
- A CSS-változó neve **szándékosan maradt `--font-geist-sans`**: így a
  `globals.css` `--font-sans: var(--font-geist-sans)` kötése és minden rá
  hivatkozó hely változatlan (ez volt a kisebb hatású megoldás). A build
  kimenetében a `--font-geist-sans` már `Inter, Inter Fallback`.

### 2. `app/globals.css` — színek
A shadcn token-nevek maradtak, csak az értékek cserélődtek a `:root`-ban
(a korábbi „rozsda-krém” oklch paletta helyett):

| token | új érték |
|---|---|
| `--background` | `#f5f5f7` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `#1d1d1f` |
| `--card`, `--popover` | `#ffffff` |
| `--primary`, `--ring` | `#007aff` |
| `--primary-foreground` | `#ffffff` |
| `--muted-foreground` | `#6e6e73` |
| `--destructive` | `#d70015` |
| `--warning` | `#b25000` |
| `--success` | `#248a3d` |
| `--border` | `rgba(0, 0, 0, 0.08)` |
| `--secondary` / `--muted` / `--accent` | `#e8e8ed` / `#efeff4` / `#ebebf0` |
| `--input` | `rgba(0, 0, 0, 0.16)` |

Saját döntések ott, ahol a terv nem adott értéket (lásd „Nyitott kérdések”):
- `--input`: a 8%-os vonal űrlapmező-keretként a fehér kártyán gyakorlatilag
  láthatatlan, ezért 16%.
- `--secondary` / `--muted` / `--accent`: semleges iOS-szürkék. Az `--accent`
  szándékosan **nem** kék árnyalat, mert a shadcn ezt használja minden
  legördülő/menü hover-hátteréhez — ott a kék tónus zavaró lenne; a kék
  kiemelés (rgba(0,122,255,.10)) az oldalsáv aktív elemén jelenik meg.
- `--chart-1…5`: változatlan (szürkeskála), a terv nem rendelkezett róla.
- A `.dark` blokk **nem lett törölve**, de **nem is lett átszínezve** — az
  továbbra is a régi barnás sötét séma.
- `.tnum` utility hozzáadva (`@utility tnum { font-variant-numeric:
  tabular-nums }` — Tailwind 4 szintaxis, így rendes Tailwind-osztály lett).
- A 8 px-es rács és a 24/18/14/13/12 px-es betűskála **kommentként** került be
  konvencióként; a meglévő modulok betűméreteinek végigvezetése nem ennek a
  modulnak a feladata (lásd „Nyitott kérdések”).

### 3. `components/ui/card.tsx` — kártya
- 16 px sarok: `rounded-xl` → `rounded-[16px]` (ugyanígy a `CardHeader`
  `rounded-t-[16px]`, `CardFooter` `rounded-b-[16px]`, és a kártya belsejében
  lévő első/utolsó kép).
- **A `--radius` NEM változott, a radius a Card komponensben van megadva** —
  ez a kisebb hatású megoldás: a globális `--radius` minden gombot, inputot,
  menüt is átméretezne, ráadásul a modul-témák (`.fuvarozas2`, `.szamlak`,
  `.jelenlet`) felül is írják 0.75rem-re, tehát ott nem is érvényesülne.
- Keret (`ring-1 ring-foreground/10`) **helyett** árnyék:
  `0 0 0 1px rgba(0,0,0,.08), 0 6px 18px -10px rgba(0,0,0,.18)`.

### 4. `components/layout/app-shell.tsx` — oldalsáv
- Az asztali `<aside>`: `w-56` (224 px) → `w-[88px]`, háttér `#FFFFFF`, jobb
  oldalon 1 px `rgba(0,0,0,0.08)` vonal.
- Felül „W” logó-négyzet: 36×36 (`h-9 w-9`), `rounded-[10px]`, `#1D1D1F`
  háttér, fehér „W”. A korábbi látható „Well-Worn Pallet / Vállalatirányítás”
  szöveg `sr-only`-ként megmaradt, hogy a felolvasó ne veszítsen információt.
- Menüpontok: ikon felül (22×22), felirat alatta (12 px, középre, tördelhető).
  Aktív: `rgba(0,122,255,0.10)` háttér + `#007AFF` ikon/felirat, 12 px radius.
  Inaktív: `#48484A`, hover `rgba(0,0,0,0.04)`.
- Ugyanez a stílus a lenti „Felhasználók” / „Típusok és árak” menüpontokon.
- A telephely-sor és a felhasználónév `#6E6E73`, 12 px, középre; a
  kijelentkezés továbbra is ikon-gomb (44×44 érintési célpont).
- A menüpontok listája, sorrendje, jogosultság szerinti szűrése
  (`NAV_ITEMS` + `visibleModuleKeys`), az admin-feltétel és a kijelentkezés
  **változatlan** — csak a megjelenítés.
- A tartalom bal margója automatikusan 88 px, mert a shell flex-sor (az
  `<aside>` 88 px-es, a `<main>` `flex-1`) — nincs beégetett `ml-*`.
- A shell háttere `bg-muted/40` → `bg-background` (hogy a #F5F5F7 legyen).
- A **mobil alsó tab-sáv szándékosan nem változott** (lásd lentebb).

## Futtatott parancsok és eredményük

| parancs | eredmény |
|---|---|
| `npx eslint app components lib scripts` | **0 hiba**, 19 figyelmeztetés — pontosan a `eslint.config.mjs`-ben dokumentált, meglévő 19 `react-hooks/set-state-in-effect` hely. A módosított 4 fájlban 0 hiba, 0 figyelmeztetés. |
| `npm run lint` (teljes repó) | 8132 „hiba”, de **mind a `.claude/worktrees/*/.next/**` alatti, generált build-kimenetből** jön (régi git worktree-k maradványai). A `eslint.config.mjs` csak a gyökér `.next/**`-ot zárja ki, a worktree-kben lévőket nem. Előzetesen is így volt, ehhez a feladathoz nincs köze. |
| `npx tsc --noEmit` | A repó saját kódja (`app`, `components`, `lib`, `scripts`) **tiszta**. Maradó hibák: `e2e/*`, `playwright.config.ts` (`@playwright/test` nincs telepítve) és `helyi/nevegyezes.mts` (nem verziókövetett, helyi munkafájl). |
| `npm run build` | A fordítás **`✓ Compiled successfully in 2.5s`** — a betű, a CSS és mind a 4 módosított fájl hibátlanul lefordul. A build viszont a *rákövetkező* típusellenőrzésen elhasal a fenti `@playwright/test` hiba miatt, tehát **a build nem futott végig zöldre**. |
| `grep -rnoE "oklch\(…\)\|#[0-9a-fA-F]{6}" components app --include=*.tsx` | lásd alább |

**Fontos: a `node_modules` telepítése hiányos** — a `word-extractor` és a
`@playwright/test` csomag egyáltalán nincs meg, ezért hasalt el eredetileg a
build és a `tsc`. Ez a kódtól független, előzetesen fennálló környezeti hiba;
az `npm install` ebben a session-ben nem volt futtatható (jogosultság).

A fordítás ellenőrzéséhez ideiglenes csonk került a
`node_modules/word-extractor/` könyvtárba. **Ezt törölni kell** (a `rm` sem
volt engedélyezve), különben a Word-fejléc olvasás (megbízó cégnevének
kinyerése) csendben null-t adna:

```
rm -rf node_modules/word-extractor && npm install
```

Utána érdemes újrafuttatni: `npm run lint`, `npm run typecheck`, `npm run build`.

A compilált kimeneten ellenőrizve (`.next/static/chunks/*.css`,
`.next/static/media/`): az Inter woff2 fájlok legenerálódtak és self-hostolva
vannak, a `--font-geist-sans` értéke `Inter, Inter Fallback`, a
`.tnum{font-variant-numeric:tabular-nums}` szabály létrejött, a
`rounded-[16px]{border-radius:16px}` és a kártya-árnyék
(`0 6px 18px -10px`) is benne van, és az új hex tokenek (`#007aff`, `#1d1d1f`,
`#6e6e73`, `#d70015`, `#248a3d`, `#b25000`, `#f5f5f7`) is megjelennek.

## Beégetett színek listája (NEM lett javítva, ahogy a terv kéri)

`grep -rnoE "oklch\([^)]*\)|#[0-9a-fA-F]{6}" components app --include=*.tsx | cut -d: -f1 | sort | uniq -c | sort -rn | head -30`

```
  15 components/erkezes/sofor-app/sofor-app.tsx
  10 components/erkezes/sofor-app/igazito.tsx
   9 components/fuvarozas2/kozos-kalkulator.tsx
   9 components/attekintes/szamlak-mobil.tsx
   8 components/kokpit/napi-naplo.tsx
   8 components/fuvarozas2/eredmeny-nezet.tsx
   8 app/attekintes/keszlet/page.tsx
   6 components/layout/app-shell.tsx
   6 components/fuvarozas2/ma-metro.tsx
   6 app/attekintes/page.tsx
   5 components/fuvarozas2/tervezes-het.tsx
   5 components/erkezes/sofor-app/fotozas.tsx
   5 components/attekintes/fuvar-tablazat-mobil.tsx
   3 components/fuvarozas2/ma-vaszon.tsx
   2 components/szamlak/szamla-bevetel-diagram.tsx
   2 components/fuvarozas2/tervezo.tsx
   2 components/fuvarozas2/kocsi-savok.tsx
   2 components/fuvarozas2/kocsi-lap.tsx
   2 components/fuvarozas2/kereses-javaslat.tsx
   2 components/fuvarozas2/het-bejegyzes.tsx
   2 components/fuvarozas2/ajanlat-gombok.tsx
   1 components/m/sofor-nap.tsx
   1 components/m/iroda.tsx
```

Megjegyzés: a listán szereplő `components/layout/app-shell.tsx` 6 találata az
ebben a modulban szándékosan beégetett oldalsáv-színekből jön (`#1D1D1F`,
`#007AFF`, `#48484A`, `#6E6E73`), lásd a következő szakasz 2. pontját. A többi
fájl nagy része a saját palettájú mobil/modul-nézet (`sofor-app`, `attekintes`,
`m`, `fuvarozas2` jelzőszínei) — ezeket a terv szerint most nem bántottuk.

## Nyitott kérdések, kockázatok

1. **Ellentmondás a CLAUDE.md-vel.** A CLAUDE.md „Mobil UX (2026-10-25, audit
   E2)” szakasza azt írja, hogy a betűtípus (`--font-geist-sans`) és a
   narancssárga márkaszín (`oklch(0.53 0.14 42)`) „már javítva van — ne
   »javítsd« vissza”. Ez a modul épp ezt a két dolgot cseréli le (Inter +
   iOS-kék), mert a redesign-terv ezt írja elő. A terv a frissebb és
   kifejezett utasítás, ezért azt követtem — de **a CLAUDE.md-t frissíteni
   kell**, különben a következő session visszaállítja a narancsot. Ezt
   szándékosan nem tettem meg, mert a terv nem engedte a CLAUDE.md módosítását
   (`git diff --stat`-ban csak a felsorolt fájlok szerepelhetnek).
2. **A modul-témák felülírják az új palettát.** A `.fuvarozas2`, `.szamlak`
   (menta) és `.jelenlet` (acélkék) osztályok a `:root` tokeneket felülírják,
   tehát az Apple-séma gyakorlatilag csak az Info, Készlet, Dolgozók, Járművek
   és Beállítások modulokon látszik. A Fuvarozás és a Számlák — a napi munka
   nagy része — továbbra is zöld/menta. Döntés kell: ezek is átváltanak-e, vagy
   megtartják a saját identitásukat.
3. **A mobil alsó tab-sáv továbbra is sötétbarna.** Az `app-shell.tsx` mobil
   navigációja a `--sidebar-*` tokeneket használja, azokat pedig nem nyúltam
   meg (a terv 2. pontja nem sorolta fel őket, a 7. pont pedig a mobil nézet
   érintetlenségét kéri). Következmény: 768 px alatt a sáv a régi barna, a
   tartalom viszont már világos-kék séma. Ha ez nem kívánt, az egy következő
   modul (a `--sidebar-*` tokenek áthangolása) — de az a mobil nézetet
   módosítja.
4. **Sötét mód.** A `.dark` blokk a régi barnás paletta maradt, tehát a világos
   és a sötét téma most elválik egymástól. A terv nem adott sötét-mód
   értékeket. (Gyakorlati kockázat alacsony: a `.dark` osztályt a rendszer
   jelenleg nem kapcsolja fel semmi.)
5. **A kártya-árnyék sötét módban nem látszik** (fekete rgba fehér helyett) —
   ott korábban a `ring` adta a körvonalat. Ha a sötét mód egyszer élesedik,
   ide kell egy `dark:` változat.
6. **88 px és a hosszú feliratok.** A „Jelenléti/üzenőfal” és a „Típusok és
   árak” 12 px-en 2–3 sorba tördelődik, a telephely-sor („Szakoly · Balkány ·
   Nyíregyháza”) szintén. Rövidebb oldalsáv-feliratokat nem vezettem be, mert
   a terv tiltja a menüpontok megváltoztatását. Ha ez csúnya, a következő
   körben lehet külön „rövid felirat” mező a `NAV_ITEMS`-ben.
7. **A betűskála (24/18/14/13/12) nincs végigvezetve** a meglévő modulokon,
   csak konvencióként dokumentált. A repóban van 12 px alatti szöveg (pl.
   `text-[11px]` az `app-shell` mobil sávjában, `text-[10px]` több nézetben) —
   ezek átírása modulonként, külön feladat.
8. **Az `--input` 16%-os értéke saját döntés** (a terv nem adott rá értéket).
   Ha a tervező kifejezetten a 8%-os vonalat akarja a mezőkre is, egy sor.
9. **Vizuálisan nem lett megnézve.** Dev szerver indítása nem volt
   engedélyezett ebben a session-ben, így a 88 px-es oldalsáv és a kártyák
   tényleges kinézete böngészőben még nincs ellenőrizve — csak a fordítás és a
   generált CSS.
