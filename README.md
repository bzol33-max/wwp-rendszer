# WWP — Well-Worn Pallet belső vállalatirányítási rendszer

Next.js 16 (App Router) + React 19 + PostgreSQL. Élesben a Railway-en fut, a `main` ágra pusholt kód automatikusan kimegy.

## Modulok

| Útvonal | Mi ez | Kód |
|---|---|---|
| `/keszlet`, `/felvasarlas`, `/erkezes` | Raklapkészlet, felvásárlás, dolgozói mobil nézet | `lib/keszlet`, `components/keszlet` |
| `/fuvarozas2`, `/m` | Fuvarozás (Kocsik, Megbízások, Pénz, Tervezés, Ajánlat), mobil nézetek | `lib/fuvarozas`, `lib/fuvarozas2` |
| `/szamlak` | Számlák (Számlázz.hu-szinkron, kontókivonat-párosítás) | `lib/szamlak` |
| `/dolgozok`, `/jelenlet` | Bérek, előlegek, jelenlét, feladatok | `lib/dolgozok`, `lib/jelenlet` |
| `/attekintes` | Vezetői mobil áttekintés | `lib/attekintes` |
| `/beallitasok` | Felhasználók, jogosultságok, típusok | `lib/auth` |

A régi `/fuvarozas` felület 2026-10-04-én törölve lett; az útvonal a `/fuvarozas2`-re irányít (`next.config.ts`). A GPS és az Elszámolás lap 2026-10-12 óta nincs (Ma, illetve Megbízások pénz-nézete).

## Fontos szabályok

- Minden `"use server"` fájl minden exportja kívülről hívható végpont: az első sora jogosultság-ellenőrzés legyen (`requireViewPermission`, `requireEditPermission`, `requireAny…` a `lib/auth/require-permission.ts`-ből). A `scripts/teszt-akcio-jogok.ts` ezt ellenőrzi.
- Háttérfolyamatok (`instrumentation.ts`): számla-szinkron, GPS-teljesítés-figyelő, modell-szinkron. Rendszerjogon (`futtatRendszerkent`), egy példányban (`egyetlenPeldanyban`) futnak.
- A konténer UTC-ben fut: dátumhoz `budapestNapISO()` vagy SQL-ben `at time zone 'Europe/Budapest'`.
- Adatbázis-változás: `db/schema.sql` (minden induláskor, idempotens) vagy egyszer futó `db/migrations/NNN_*.sql`. Éles adatjavítás csak migrációs lépésként.
- A `db/schema.sql` a migrációk ELŐTT fut: nem hivatkozhat olyan táblára, amit csak egy migráció hoz létre (különben üres adatbázisra nem épül fel a rendszer — audit A1, 2026-10-25).

## Futtatás

```bash
npm ci
npm run typecheck
npm run teszt
```

Smoke tesztek (Playwright, helyi eldobható adatbázison — leírás: `e2e/README.md`):

```bash
npm run smoke         # next dev ellen
npm run smoke:build   # a buildelt app ellen (előtte: npm run build)
```

Az indítás (`npm start`) előbb a `scripts/migrate.mjs`-t futtatja, utána a Next.js-t.

Szükséges környezeti változók: `DATABASE_URL`, `SESSION_SECRET`, valamint az integrációkhoz `SZAMLAZZHU_API_KEY`, `ECOFLEET_API_KEY`, `ECOFLEET_WEBHOOK_TOKEN`, `OPENROUTER_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `DRIVE_SYNC_SECRET`, `GMAIL_FIGYELO_SECRET`.

Opcionális: `OPENROUTER_MODEL`, `OPENROUTER_PDF_MODEL` (modellválasztás), `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` (térképcsempe), `TELEMETRIA_NAPLO` (részletes telemetria-napló), `SEED_*_PASSWORD` (a `migrate.mjs` ezekkel hozza létre a fiókokat az első induláskor — plaintext jelszó a repóba nem kerülhet), `TESZT_DATABASE_URL` (néhány DB-s teszt-szkript), `SMOKE_USER`/`SMOKE_PASSWORD` (smoke tesztek).
