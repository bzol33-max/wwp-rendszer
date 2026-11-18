-- Partner-adat javaslat: a székhely is javasolható mező (2026-11-18, tulajdonos:
-- „minden adat minden partnernél meglegyen”). A 049-es check csak a négy
-- eredeti mezőt engedte, ezért a kitöltés „szekhely” beszúrása elbukott
-- (a Partnerek oldal „Frissítés most” gombja hibát adott).
alter table fuvar_partner_javaslat drop constraint if exists fuvar_partner_javaslat_mezo_check;
alter table fuvar_partner_javaslat add constraint fuvar_partner_javaslat_mezo_check
  check (mezo in ('postazasi_cim', 'szekhely', 'szamlazasi_email', 'papir_bekuldesi_hatarido_nap', 'fizetesi_hatarido_nap'));
