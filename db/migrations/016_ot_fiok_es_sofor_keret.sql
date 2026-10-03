-- OT mobil fiók előkészítése és a sofőrök szabadságkerete (2026-10-03).
-- Egyszeri adatlépések; a futtatót lásd scripts/migrate.mjs
-- :futtasdSqlMigraciokatOnce — egy tranzakció, egyszer.

-- 1. Oszlánszki Tamás mobil fiókja. Két fiókja lesz: a meglévő, irodai
--    "OszlanszkiTamás" változatlan marad, az "OT" pedig a telefonra megy.
--    Ott csak felvásárol: a kezdőlapon a Felvásárlás és a Profil csempe van,
--    Jelenléti és Feladatok nincs (alkalmazottak.jelenlet_aktiv nála hamis,
--    és az dönti el a két csempét — lásd lib/jelenlet/actions.ts
--    getJelenletAktiv).
--
--    A sor LETILTVA és használhatatlan jelszóval jön létre: jelszót sem
--    beállítani, sem kiírni nem szabad. A "nincs-jelszo" nem érvényes bcrypt
--    hash, a bcrypt.compare erre mindig hamisat ad (nem dob hibát), az
--    active = false pedig a jelszó-ellenőrzés ELŐTT visszautasítja a
--    belépést (lib/auth/actions.ts login). A fiók addig használhatatlan,
--    amíg Budaházi Zoltán a Beállítások → Felhasználók oldalon jelszót nem
--    ad neki és be nem kapcsolja.
--
--    A jogosultságoknál a nem opt-in modulokat KIFEJEZETTEN hamisra kell
--    állítani: hiányzó kulcs esetén az alkalmazás engedélyezettnek tekinti
--    őket (lásd lib/auth/permissions.ts resolvePermission).
insert into users (username, password_hash, name, role, active, employee_id, permissions)
select 'OT', 'nincs-jelszo', 'Oszlánszki Tamás', 'dolgozo', false, a.id, '{
  "info":           {"view": false, "edit": false},
  "fuvarozas":      {"view": false, "edit": false},
  "keszlet":        {"view": false, "edit": false},
  "szamlak":        {"view": false, "edit": false},
  "dolgozok":       {"view": false, "edit": false},
  "jelenlet":       {"view": false, "edit": false},
  "jarmuvek":       {"view": false, "edit": false},
  "beallitasok":    {"view": false, "edit": false},
  "mobil":          {"view": false, "edit": false},
  "posta":          {"view": false, "edit": false},
  "attekintes":     {"view": false, "edit": false},
  "keszlet_sajat":  {"view": false, "edit": false},
  "fuvarozas_sajat":{"view": false, "edit": false},
  "elszamolas":     {"view": false, "edit": false},
  "rendszer":       {"view": false, "edit": false},
  "erkezes":           {"view": true, "edit": true},
  "elolegek_sajat":    {"view": true, "edit": true},
  "felvasarlas_mobil": {"view": true, "edit": true}
}'::jsonb
  from alkalmazottak a
 where a.name = 'Oszlánszki Tamás'
   and not exists (select 1 from users u where lower(u.username) = 'ot');

-- 2. A két sofőr szabadságkerete 13-13 nap, 2026-08-31-i fordulónappal —
--    ugyanaz a logika, mint a két Gabinál (db/migrations/006): a Profil
--    ebből vonja le a fordulónap UTÁN rögzített szabadság-napokat.
update alkalmazottak set szabadsag_keret_nap = 13, szabadsag_keret_datum = date '2026-08-31'
 where name in ('Vadon Gergő', 'Takács Miklós') and szabadsag_keret_nap is null;
