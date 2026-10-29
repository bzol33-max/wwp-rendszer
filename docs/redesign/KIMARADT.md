# Redesign – kimaradt / későbbre hagyott tételek

A felügyelő (Claude) vezeti; a redesign végén ezt nézzük át a felhasználóval.

## Modulok, amik még hátravannak
- Fuvarozás · Megbízások (R1 terv)
- Fuvarozás · Ma + Hét összevonás (U2c terv)
- Jelenlét + Szabadság egy oldalon (K2 terv) — a felhasználó döntése: később
- Számlák · Számlalista és Kifizetve fül restyle (nem volt rá külön terv)
- Info / kezdőlap, Dolgozók, Járművek, Beállítások — nem volt rájuk külön terv, csak az alap (0/0c) érvényes

## Színtémák
- `.fuvarozas2`, `.szamlak` (menta) és `.jelenlet` (acélkék) saját témái felülírják az új kék sémát → a saját modul-lépésükben cserélendők.
- A Jelenlét fő színe nagyon sötét (#0F172A) → a gombok gradiense ott halvány.
- Beégetett színek a modulok kódjában (`bg-[#…]`, `text-orange-*`) — lista: `docs/redesign/0-alap-eredmeny.md`.
- Badge: csak a destructive kapott halvány-piros pirulát; narancs/zöld/kék változat nincs.
- Sötét mód (`.dark`) nincs frissítve.

## Adat / funkció
- Számlák · Bevétel: tavalyi összevetés nincs (az adat 2026-01-02-től van) → 2027-től bekapcsolható.
- Számlák: EUR számlák (2026-ban 18 db, ~129 000 EUR) nem adódnak a forintösszegekhez, mert nincs tárolt árfolyam → MNB-árfolyam tárolása a szinkronnál külön kis fejlesztés.
- Számlák · Bevétel: a részfizetések nem kerülnek havonta a „befolyt”-ba (csak a teljesen kifizetett számlák).
- Régi, már nem használt komponens: `components/szamlak/szamla-bevetel-diagram.tsx` — törölhető, ha más nem hivatkozik rá.

- Készlet (3): a „Ma +N be · −N ki” fejléc-összegző Nyíregyházán kimarad (ott nincs mozgás-lista, csak szöveges esemény), Szakolyon/Balkányon a szerver dátum-szövegéből számolódik; a hét napjai sáv a hónap adataiból (napi átlag) készül.
- Készlet (3): a fejléc-összegzők (havi + telep) xl-től a fülek sorába húzva, alatta saját sorban — böngészős ellenőrzés kell; a „Mozgások — típusonként” kártyák az Összkészlet fülön vannak, azt a terv nem érintette.
- Fuvarozás (4): a `.fuvarozas2` téma alap-tokenjei (háttér, primary, card, border, muted, accent, ring) törölve → a többi Fuvarozás oldal (Ma, Kocsi, Tervezés, Kimutatás, Költségek, Partnerek, Eredmény, Levelek, Rendszer, TIMOCOM) már a kék sémát kapja, de a `--f2-mint` / `--f2-blue` segédváltozók (menta / acélkék) továbbra is élnek a komponenseikben (kb. 30 fájl); beégetett menta: `timocom.tsx` (1), `eredmeny-nezet.tsx` (2) → az 5. lépésben.
- Fuvarozás (4): a Megbízások kártyáján az „esedékes nov. 15.” sor nincs (a kártya nem kapja a számla esedékességét, csak az „N napja lejárt” jelzést); a közös `MegbizasKartya` (mobil, Ma, kimutatás), a megbízás-részlet lap és a Kocsi-hét panel belseje nem lett átszínezve (a panel gombjai/kiemelései viszont tokenre váltottak).
- Fuvarozás (4): a gyors saját fuvar rögzítő „Legkorábban / Legkésőbb” mezője a „+ részletek” alá került (a 300 px-es oszlopba így fér); az oldal fölötti magyarázó sor („beérkezéstől a pénzig…”) elmaradt, a szakasz-alcím mondja ugyanezt. Böngészős ellenőrzés a felügyelőre vár.

## Kinézet
- Betűskála: van még `text-[11px]`/`text-[10px]` a repóban (12 px alatt semmi szabály) — modulonként.
- Mobil (768 px alatt): szándékosan érintetlen (a felhasználó döntése), az alsó tab-sáv barna maradt.

## Folyamat
- Helyi előnézet nem megy: a `.env` helyi Postgresre mutat (nincs telepítve), a Postgres-teszt adatbázis elavult (hiányoznak táblák). Élesítés + szükség esetén visszavonás a gyakorlat.
- A Mac-en a `helyi/nevegyezes.mts` (nem verziókövetett) elrontja a helyi `npm run build`-et → a build tiszta másolatban (git worktree) fut.
- A Claude Code `~/.claude/settings.json` OpenRouter-kulcsa érvénytelen (401) → a redesign futások az előfizetéssel mennek.
