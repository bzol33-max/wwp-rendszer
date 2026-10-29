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

## Kinézet
- Betűskála: van még `text-[11px]`/`text-[10px]` a repóban (12 px alatt semmi szabály) — modulonként.
- Mobil (768 px alatt): szándékosan érintetlen (a felhasználó döntése), az alsó tab-sáv barna maradt.

## Folyamat
- Helyi előnézet nem megy: a `.env` helyi Postgresre mutat (nincs telepítve), a Postgres-teszt adatbázis elavult (hiányoznak táblák). Élesítés + szükség esetén visszavonás a gyakorlat.
- A Mac-en a `helyi/nevegyezes.mts` (nem verziókövetett) elrontja a helyi `npm run build`-et → a build tiszta másolatban (git worktree) fut.
- A Claude Code `~/.claude/settings.json` OpenRouter-kulcsa érvénytelen (401) → a redesign futások az előfizetéssel mennek.
