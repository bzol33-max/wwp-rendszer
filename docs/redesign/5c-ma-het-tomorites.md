# Redesign – 5c: Ma + hét lap tömörítése (a felhasználó jóváhagyta, 2026-10-29)

Panasz: „nem elég átlátható, a mai lezárt (pl. Flott Trans) is sok helyet foglal”.
Branch: `redesign/5c` (main-ről). NE pusholj, NE deployolj. Csak megjelenés (`components/fuvarozas2/ma-het*.tsx`, szükség esetén `lib/fuvarozas2/ma-het-alap.ts` tiszta segédfüggvény). Adat, szerver-akció, jogosultság, mobil ág (768 px alatt) NEM változik.

1. **Lezárt mai fuvar egy sorba csukva** (`MaBlokk` / `MaMegallok`): ha egy mai fuvar minden megállója `allapot === "kesz"`, akkor egy sor: „✓ BÉR · {partner} · {első város} → {utolsó város} · lerakva {utolsó TÉNY}” (13 px, halványítva, opacity ~0.65), kattintásra (kliens-oldali kinyitás, pl. `<details>` vagy kis client komponens) kinyílnak a megállók. A link a részletre továbbra is elérhető (a partner-név).
2. **Megálló egy sorban:** „FEL  Debrecen   06:00 → 06:12 ✓” — FEL/LE címke (12 px), város (14 px, truncate), jobbra TERV szürke → TÉNY (kész: zöld ✓, késés/várakozás: piros + eltérés-szöveg). Ha nincs TÉNY: csak a TERV.
3. **Állás-sor és kontakt (cég, 📞)** csak az aktuális megállónál (`allapot === "most" || "kovetkezo"`); lezárt és későbbi megállóknál nem.
4. **Múlt napok ki az oszlopból:** a napok-lista a mai nappal kezdődik (a ‹ › lapozás és a `het` paraméter működése nem változik; ha a felhasználó múltbeli hétre lapoz, akkor ott minden nap látszik). Csúszó (le nem zárt, múlt napra tervezett) fuvar NEM tűnhet el: ha a meglévő adatban van ilyen, a mai blokk tetején jelenjen meg „csúszik · {eredeti nap}” narancs jelöléssel. Ellenőrizd, hogy a meglévő logika (getMaVaszon / getTervezesHet) hogyan kezeli a csúszást, és ehhez igazodj.
5. **Szűkebb fejléc:** rendszám (18/700) + állapot-pirula egy sorban, sofőr jobbra; tachó-sáv 4 px; a fejléc függőleges belső térköze csökken (12 px). Semmi információ nem tűnik el, csak tömörebb.

Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve), a `scripts/teszt-ma-het-lap.ts` és `scripts/teszt-ma-het.ts` (`npx tsx`), ha a segédeket érinted, bővítsd a tesztet. Build és böngésző NE.
Commit (a leírással): `redesign 5c: Ma + hét tömörítés (lezárt fuvar egy sorban, múlt napok ki)`. PROGRESS.md egy sor. Röviden az eredményt.
