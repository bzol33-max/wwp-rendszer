# Redesign – 1. modul: Számlák · Bevétel fül (X4 terv)

Branch: `redesign/1-bevetel` (main-ről). NE pusholj, NE deployolj. Csak a Bevétel fül változik, a többi fül (Teendők, Számlalista, Kifizetve), a szinkron, a kontókivonat-párosítás, az adatmodell NEM.
Adatbázis: csak OLVASÓ lekérdezés (select). Séma, migráció, írás tilos.

## Adat-tények (a felügyelő ellenőrizte az éles DB-n, 2026-10-29)
- `szamla` tábla 2026-01-02 óta van feltöltve → **tavalyi összevetés NINCS** (nem becsüljük, nem mutatjuk). Ahol a terv „tavaly”-t írt, az kimarad.
- Mappák: Fuvar = `kategoria='fuvar'`; Fabrika / Keter / Egyéb = `kategoria='raklap'` + `alkategoria` ('fabrika','keter','egyeb').
- Összeg: a meglévő `BRUTTO_SQL` (brutto + helyesbites_osszeg), sztornó-párok kizárva (`not sztorno and not sztornozva`), mint a meglévő `getSzamlaHaviBevetel`-ben.
- Pénznem: a HUF összegek összeadhatók; a nem HUF (EUR) számlák (kb. 18 db) NEM adódnak hozzá (nincs tárolt árfolyam, becslés tilos) — külön, EUR-ban jelennek meg.
- Befolyt: kifizetett számlák `fizetve_datum` hónapja szerint, `BRUTTO_SQL` összeggel (HUF). Ahol `fizetve` igaz, de `fizetve_datum` üres, azt a hónapokba ne tedd, de a darabszámát írd ki egy apró megjegyzésben („N kifizetett számlának nincs dátuma”).

## Új szerver-akció (lib/szamlak/actions.ts, a meglévők mellé, a meglévőket ne módosítsd)
`getSzamlaBevetelAttekintes()` – `requireViewPermission("szamlak")`, folyó év, egy vagy néhány select:
- havonta (1..folyó hónap) mappánként számlázva HUF; havonta befolyt HUF;
- YTD összesen, Fuvar YTD, Raklap YTD (Fabrika+Keter+Egyéb), Fabrika+Keter arány %;
- EUR: YTD összeg EUR-ban és darab, mappánként;
- vevők: új vevő = akinek az első számlája a folyó év 3. hónapja után van (első számla dátuma + eddigi összeg); elmaradó vevő = akinek volt számlája, de az utolsó 90+ napja volt (utolsó számla dátuma + eddigi összeg). Mindkettő max 6 sor, összeg szerint. Fabrika és Keter (egy-egy vevő) is benne lehet.
Típusok a `szamla-constants.ts`-be.

## Nézet – components/szamlak/szamla-bevetel-diagram.tsx átírása (vagy új komponens ugyanoda bekötve, a régi törlése nélkül is jó; a szamlak-view.tsx-ben csak a beköté sor változzon)
Elrendezés 1920×1080-on görgetés nélkül, ≥1280 px-en 2 oszlop, alatta 1 oszlop:
1. **Felül 4 kulcsszám-csempe** (kártya, térhatás-tokenek: `--shadow-card`, `--hi`; felül 3 px színes sáv):
   - Számlázva · {év} jan–{hónap} (HUF) — kék; alatta: „+ {EUR összeg} EUR külön (N számla)” ha van
   - Befolyt · ugyanaz az időszak — zöld; alatta: „a számlázott X%-a”
   - Fuvar · Raklap — két szám; alatta arány
   - Fabrika + Keter aránya — %; alatta „a számlázott összegből”
2. **Bal: „Összetétel havonta”** – hónaponként egy sor: hónapnév · 100%-os vízszintes sáv mappánként (30 px magas, a szegmensben a % fehér 12 px-es felirattal, ha a szegmens elég széles) · jobbra a havi összeg (14 px félkövér) és alatta „befolyt X M” zöld. A folyó hónap sora halványabb, „folyó” jelöléssel.
   Jelmagyarázat felül. Színek: Fuvar #0A84FF, Fabrika #AF52DE, Keter #30B0C7, Egyéb #A1A1A6.
3. **Jobb fent: 4 mappa-kártya 2×2-ben** – mappa neve színes ponttal, YTD összeg (18 px), „a teljes X%-a”, alatta havi oszlopok (csak az idei, tavalyi szellem NINCS), a folyó hónap halványabb.
4. **Jobb lent: „Új és elmaradó vevők”** – címke (kék „Új vevő” / narancs „90+ napja nincs számla”), vevő neve, alatta első/utolsó számla dátuma + eddigi összeg.
- Számformátum: millió Ft-ban egy tizedessel („12,2 M Ft”), tooltipben pontos Ft. `tabular-nums`.
- Szövegszínek: #1D1D1F / #48484A / #6E6E73; 12 px alatt semmi.
- Üres állapot: ha nincs adat egy blokkhoz, rövid szürke mondat, ne törjön el.
- A régi statisztika-sor (havi átlag, csúcshónap, növekedés) kikerül a nézetből; a `getSzamlaKiemeltStatisztika` maradjon (más is használja).

## Ellenőrzés és lezárás
- `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` hiba figyelmen kívül hagyható), `git diff --stat`.
- Buildet NE indíts, böngészős ellenőrzést NE – azt a felügyelő végzi.
- Commit: `redesign 1: Számlák · Bevétel fül (X4)`. PROGRESS.md egy sor.
- A végén röviden: módosított fájlok, a lekérdezések rövid leírása, futtatott parancsok, nyitott kérdések.
