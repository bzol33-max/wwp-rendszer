-- Megbízások, 2026-10-06: elavult számlaszám a fuvar_elszamolas-ban.
--
-- Az olvasó (lib/fuvarozas2/megbizasok.ts SOR_SQL) a számlaszámot
-- coalesce(e.szamla_szam, m.szamla_szam) sorrendben veszi, de az automatikus
-- számlapárosítás (szinkronizalSzamlaSzamokat) és a régi setFuvarSzamlaSzam
-- eddig csak a fuvar_megbizasok.szamla_szam-ot írta. Sztornó-csere után így
-- a régi, sztornózott szám látszott (pl. #281: WLLWR-2026-334 a 336 helyett).
-- A kód mostantól mindkét helyre ír; ez a lépés a már eltért sorokat igazítja.
--
-- Az eltérés mindig a régi író miatt keletkezett (az új setSzamlaSzam mindkét
-- helyre ír), ezért a fuvar_megbizasok értéke az újabb, az kerül át.

update fuvar_elszamolas e
set szamla_szam = m.szamla_szam,
    szamla_id = sz.id,
    szamla_kelte = sz.kiallitas_datum,
    frissitve_at = now()
from fuvar_megbizasok m
left join szamla sz on sz.szamlaszam = m.szamla_szam
where e.megbizas_id = m.id
  and m.jelleg = 'ber'
  and coalesce(m.szamla_szam, '') <> ''
  and e.szamla_szam is not null
  and e.szamla_szam <> m.szamla_szam;
