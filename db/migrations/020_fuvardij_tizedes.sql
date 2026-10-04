-- Fuvardíj és költség két tizedessel (audit 2026-10-04, DB-3). Az EUR-os
-- fuvarok díja eddig egész számra kerekítve tárolódott (pl. 719,50 € → 720 €),
-- a centek elvesztek; a számla-párosítás 1-es tűréssel nyelte el. A forintos
-- összegek egész számok maradnak (a ,00 csak tárolás). Az alkalmazás a numeric
-- értékeket számként kapja (lib/db.ts típus-értelmező).
alter table fuvar_megbizasok alter column fuvardij type numeric(12,2);
alter table fuvar_megbizasok alter column koltseg type numeric(12,2);
