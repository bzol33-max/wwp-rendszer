# Redesign – 0c: élénkebb színséma (C) + modernebb térhatás (jóváhagyva 2026-10-29)

Branch: `redesign/0c` (main-ről). NE pusholj, NE deployolj. Csak megjelenés; logika/adat/útvonal/jogosultság nem változik.
Mobil (768 px alatt látszó dolgok, `app/m`, `components/m`, `components/mobil`, `--sidebar-*`, `--mob-`, `--at-`) érintetlen.
Referencia kép: a felhasználó jóváhagyta a „C + térhatás” mintát (halványkék alap, kék gradiens aktív elemek, lebegő kártyák).

## 1. Tokenek – app/globals.css (:root)
- background: #EEF3FB; body háttér: `radial-gradient(1200px 600px at 70% -10%, #F7FAFF 0%, #EEF3FB 55%, #E7EEF9 100%)` fixen (background-attachment: fixed), csak desktopon (min-width: 768px).
- primary: #0A84FF · ring: #0A84FF · secondary: #DCEBFF, secondary-foreground: #0060DF · accent: #E5F0FF, accent-foreground: #0060DF
- muted: #EEF2F8 · muted-foreground: #5B5B60 (AA kontraszt maradjon fehéren és #EEF3FB-n is)
- destructive: #E5172F · warning: #D97706 · success: #28A745 (foreground mindháromnál #FFFFFF)
- új tokenek: `--shadow-card: 0 0 0 1px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.06), 0 8px 24px -12px rgba(16,24,40,.22)`,
  `--shadow-lift: 0 0 0 1px rgba(16,24,40,.06), 0 14px 30px -14px rgba(16,24,40,.35)`,
  `--hi: inset 0 1px 0 rgba(255,255,255,.9)`, `--grad-primary: linear-gradient(180deg, #3B9BFF, #0A84FF)`,
  `--glow-primary: 0 6px 14px -6px rgba(10,132,255,.7)`.

## 2. Komponensek (components/ui)
- card.tsx: árnyék `var(--shadow-card), var(--hi)`, háttér `linear-gradient(180deg,#FFFFFF,#FBFCFE)`. Hover-emelés NEM minden kártyán:
  csak ha a kártya kattintható (`a`/`button` vagy `[data-interactive]`) → `translateY(-2px)` + `--shadow-lift`, 200 ms ease. Adj hozzá egy `lift` utility-t is.
- button.tsx default (primary) variáns: háttér `--grad-primary`, árnyék `var(--glow-primary), inset 0 1px 0 rgba(255,255,255,.35)`, radius 10px; hover kicsit világosabb, active: `translateY(1px)`. A többi variáns (outline, ghost, destructive) csak a tokenekből kapja a színt, ne gradiens.
- tabs.tsx (ha van): a TabsList legyen „szegmentált” – háttér rgba(255,255,255,.7), padding 4px, radius 12, `--shadow-card`; aktív trigger: `--grad-primary`, fehér szöveg, `--glow-primary`; inaktív trigger szöveg #0060DF.
- badge.tsx (ha van): pirulás, halvány háttér + sötétebb azonos árnyalatú szöveg (piros #FDE7EA/#C4001A, narancs #FFF1DC/#A85600, zöld #E3F6E8/#1E7B34, kék #E5F0FF/#0060DF) – csak ha a variánsok ezt engedik a meglévő API megváltoztatása nélkül.

## 3. Oldalsáv – components/layout/app-shell.tsx (csak a desktop sáv)
- háttér rgba(255,255,255,.75) + backdrop-blur 20px, jobb oldali árnyék `4px 0 24px -16px rgba(16,24,40,.25)`.
- inaktív ikon #0A84FF, felirat #48484A.
- aktív elem: háttér `--grad-primary`, ikon+felirat fehér, árnyék `var(--glow-primary), var(--hi)`, radius 12.
- „W” logó: `linear-gradient(180deg,#3A3A3C,#1D1D1F)`, árnyék `0 4px 10px -4px rgba(0,0,0,.5)`.

## 4. Mozgás
- Minden új transition 150–200 ms; `@media (prefers-reduced-motion: reduce)` alatt transform/transition kikapcsolva.

## 5. Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` hiba figyelmen kívül hagyható), `git diff --stat`.
- Build-ellenőrzést NE indíts (a helyi `helyi/` fájl miatt elhasal) – azt a felügyelő futtatja tiszta másolatban.
- Commit: `redesign 0c: C színséma, térhatás (kártya, gomb, fül, oldalsáv)`. PROGRESS.md egy sor, CLAUDE.md Redesign pontjában a színek frissítése.
- A végén röviden: módosított fájlok, futtatott parancsok, nyitott kérdések (pl. modulok, ahol beégetett szín miatt nem látszik a változás).
