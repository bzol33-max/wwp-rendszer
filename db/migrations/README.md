# db/migrations — egyszer futó SQL-lépések

- Fájlnév: `NNN_leiras.sql` (három számjegy, kisbetű, `_`/`-`), fájlnév szerinti sorrendben fut.
- Minden fájl EGY tranzakcióban; siker után az `alkalmazott_javitasok` táblába `sql:<fájlnév>` kód kerül, ezért soha nem fut újra. Már lefutott fájlt NE módosíts — új fájl kell.
- Hiba esetén visszagördül, és az indulás megáll (`scripts/migrate.mjs`, `futtasdSqlMigraciokatOnce`).
- A `db/schema.sql` marad az alap (idempotens `create ... if not exists`); ide csak az kerül, ami nem idempotens: átnevezés, constraint csere, backfill, index csere.
- Visszavonás: `drop` helyett átnevezés (`regi_` előtag), lásd `claude/fuvarozas-atallas-ellenorzes.md` 1. fejezet.
