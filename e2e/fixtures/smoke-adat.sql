-- Smoke-teszt adat: minden sor „SMOKE” jelölésű, újrafuttatható (előbb töröl).
-- CSAK helyi teszt-DB-re (lásd e2e/global-setup.ts — más hoszton nem fut le).
delete from fuvar_megbizasok where megrendelo = 'SMOKE Teszt Kft.';
delete from szamla where szamlaszam like 'SMOKE-%';
delete from fuvar_partnerek where nev_kulcs = 'smoke teszt kft';

insert into fuvar_partnerek (nev, nev_kulcs) values ('SMOKE Teszt Kft.', 'smoke teszt kft');

-- Bérfuvar (jelleg = 'ber'; a régi tipus mezőben ez 'sajat', lásd allapot.ts).
insert into fuvar_megbizasok (tipus, jelleg, datum, felrako, lerako, megrendelo, partner_id,
                              fuvardij, fuvardij_penznem, allapot, forras, pozicioszam, statusz)
select 'sajat', 'ber', current_date, 'Nyíregyháza', 'Budapest', 'SMOKE Teszt Kft.', p.id,
       250000, 'Ft', 'tervezett', 'kezi', 'SMOKE-POZ-1', 'tervezett'
  from fuvar_partnerek p where p.nev_kulcs = 'smoke teszt kft';

insert into szamla (szamlaszam, vevo_nev, kiallitas_datum, teljesites_datum, fizetesi_hatarido,
                    netto, afa, brutto, kategoria, penznem, fizetve)
values ('SMOKE-2026-001', 'SMOKE Teszt Kft.', current_date - 5, current_date - 5, current_date + 25,
        100000, 27000, 127000, 'fuvar', 'HUF', false);
