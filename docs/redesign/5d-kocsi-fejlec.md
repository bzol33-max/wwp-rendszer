# Redesign – 5d: kocsi-fejléc kiegészítés + tachó-küszöb (a felhasználó kérése, 2026-10-29)

Branch: `redesign/5d` (main-ről). NE pusholj, NE deployolj. DB/séma: semmi. Mobil ág érintetlen.

1. **Rendszám mellé (ugyanabba a sorba, vagy közvetlenül alá egy tömör sorba, ha nem fér):** `sebesség · átlagfogyasztás · km`
   - **Sebesség:** az élő Ecofleet-adatból, amit a `getMaVaszon` már lekér (`lib/fuvarozas/ecofleet.ts` utolsó adat `speed` mezője — nézd meg, hol jön be az „élő” állapot a ma-vaszon.ts-ben, és onnan add tovább a `MaKocsi`-ba egy új, opcionális `sebesseg?: number | null` mezőben). Kijelzés: „62 km/h”; 0-nál „áll”; ha nincs GPS vagy elavult az adat → nem jelenik meg. Új Ecofleet-hívást NE indíts, csak a már meglévő lekérés eredményét használd. Ha a meglévő lekérés nem ad sebességet, írd meg, és a sebesség maradjon ki (ne becsülj).
   - **Átlagfogyasztás:** a meglévő `MaKocsi.fogyasztas.l100` (CAN, utolsó 7 nap) → „28,4 l/100”; title: „átlag az utolsó 7 napból”. Ha null → kimarad.
   - **Km:** a meglévő `MaKocsi.napiKm` → „ma 412 km”. Ha null → kimarad.
   - Formátum: 13 px, `tabular-nums`, szürke (#48484A), elválasztó „ · ”. Nem kap színt (a színszabály marad).
2. **Tachó-küszöb:** a `KEVES_TACHO_PERC` 60 → **90** perc (a felhasználó döntése). A tesztet igazítsd.

Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve). Build és böngésző NE.
Commit (a leírással): `redesign 5d: kocsi-fejléc sebesség/fogyasztás/km, tachó-küszöb 90 perc`. PROGRESS.md egy sor. Röviden az eredményt, külön: honnan jön a sebesség.
