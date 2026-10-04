-- Sikertelen bejelentkezések naplója a jelszó-próbálgatás fékezéséhez
-- (audit 2026-10-04, SEC-6). A login (lib/auth/actions.ts) felhasználónevenként
-- számolja az utolsó 15 perc hibáit; 8 után átmenetileg nem enged be. A kulcs
-- szándékosan a felhasználónév, nem az IP: a dolgozók közös mobilhálózati
-- IP-ről jönnek, egy IP-alapú zár mindenkit kizárna.
create table if not exists bejelentkezes_hiba (
  id          bigserial primary key,
  felhasznalo text not null,
  ip          text,
  mikor       timestamptz not null default now()
);
create index if not exists bejelentkezes_hiba_felhasznalo_mikor_idx
  on bejelentkezes_hiba (lower(felhasznalo), mikor desc);
