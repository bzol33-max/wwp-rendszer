-- Jogosultság: hiányzó modulkulcs = NINCS hozzáférés (audit 2026-10-04, SEC-12).
-- Eddig a nem opt-in moduloknál (info, fuvarozas, keszlet, szamlak, dolgozok,
-- jelenlet, jarmuvek, beallitasok) a hiányzó bejegyzés teljes hozzáférést
-- adott — egy új modul így visszamenőleg mindenkinek megnyílt volna. Az
-- alapértelmezés a kódban (lib/auth/permissions.ts) hamisra vált; hogy a mai
-- állapot NE változzon, a meglévő felhasználóknál a hiányzó kulcsot most
-- kifejezetten beírjuk azzal az értékkel, amit eddig is kaptak (látja +
-- szerkesztheti). Az admin szerepkör mindenhez hozzáfér, őt nem érinti.
update users u
set permissions = u.permissions || (
  select coalesce(jsonb_object_agg(k, '{"view": true, "edit": true}'::jsonb), '{}'::jsonb)
  from unnest(array['info', 'fuvarozas', 'keszlet', 'szamlak', 'dolgozok', 'jelenlet', 'jarmuvek', 'beallitasok']) as k
  where not (u.permissions ? k)
)
where u.role <> 'admin';
