# Visszaállítás 30 perc alatt — adatbázis-mentés és -visszatöltés

Kipróbálva: 2026-09-19 (helyi Postgres 16, E4b), a Fuvarozás 2 átálláshoz írva.
**Frissítve 2026-10-25 (audit E1):** a régi felület 2026-10-04-én törölve lett,
a `FUVAROZAS_REGI` kapcsolót semmi nem olvassa — a régi 1. lépés („feature flag
vissza”) ezért kikerült. A 2–5. lépés (mentés, visszatöltés, átkötés) általános
DB-helyreállításként érvényes. Üres adatbázisra a `migrate.mjs` 2026-10-25 óta
újra felépíti a sémát (audit A1/A2; előtte 2026-10-01 óta elhasalt).

## 0. Mikor kell
- Adatvesztés vagy -sérülés élesben, amit kézi javítás nem old meg.
- Nagyobb, visszafordíthatatlan migráció előtt: a 2. lépés (mentés) mindig.

## 1. (Megszűnt) Feature flag vissza
A régi Fuvarozás felület és a `FUVAROZAS_REGI` kapcsoló 2026-10-04 óta nem
létezik; a felület visszaállítása csak git-revert + deploy útján lehetséges.

## 2. Mentés készítése (a cutover ELŐTT, 5 perc)
```
pg_dump "$DATABASE_URL" -Fc > wwp-cutover-$(date +%F).dump
```
(A `pg_dump` 16-os legyen. Az éles Postgresnek 2026-10-25-én **nincs nyilvános
TCP-proxyja** (`DATABASE_PUBLIC_URL`) — kívülről csak egy ideiglenesen
bekapcsolt proxyn át érhető el: Railway → Postgres → Settings → Networking →
TCP Proxy, a mentés után kikapcsolni. Alternatíva: `railway run` a projekt
környezetében.)

## 3. Visszatöltés külön adatbázisba (10 perc) — próba vagy éles
```
createdb -h ... wwp_restore
pg_restore -h ... -d wwp_restore wwp-cutover-*.dump
DATABASE_URL=<wwp_restore url> node scripts/migrate.mjs     # az app indulása ugyanezt csinálja
```
Elvárt kimenet: `[migrate] séma alkalmazva.` és `[migrate] sql-migráció: nincs új (N ismert).` — a már lefutott migrációk NEM futnak újra (`alkalmazott_javitasok`).

## 4. Átkötés (5 perc)
Railway → `web` → Variables → `DATABASE_URL` a visszatöltött adatbázisra → redeploy. Vagy: a Postgres szolgáltatás `DATABASE_URL`-jén `pg_restore --clean` az eredetibe (csak ha az eredeti már biztosan nem kell).

## 5. Ellenőrzés
- Bejelentkezés `vezeto`/`admin`; Fuvarozás → Bér fuvarok lista betölt; egy megbízás részlete nyílik.
- `select count(*) from fuvar_megbizasok where (tipus='sajat') <> (jelleg='ber')` = 0.
