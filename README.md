# WWP — Well-Worn Pallet belső vállalatirányítási rendszer

Next.js 16 (App Router) + React 19 + PostgreSQL. Élesben a Railway-en fut, a `main` ágra pusholt kód automatikusan kimegy.

## Modulok

| Útvonal | Mi ez | Kód |
|---|---|---|
| `/keszlet`, `/felvasarlas`, `/erkezes` | Raklapkészlet, felvásárlás, dolgozói mobil nézet | `lib/keszlet`, `components/keszlet` |
| `/fuvarozas2`, `/m` | Fuvarozás (megbízások, GPS, elszámolás, posta), mobil nézetek | `lib/fuvarozas`, `lib/fuvarozas2` |
| `/szamlak` | Számlák (Számlázz.hu-szinkron, kontókivonat-párosítás) | `lib/szamlak` |
| `/dolgozok`, `/jelenlet` | Bérek, előlegek, jelenlét, feladatok | `lib/dolgozok`, `lib/jelenlet` |
| `/attekintes` | Vezetői mobil áttekintés | `lib/attekintes` |
| `/beallitasok` | Felhasználók, jogosultságok, típusok | `lib/auth` |

A régi `/fuvarozas` felület a `FUVAROZAS_REGI=off` kapcsolóval ki van kapcsolva.

## Fontos szabályok

- Minden `"use server"` fájl minden exportja kívülről hívható végpont: az első sora jogosultság-ellenőrzés legyen (`requireViewPermission`, `requireEditPermission`, `requireAny…` a `lib/auth/require-permission.ts`-ből). A `scripts/teszt-akcio-jogok.ts` ezt ellenőrzi.
- Háttérfolyamatok (`instrumentation.ts`): számla-szinkron, GPS-teljesítés-figyelő, modell-szinkron. Rendszerjogon (`futtatRendszerkent`), egy példányban (`egyetlenPeldanyban`) futnak.
- A konténer UTC-ben fut: dátumhoz `budapestNapISO()` vagy SQL-ben `at time zone 'Europe/Budapest'`.
- Adatbázis-változás: `db/schema.sql` (minden induláskor, idempotens) vagy egyszer futó `db/migrations/NNN_*.sql`. Éles adatjavítás csak migrációs lépésként.

## Futtatás

```bash
npm ci
npm run typecheck
npm run teszt
```

Az indítás (`npm start`) előbb a `scripts/migrate.mjs`-t futtatja, utána a Next.js-t.

Szükséges környezeti változók: `DATABASE_URL`, `SESSION_SECRET`, valamint az integrációkhoz `SZAMLAZZHU_API_KEY`, `ECOFLEET_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `DRIVE_SYNC_SECRET`, `GMAIL_FIGYELO_SECRET`.
