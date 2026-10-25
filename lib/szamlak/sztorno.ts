// Rontott (hibásan kiállított) számlák automatikus felismerése.
//
// A cég a Számlázz.hu-ban időnként hibásan állít ki egy számlát, majd egy
// NEGATÍV összegű törlő ("sztornó", tipus=SS) vagy helyesbítő (tipus=HS)
// számlával korrigálja — vagy a teljes összegre (gyakran egy új, helyes
// számla is követi), vagy csak a különbözetre (részleges helyesbítés).
//
// A negatív brutto összeg önmagában egyértelmű jel: ez a cég gyakorlatában
// mindig egy törlő/helyesbítő tétel, sosem valódi, pozitív kintlévőség.
// Hogy MELYIK számlát javítja, azt a Számlázz.hu válasza a
// <hivszamlaszam> mezőben megmondja (élő válaszon ellenőrizve, pl.
// WLLWR-2026-74 SS → WLLWR-2026-72, WLLWR-2026-41 HS → WLLWR-2026-39) — ez a
// mentett raw_xml-ben benne van. Ezért:
//   1) minden negatív összegű számlát "sztorno"-nak jelölünk (kiesik a listákból),
//   2) a hivatkozott eredeti számlán:
//      - ha a javítás a teljes összegét kinullázza → "sztornozva" (az is kiesik),
//      - ha csak egy részét → helyesbites_osszeg-be kerül a (negatív) különbözet,
//        és az eredeti ennyivel kisebb összeggel marad a listákban.
//   3) Ha nincs hivszamlaszam (pl. raw_xml nélküli régi sor), a korábbi
//      heurisztika marad: azonos vevő, pontosan ellentétes összeg — de csak
//      akkor, ha ez EGYÉRTELMŰ (pontosan egy jelölt), különben egy azonos
//      összegű, valódi nyitott számla tűnhetne el tévesen.
//
// A függvény idempotens és teljesen újraszámol minden körben (a `szamla`
// tábla mérete — pár száz/ezer sor — ezt olcsóvá teszi), így egy korábban
// tévesen párosított/jelölt sor sem maradhat "beragadva".

import { withTransaction } from "@/lib/db";

export type SztornoEredmeny = {
  sztornoDarab: number;
  parositva: number;
};

export async function frissitSztornoJelolest(): Promise<SztornoEredmeny> {
  // Egy tranzakcióban: a nullázás és az újraépítés között az olvasók (Számlák
  // lap, kintlévőség) eddig egy pillanatra nyitottnak látták a sztornózott
  // számlákat (audit P8).
  return withTransaction(async (tx) => {
    // Teljes újraszámolás: előbb mindent nullázunk, majd újraépítjük.
    await tx(
      `update szamla set sztorno = false, sztornozva = false, sztornozo_szamla_id = null, helyesbites_osszeg = 0
       where sztorno or sztornozva or sztornozo_szamla_id is not null or helyesbites_osszeg <> 0`
    );
    await tx(`update szamla set sztorno = true where brutto < 0`);

    const sztornok = await tx<{
      id: string;
      vevo_nev: string;
      brutto: string;
      kiallitas_datum: string;
      hivszamlaszam: string | null;
    }>(
      `select id::text, vevo_nev, brutto::text, kiallitas_datum::text,
              nullif(trim(substring(raw_xml from '<hivszamlaszam>([^<]*)</hivszamlaszam>')), '') as hivszamlaszam
       from szamla
       where sztorno = true
       order by kiallitas_datum, id`
    );

    // Eredeti számla id → a rá hivatkozó javítások (negatív) összege.
    const javitasok = new Map<string, { eredetiBrutto: number; osszeg: number; javitoIdk: string[] }>();
    let parositva = 0;

    for (const s of sztornok) {
      if (s.hivszamlaszam) {
        const eredeti = (
          await tx<{ id: string; brutto: string }>(
            `select id::text, brutto::text from szamla where szamlaszam = $1 and brutto > 0`,
            [s.hivszamlaszam]
          )
        )[0];
        if (!eredeti) continue;
        const j = javitasok.get(eredeti.id) ?? { eredetiBrutto: Number(eredeti.brutto), osszeg: 0, javitoIdk: [] };
        j.osszeg += Number(s.brutto);
        j.javitoIdk.push(s.id);
        javitasok.set(eredeti.id, j);
        continue;
      }

      const ellentetesOsszeg = -Number(s.brutto);
      const jeloltek = await tx<{ id: string }>(
        `select id::text
         from szamla
         where vevo_nev = $1
           and brutto = $2
           and sztorno = false
           and sztornozva = false
           and kiallitas_datum <= $3
         limit 2`,
        [s.vevo_nev, ellentetesOsszeg, s.kiallitas_datum]
      );
      if (jeloltek.length === 1) {
        await tx(`update szamla set sztornozva = true where id = $1`, [jeloltek[0].id]);
        await tx(`update szamla set sztornozo_szamla_id = $1 where id = $2`, [jeloltek[0].id, s.id]);
        parositva++;
      }
    }

    for (const [eredetiId, j] of javitasok) {
      // Egy fillérnél kisebb maradék is teljes sztornónak számít (kerekítés).
      if (j.eredetiBrutto + j.osszeg < 0.01) {
        await tx(`update szamla set sztornozva = true where id = $1`, [eredetiId]);
      } else {
        await tx(`update szamla set helyesbites_osszeg = $2 where id = $1`, [eredetiId, j.osszeg]);
      }
      await tx(`update szamla set sztornozo_szamla_id = $1 where id = any($2::bigint[])`, [eredetiId, j.javitoIdk]);
      parositva += j.javitoIdk.length;
    }

    return { sztornoDarab: sztornok.length, parositva };
  });
}
