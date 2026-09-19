# Visszaállítás 30 perc alatt — Fuvarozás 2 átállás

Kipróbálva: 2026-09-19 (helyi Postgres 16, E4b). Élesben a cutover előtt és a cutover reggelén (E10) ugyanez fut.

## 0. Mikor kell
- A cutover-napon a `fuvar_migracio_hiba` ≠ 0, vagy a régi CASE ≠ új `allapot` egyezés ≠ 0 → **stop**.
- Az első 4 hétben bármilyen adat-hiba, amit a feature flag nem old meg.

## 1. Feature flag vissza (5 perc) — a felület
Railway → `web` → Variables → `FUVAROZAS_REGI=on` → redeploy. A régi fülek visszajönnek, az új eltűnik. **Az adat érintetlen**, mert a régi oszlopok élnek (a trigger a `jelleg`/`torolt_at`-ot tölti tovább).

## 2. Mentés készítése (a cutover ELŐTT, 5 perc)
```
pg_dump "$DATABASE_URL" -Fc > wwp-cutover-$(date +%F).dump
```
(Railway → Postgres → Connect → `DATABASE_PUBLIC_URL`; a `pg_dump` 16-os legyen.)

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
