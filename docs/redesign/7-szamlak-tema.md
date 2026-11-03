# Redesign – 7: Számlák menta téma → közös kék séma (jóváhagyva 2026-11-03)

Branch: `redesign/7-szamlak-tema` (main-ről). NE pusholj, NE deployolj. Csak szín; logika, adat, mobil ág NEM változik.

1. `app/globals.css` `.szamlak` blokk: a szín-alaptokeneket (background, foreground, card, popover, primary, secondary, muted, accent, success, warning, destructive, border, input, ring és *-foreground) TÖRÖLD, hogy a `:root` (0c) érvényesüljön — pontosan úgy, ahogy a `.fuvarozas2`-nél és a `.jelenlet`-nél történt. A `--radius` és a `--f2-*` segédváltozók maradhatnak, ha bárhol használja őket a Számlák (grep: `components/szamlak`, `app/szamlak`, a kontókivonat-párosítás dialógus). A blokk saját `background`/`color` sorát vedd ki (a body-gradiens látsszon), a fölötte lévő kommentet frissítsd.
2. Beégetett menta (`#1f8f6e`, `#ddf2ea`, `emerald-*`, `teal-*` stb.) a `components/szamlak` és `app/szamlak` fájlokban: elsődleges/kiemelés szerepben → `primary` token; „fizetve/kész” jelentésben → zöld (#248A3D / `success`). A Teendők (W1) és a Bevétel (X4) explicit színeihez (piros/narancs/mappa-színek) ne nyúlj.
3. Ellenőrzés: `npx eslint` a módosított fájlokra, `npx tsc --noEmit` (`helyi/` kiszűrve), `git diff --stat`. Build és böngésző NE.
Commit (a leírással): `redesign 7: Számlák a közös kék sémán`. PROGRESS.md egy sor; a KIMARADT.md-ből a Számlák téma sort töröld/jelöld késznek. Röviden az eredményt.
