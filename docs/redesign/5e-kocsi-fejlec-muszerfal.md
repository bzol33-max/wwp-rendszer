# Redesign – 5e: kocsi-fejléc „Műszerfal” (a felhasználó a 10 tervből az 1-est választotta, 2026-10-29)

Branch: `redesign/5e` (main-ről). NE pusholj, NE deployolj. Csak `components/fuvarozas2/ma-het.tsx` (a `MaHetKocsi` fejléce), szükség esetén egy új kis komponens (pl. `components/fuvarozas2/sebesseg-ora.tsx`). Adat, szerver-akció, jogosultság, mobil ág NEM változik. A meglévő mezőket használd: `sebesseg`, `fogyasztas.l100`, `napiKm`, tachó, állapot, hol van, következő feladat, figyelmeztető szalag.

A fehér élő fejléc új felépítése (felülről):
1. **Sor:** rendszám 18/700 (link a kocsi-lapra, mint most) · jobbra sofőr 12 szürke. Felül a 3 px kocsiszín-csík marad.
2. **Műszerfal-sor** (flex, gap 14 px):
   - **Bal: sebességmutató** — 92×92 px SVG ív (270°-os, 135°-tól indul, lekerekített végek, 8 px vastag): háttér-ív #E5E8EE, kitöltés #0A84FF arányosan a sebességgel, skála 0–90 km/h (90 felett tele). Közepén a szám 22/700, alatta „km/h” 12 szürke. 0 km/h → szám helyett „áll” (14/600), kitöltés nincs. Nincs adat (null, nincs GPS/elavult) → az ív szürke, közepén „—”, alatta „nincs GPS” 12. Animáció: a kitöltés 0-ról nő (600 ms, `prefers-reduced-motion` alatt nincs).
   - **Jobb:** „ma megtett” 12 szürke · **km 34/700**, `tabular-nums`, letter-spacing −0.02em, utána „km” 15/600 szürke (ha `napiKm` null → „—”) · alatta „28,4 l/100 · 7 nap” 13 #48484A (ha null → kimarad).
3. **Állapot-pirula** a sor alatt, balra igazítva, a pirulában az állapot + hol van: „● Úton · M5, Kecskemét előtt 86 km” (a meglévő állapot-színekkel; várakozik piros + „!”).
4. **Következő feladat** 13: „Lerakó: Kecskemét · TERV 13:40” (a meglévő adatból).
5. **Tachó:** „Tachó” 12 szürke · jobbra „3 ó 10 p” 13/600 · alatta 4 px sáv (a meglévő színezéssel, 90 perc alatt piros).
6. **Figyelmeztető szalag** (ha van) változatlanul alul.
Az 5d-ben hozzáadott külön „62 km/h · 28,4 l/100 · ma 412 km” sort töröld (az adatok most a műszerfalon vannak). A GPS-frissesség jelzés szabálya marad (csak ha nincs/elavult).
Szűk oszlopban (< 280 px) a mutató 76 px-re kicsinyül, a km 28 px-re.

Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve). Build és böngésző NE.
Commit (a leírással): `redesign 5e: kocsi-fejléc műszerfal (sebességmutató + nagy km)`. PROGRESS.md egy sor. Röviden az eredményt.
