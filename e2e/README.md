# Smoke tesztek (Playwright)

Fő modul-oldalak: Készlet, Fuvarozás (Kocsik, Megbízások), Számlák, Járművek,
Dolgozók. Mindegyik: betölt, nincs konzolhiba / 5xx, a fő lista megjelenik.

**Csak helyi, eldobható adatbázison futtasd.** A `e2e/global-setup.ts` nem-helyi
hoszt esetén leáll, mert a lapbetöltés és a teszt-adat is ír a DB-be.

`.env.audit.local` (gitignore-olt):

```
DATABASE_URL=postgresql://postgres:…@localhost:55432/wwp_audit
SESSION_SECRET=…
SEED_ADMIN_PASSWORD=…   # a migrate ezzel hozza létre az admin fiókot
SMOKE_USER=admin
SMOKE_PASSWORD=…        # ugyanaz
```

Futtatás:

```
set -a; . ./.env.audit.local; set +a
node scripts/migrate.mjs     # séma + seed
npm run smoke                # next dev ellen
npm run build && npm run smoke:build   # buildelt app ellen
```
