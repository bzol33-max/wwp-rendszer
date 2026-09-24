// A Megbízások képernyő (D2) „Következő teendő" oszlopának és időszak-
// vödreinek tesztje. Futtatás: npx tsx scripts/teszt-megbizas-szuro.ts
//
// Miért fontos: ez az oszlop mondja meg, mi a soron következő lépés — ha
// rosszat mond, a fuvar megáll (pl. „postázás", miközben a papír még meg
// sem jött).

import { kovetkezoTeendo, idoszakVodor, papirHatraNap } from "@/lib/fuvarozas2/megbizas-szuro";
import type { Allapot } from "@/lib/fuvarozas/allapot";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const MA = "2026-09-20";
const alap: Parameters<typeof kovetkezoTeendo>[0] = {
  allapot: "tervezett", jarmu_kod: "AOPU-427", hianylista: [] as unknown[], hivatkozas: "26/3701", hivatkozas_nincs: false,
  foto_van: false, szamla_szam: null as string | null, papirok_beerkeztek_at: null as string | null,
  papir_hatarido_nap: 7, postazasi_cim: "Debrecen, Pf. 219", jelleg: "ber",
  lerakas_nap: "2026-09-19",
};
const t = (extra: Partial<Parameters<typeof kovetkezoTeendo>[0]> & { allapot: Allapot }) =>
  kovetkezoTeendo({ ...alap, ...extra }, MA);

eq("hiányos import", t({ allapot: "ellenorzesre_var", hianylista: ["fuvardíj", "pozíciószám"] }), { szoveg: "fuvardíj, pozíciószám pótlása", surgos: true });
eq("teljes import", t({ allapot: "ellenorzesre_var" }), { szoveg: "jóváhagyás", surgos: false });
eq("tervezett kocsi nélkül", t({ allapot: "tervezett", jarmu_kod: null }), { szoveg: "kocsi hozzárendelése", surgos: true });
eq("tervezett kocsival", t({ allapot: "tervezett" }), { szoveg: "felrakás", surgos: false });
eq("folyamatban, lejárt", t({ allapot: "folyamatban", lerakas_nap: "2026-09-18" }), { szoveg: "lejárt — teljesítés jelölése", surgos: true });
eq("folyamatban, ma", t({ allapot: "folyamatban", lerakas_nap: MA }), { szoveg: "lerakás", surgos: false });
eq("teljesítve, nincs fotó", t({ allapot: "teljesitve" }), { szoveg: "sofőr fuvarlevél-fotója", surgos: false });
eq("teljesítve, van fotó", t({ allapot: "teljesitve", foto_van: true }), { szoveg: "fotó ellenőrzése", surgos: false });
eq("számlázható hivatkozással", t({ allapot: "szamlazhato" }), { szoveg: "számlázás a Számlázz.hu-ban", surgos: false });
eq("számlázható hivatkozás nélkül", t({ allapot: "szamlazhato", hivatkozas: null }), { szoveg: "hivatkozási szám a számlához", surgos: true });
eq("számlázható, jelölten nincs hivatkozás", t({ allapot: "szamlazhato", hivatkozas: null, hivatkozas_nincs: true }), { szoveg: "számlázás a Számlázz.hu-ban", surgos: false });
eq("számlázva, van számlaszám", t({ allapot: "szamlazva", szamla_szam: "WWP-2026-412" }), { szoveg: "számla e-mail a partnernek", surgos: false });
eq("számlázva, nincs számlaszám", t({ allapot: "szamlazva" }), { szoveg: "számla párosítása", surgos: false });

// E-mail elment: a papír a postázás kapuja (B7).
eq("e-mail elment, postázási határidő bőven (a külön papír-jelölés megszűnt)", t({ allapot: "email_elment", lerakas_nap: "2026-09-19", papir_hatarido_nap: 7 }), { szoveg: "postázás · határidő 6 nap", surgos: false });
eq("e-mail elment, postázási határidő szorít", t({ allapot: "email_elment", lerakas_nap: "2026-09-15", papir_hatarido_nap: 7 }), { szoveg: "postázás · határidő 2 nap", surgos: true });
eq("e-mail elment, ismeretlen lerakási nap", t({ allapot: "email_elment", lerakas_nap: null }), { szoveg: "postázás", surgos: false });
eq("e-mail elment, papír megvan, nincs cím", t({ allapot: "email_elment", papirok_beerkeztek_at: "2026-09-19 10:00:00+00", postazasi_cim: null }), { szoveg: "postázási cím hiányzik", surgos: true });
eq("postázva", t({ allapot: "postazva" }), { szoveg: "lezárás", surgos: false });
eq("lezárt", t({ allapot: "lezart" }), { szoveg: "—", surgos: false });

// Papír-határidő számítás
eq("papír-határidő 7 nap a lerakástól", papirHatraNap("2026-09-15", 7, new Date("2026-09-20T09:00:00Z")), 2);
eq("papír-határidő alapértelmezés (7)", papirHatraNap("2026-09-15", null, new Date("2026-09-20T09:00:00Z")), 2);
eq("papír-határidő lerakás nélkül", papirHatraNap(null, 7), null);

// Időszak-vödrök (a hét hétfővel kezdődik; 2026-09-20 vasárnap → a hét 09-14-én kezdődött)
eq("ma = ez a hét", idoszakVodor(MA, MA), "ez_a_het");
eq("hétfő = ez a hét", idoszakVodor("2026-09-14", MA), "ez_a_het");
eq("előző vasárnap = múlt hét", idoszakVodor("2026-09-13", MA), "mult_het");
eq("két hete = régebbi", idoszakVodor("2026-09-06", MA), "regebbi");
eq("nap nélkül = régebbi", idoszakVodor(null, MA), "regebbi");

console.log(`\nMegbízás-szűrő teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
