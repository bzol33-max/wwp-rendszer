# Redesign – 0. modul: vizuális alap + oldalsáv (Apple HIG stílus)

Branch: `redesign/0-alap` (már létrehozva). NE pusholj, NE deployolj, NE merge-elj main-be.

## Szabály
Csak megjelenés változik. Logika, adatmodell, API, útvonalak, jogosultságok, menüpontok NEM.
Mobil nézet (`app/m`, `components/m`, `components/mobil`) érintetlen marad.

## 1. Betű – app/layout.tsx
- Geist helyett Inter (`next/font/google`, subsets: `latin`, `latin-ext`). A meglévő CSS-változót kösd Interre (kisebb változás).
- Geist_Mono maradhat.
- Globális `.tnum` utility: `font-variant-numeric: tabular-nums`.

## 2. Színek – app/globals.css (:root, a shadcn változónevek maradnak)
- background: #F5F5F7 · card/popover: #FFFFFF
- foreground #1D1D1F · muted-foreground #6E6E73 (másodlagos szöveg #48484A, ha van rá token) — #8E8E93 szövegre tilos
- primary: #007AFF (primary-foreground #FFFFFF) · ring: #007AFF
- destructive: #D70015
- Ha van warning/success token: narancs #B25000, zöld #248A3D
- border: rgba(0,0,0,0.08)
- Dark mode blokkot ne töröld.

## 3. Méretek
- 8 px-es rács; betűméretek 24/18/14/13/12, 12 px alatt semmi.
- Card legyen 16px radiusú (a --radius vagy a Card komponens módosításával — a kisebb hatásút válaszd, és írd le melyiket).
- Card árnyék: `0 0 0 1px rgba(0,0,0,.08), 0 6px 18px -10px rgba(0,0,0,.18)`, border nélkül (components/ui/card.tsx).

## 4. Oldalsáv – components/layout/app-shell.tsx
- 88 px széles, menüpontonként ikon felül (20–22 px), felirat alatta (12 px, középre).
- Aktív: háttér rgba(0,122,255,.10), ikon+felirat #007AFF, radius 12.
- Inaktív: ikon és felirat #48484A; hover: rgba(0,0,0,.04).
- Felül "W" logó-négyzet: #1D1D1F 36×36, radius 10, fehér W.
- Háttér #FFFFFF, jobb oldalon 1px vonal rgba(0,0,0,.08).
- Menüpontok listája, sorrendje, jogosultság szerinti szűrése, kijelentkezés stb. VÁLTOZATLAN.
- A tartalom bal margója igazodjon a 88 px-hez.

## 5. Ellenőrzés
- `npm run lint`, `npx tsc --noEmit`, `npm run build` – mind zöld legyen.
- `git diff --stat` – csak a fenti fájlok + docs/redesign + PROGRESS.md változhat.
- Beégetett színek listája (NE javítsd most): `grep -rnoE "oklch\([^)]*\)|#[0-9a-fA-F]{6}" components app --include=*.tsx | cut -d: -f1 | sort | uniq -c | sort -rn | head -30` → a `docs/redesign/0-alap-eredmeny.md`-be.

## 6. Lezárás
- Commit a branchre: `redesign 0: Inter, Apple színek, kártya, 88px oldalsáv`.
- `docs/redesign/0-alap-eredmeny.md`: módosított fájlok, futtatott parancsok + eredmény, nyitott kérdések, kockázatok.
- PROGRESS.md frissítése.
