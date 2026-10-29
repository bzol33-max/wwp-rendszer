# Redesign – 0b: javítások a 0. modul után (jóváhagyva 2026-10-29)

Branch: `redesign/0-alap`. NE pusholj, NE deployolj.

1. **CLAUDE.md** – a „Mobil UX (audit E2)” pontban a betű/narancs márkaszín sor elavult.
   Írd át: a desktop séma 2026-10-29 óta Apple HIG (Inter, `--primary` #007AFF, lásd `docs/redesign/`),
   ezt ne állítsd vissza; a mobil nézetek saját sémája (`--mob-`/`--at-`, `--sidebar-*` a mobil tab-sávon) érintetlen.
   Adj hozzá egy rövid „Redesign” pontot: modulonként haladunk, a feladatleírások a `docs/redesign/*.md`-ben,
   a Fuvarozás 2 / Számlák / Jelenlét saját témái a saját modul-lépésükben cserélődnek.
2. **Oldalsáv feliratok** – csak a megjelenített `label` rövidül a `lib/nav.ts`-ben:
   „Jelenléti/üzenőfal” → „Jelenlét”. A `lib/modules.ts` (jogosultság-beállítások) NEM változik, a `key`/`href` sem.
   Ha a telephely-sor (Szakoly/Balkány/Nyíregyháza) az oldalsávban 2–3 sorba törik, 88 px-en jelenítsd meg rövidítve
   (pl. „Szakoly”, „Balkány”, „Nyíregy.”) teljes névvel `title`-ben — az érték/logika nem változik.
3. **Mobil**: semmihez ne nyúlj, ami 768 px alatt látszik.
4. Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (a `helyi/` hibát figyelmen kívül hagyhatod), `git diff --stat`.
5. Commit: `redesign 0b: CLAUDE.md frissítés, rövidebb oldalsáv-feliratok`. PROGRESS.md egy sor.
