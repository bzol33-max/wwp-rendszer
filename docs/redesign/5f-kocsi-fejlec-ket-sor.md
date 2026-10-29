# Redesign – 5f: kocsi-fejléc fele olyan magas – „A · Két sor” (a felhasználó választása, 2026-10-29)

Branch: `redesign/5f` (main-ről). NE pusholj, NE deployolj. Csak a `MaHetKocsi` fejléce (`components/fuvarozas2/ma-het.tsx`) és a `components/fuvarozas2/sebesseg-ora.tsx` (méret-paraméter). Adat, jogosultság, mobil ág NEM változik.
Cél: a fehér élő fejléc magassága a mostani ~290 px helyett ~130–150 px.

Felépítés (padding 10px 12px, felül a 3 px kocsiszín-csík marad):
- **Bal:** sebességmutató 58×58 px (ív 6 px), közepén a szám 17/700; „áll” 13/600; nincs adat → „—” (a „nincs GPS” felirat helyett title/aria-label). A `SebessegOra` kapjon `meret` propot (alap 92 maradhat), itt 58.
- **Jobb, 3 sor (gap 3 px):**
  1. rendszám 17/700 (link a kocsi-lapra) · jobbra **km 24/700** `tabular-nums` + „km” 12 szürke (null → „—”).
  2. állapot színes ponttal + hol van, 12–13 px, egy sorban, levágva (pl. „● Úton · Kecskemét −86 km”; várakozik: piros + „!”) · jobbra „28,4 l” 12 szürke (title: „átlag l/100 az utolsó 7 napból”; null → kimarad).
  3. „Tachó 3:10” 12 szürke · középen 4 px tachó-sáv (flex 1, a meglévő színezéssel, 90 perc alatt piros) · jobbra sofőr 12 szürke.
- **A következő feladat sora** (Lerakó … TERV …) a fejlécből kikerül — a mai blokk mutatja.
- **Figyelmeztető szalag** (ha van): a fejléc alatt keskeny, egysoros sávként (12–13 px, padding 4px 12px), a meglévő szöveggel és színnel.
- **GPS-frissesség** jelzés (csak ha nincs/elavult): a 2. sor jobb végére kis szürke/narancs szöveg, nem külön sor.
- Bajban lévő kocsi piros kerete marad.

Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve). Build és böngésző NE.
Commit (a leírással): `redesign 5f: kocsi-fejléc két sorban (fele olyan magas)`. PROGRESS.md egy sor. Röviden az eredményt.
