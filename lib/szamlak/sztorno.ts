// Rontott (hibásan kiállított) számlák automatikus felismerése.
//
// A cég a Számlázz.hu-ban időnként hibásan állít ki egy számlát, majd egy
// NEGATÍV összegű törlő/helyesbítő ("sztornó") számlával korrigálja — vagy
// a teljes összegre (teljes sztornó, gyakran egy új, helyes számla is
// követi), vagy csak a különbözetre (részleges helyesbítés).
//
// A Számlázz.hu API nem ad vissza külön "ez sztornó" jelzőt minden esetben
// megbízhatóan, de a NEGATÍV brutto összeg önmagában is egyértelmű jel: ez
// a cég gyakorlatában mindig egy törlő/helyesbítő tétel, sosem valódi,
// pozitív kintlévőség. Ezért:
//   1) minden negatív összegű számlát "sztorno"-nak jelölünk,
//   2) megpróbáljuk megtalálni az eredeti (pozitív, azonos vevő, pontosan
//      ellentétes összegű, korábbi/azonos napi) számlát, és azt
//      "sztornozva"-nak jelöljük.
// Mindkét fél ki van zárva a Fizetve/Nyitott listákból és az összesítőből
// (lásd actions.ts) — enélkül egy rontott számla tévesen "Fizetve"-ként
// jelenne meg a teljes (hibás) összegére.
//
// A függvény idempotens és teljesen újraszámol minden körben (a `szamla`
// tábla mérete — pár száz/ezer sor — ezt olcsóvá teszi), így egy korábban
// tévesen párosított/jelölt sor sem maradhat "beragadva".

import { query } from "@/lib/db";

export type SztornoEredmeny = {
  sztornoDarab: number;
  parositva: number;
};

export async function frissitSztornoJelolest(): Promise<SztornoEredmeny> {
  // Teljes újraszámolás: előbb mindent nullázunk, majd újraépítjük.
  await query(`update szamla set sztorno = false, sztornozva = false, sztornozo_szamla_id = null`);
  await query(`update szamla set sztorno = true where brutto < 0`);

  const sztornok = await query<{ id: string; vevo_nev: string; brutto: string; kiallitas_datum: string }>(
    `select id::text, vevo_nev, brutto::text, kiallitas_datum::text
     from szamla
     where sztorno = true
     order by kiallitas_datum, id`
  );

  let parositva = 0;
  for (const s of sztornok) {
    const ellentetesOsszeg = -Number(s.brutto);
    const jelolt = await query<{ id: string }>(
      `select id::text
       from szamla
       where vevo_nev = $1
         and brutto = $2
         and sztorno = false
         and sztornozva = false
         and kiallitas_datum <= $3
       order by kiallitas_datum desc, id desc
       limit 1`,
      [s.vevo_nev, ellentetesOsszeg, s.kiallitas_datum]
    );
    if (jelolt[0]) {
      await query(`update szamla set sztornozva = true where id = $1`, [jelolt[0].id]);
      await query(`update szamla set sztornozo_szamla_id = $1 where id = $2`, [jelolt[0].id, s.id]);
      parositva++;
    }
  }

  return { sztornoDarab: sztornok.length, parositva };
}
