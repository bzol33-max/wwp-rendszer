@AGENTS.md

## Kontextus-frissítés a WWP-app projektből (2026-09-12)

Ezt a szekciót egy másik Claude Code session (amely a claude.ai "WWP-app"
Projecthez van kötve) diktálta be kézzel, mert ez a repó-session nem fér
hozzá közvetlenül ahhoz a Projecthez. Ha ellentmondást találsz e szöveg és
a repóban lévő tényleges kód között, **a kód a mérvadó** — ez csak
emlékeztető, nem feltétlenül naprakész a legutóbbi commitokhoz képest.

- GitHub repó: bzol33-max/wwp-rendszer (korábban www-rendszer volt a neve,
  átnevezve 2026-09-12 körül).
- Railway projekt: wwp-rendszer, service: web. Éles URL:
  https://web-production-91051.up.railway.app. Auto-deploy a main branch
  push-ra.
- Push előtt mindig `git fetch` + `git pull --rebase origin main`, mert
  több modul-session is dolgozik ugyanazon a repón párhuzamosan.
- Amikor kész egy résszel: `lib/modules.ts`-ben frissítsd a modul `status`
  és `description` mezőjét (elkeszult / fejlesztes-alatt / tervezes-alatt).
- 2026-09-07 óta a rendszer bejelentkezést igényel (`/login`). Ekkor
  derült ki és lett javítva egy kritikus biztonsági hiba: a
  `scripts/migrate.mjs` plaintext jelszavakkal dolgozott a publikus
  repóban — most env-változókból (`SEED_*_PASSWORD`) olvas. Ha ezt a
  fájlt módosítod, ne kerüljön vissza plaintext jelszó.
- Architektúra-szabály: a Számlázz.hu API-t (Számla Agent) kizárólag a
  Számlák modul (`lib/szamlak/`) kérdezi le — más modul a `szamla`
  Postgres-táblából olvasson, ne indítson saját lekérdezést.
- Ecofleet GPS-integráció (`lib/fuvarozas/ecofleet.ts`): jelenleg csak
  pillanatnyi pozíció (`Vehicles/getLastData`) van bekötve. Bővítési
  lehetőség: `Vehicles/getTrips` (útvonal-előzmény) + geofence.
- Mobil UX — ismert, még nyitott hibák minden modulban:
  1. `app/globals.css`-ben `--font-sans: var(--font-sans);` önmagára
     hivatkozó CSS-változó — soha nem oldódik fel, ezért Times New
     Romanra esik vissza a betűtípus. Javítás:
     `--font-sans: var(--font-geist-sans);`.
  2. A narancssárga márkaszín sehol nem jelenik meg —
     `--primary`/`--accent`/`--ring` továbbra is kék-lila
     (`oklch(0.546 0.215 262.1)` körüli).
  3. Táblázatok mobilon csak vízszintes görgetéssel olvashatók (nincs
     kártyanézet-váltás).

  Ha ezek közül bármelyiket javítod, az az egész rendszert érinti (közös
  CSS/komponens), tehát koordinálj, nehogy két session egyszerre nyúljon
  ugyanahhoz a fájlhoz.
- Már megvan és jól működik: alsó mobil tab-navigáció (`app-shell.tsx`),
  44px érintési célpontok globálisan (`button.tsx`, `input.tsx`).
