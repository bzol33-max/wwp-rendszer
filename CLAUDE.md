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
- Ecofleet GPS-integráció (frissítve 2026-10-25, audit E3): a pillanatnyi
  pozíció (`Vehicles/getLastData`) mellett be van kötve az útvonal-előzmény
  (`Vehicles/getTrips`), a nyers adat (`Vehicles/getRawData`) és a riport
  (`Reports/getReport`) is — `lib/fuvarozas/ecofleet.ts`, `lib/ecofleet/`
  (kliens, számítás), `lib/jarmu-telemetria/` (tachó/CAN gyűjtő, webhook,
  `app/api/ecofleet/webhook`, `ECOFLEET_WEBHOOK_TOKEN`). Terv és döntések:
  `docs/ecofleet-telemetria-terv.md`. Új Ecofleet-hívás előtt ezeket nézd
  meg, ne építs párhuzamos integrációt.
- Mobil UX (frissítve 2026-10-25, audit E2):
  - A betűtípus (`--font-sans: var(--font-geist-sans);`) és a narancssárga
    márkaszín (`--primary`/`--ring`: `oklch(0.53 0.14 42)`) **már javítva
    van** az `app/globals.css`-ben — ne „javítsd” vissza.
  - Még nyitott: a Készlet, a Számlák és a Dolgozók táblázatai mobilon csak
    vízszintes görgetéssel olvashatók (nincs kártyanézet). A Fuvarozás 2
    (`app/fuvarozas2/megbizasok/page.tsx`, kimutatás, költségek) és a
    Járművek (`jarmuvek-nezet.tsx`) már kapott kártyanézetet — azokat lehet
    mintának venni.

  Ha ezt javítod, az közös CSS/komponens is lehet, tehát koordinálj, nehogy
  két session egyszerre nyúljon ugyanahhoz a fájlhoz.
- Már megvan és jól működik: alsó mobil tab-navigáció (`app-shell.tsx`),
  44px érintési célpontok globálisan (`button.tsx`, `input.tsx`).
