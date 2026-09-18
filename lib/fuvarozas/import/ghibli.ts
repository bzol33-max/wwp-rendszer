// A Ghibli Szállítmányozási Kft. "NK_FUVMEGREND" fuvarmegrendelésének
// determinisztikusan olvasható mezői.
//
// Miért kell: a nyelvi modell a Ghibli-iraton a lerakási dátumTARTOMÁNYT
// ("Lerakás dátuma: 2026.09.17 - 2026.09.18") egyetlen napnak vette, és
// mivel az egyezett a felrakáséval, a lerakási dátum üres maradt. A #134
// (Gyöngyöshalász → Debrecen) így egynapos fuvarnak látszott, holott a
// megrendelés másnap reggel 6-ig engedte a lerakást — a GPS lapon a fuvar
// "csúszónak" mutatkozott, nem tervezett kétnaposnak (2026-09-18).
//
// A minták CÍMKÉHEZ horgonyzott, egysoros, szóközre/sortörésre érzéketlen
// (\s*) kifejezések: a Drive szöveg-megjelenítése és a pdf-parse tördelése
// közti különbség csak a címke és az érték közti fehér karakter. Ha egy
// minta nem illeszkedik, a mező null marad, és a nyelvi modell tippje él —
// tehát egy eltérő tördelés legfeljebb a régi viselkedést adja vissza, sort
// nem veszít.
//
// NEM "use server" fájl — sima segédmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";

const FELRAKAS_DATUM = /Felrak[áa]s\s+d[áa]tuma\s*:\s*(\d{4})\.(\d{2})\.(\d{2})/i;
/** "Lerakás dátuma: 2026.09.17 - 2026.09.18" vagy "Lerakás dátuma: 2026.09.18" — a tartomány VÉGE a lerakás napja. */
const LERAKAS_DATUM = /Lerak[áa]s\s+d[áa]tuma\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\.?(?:\s*-\s*(\d{4})\.(\d{2})\.(\d{2}))?/i;
const POZICIOSZAM = /Poz[íi]ci[óo]sz[áa]munk\s*:?\s*([A-Z]\d{2}\/\d{4,6})/;
/** "Közösségi szállítmányozás átvételi díjtétel 800.00 EUR +ÁFA" */
const FUVARDIJ = /d[íi]jt[ée]tel\s*([\d][\d\s.,]*?)\s*(EUR|HUF)\s*\+\s*[ÁA]FA/i;
/** "Rendszám: AOPU427,/AOTY474" — csak a rendszámok, az utánuk jövő címkék nélkül. */
const RENDSZAM = /Rendsz[áa]m\s*:\s*([A-Z]{3,4}-?\d{3}(?:\s*[,/]+\s*[A-Z]{3,4}-?\d{3})*)/;

function iso(ev: string, ho: string, nap: string): string {
  return `${ev}-${ho}-${nap}`;
}

/** "800.00" → 800, "1.200,50" → 1200.5, "90 000,00" → 90000. */
function osszeg(nyers: string): number | null {
  const tisztitott = nyers.replace(/\s/g, "");
  const ertek = /^\d+\.\d{2}$/.test(tisztitott)
    ? Number(tisztitott)
    : Number(tisztitott.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(ertek) && ertek > 0 ? ertek : null;
}

export function kivonGhibliMezoket(nyersSzoveg: string): Partial<KivontFuvar> {
  const eredmeny: Partial<KivontFuvar> = {};

  const fel = nyersSzoveg.match(FELRAKAS_DATUM);
  if (fel) eredmeny.felrakasDatum = iso(fel[1], fel[2], fel[3]);

  const le = nyersSzoveg.match(LERAKAS_DATUM);
  if (le) {
    const lerakasNap = le[4] ? iso(le[4], le[5], le[6]) : iso(le[1], le[2], le[3]);
    // A közös alak szerint a lerakási dátum CSAK akkor van kitöltve, ha
    // eltér a felrakásétól (lásd KivontFuvar / a nyelvi modell utasítása).
    eredmeny.lerakasDatum = eredmeny.felrakasDatum && lerakasNap === eredmeny.felrakasDatum ? null : lerakasNap;
  }

  const poz = nyersSzoveg.match(POZICIOSZAM);
  if (poz) eredmeny.pozicioszam = poz[1];

  const dij = nyersSzoveg.match(FUVARDIJ);
  if (dij) {
    const ertek = osszeg(dij[1]);
    if (ertek !== null) {
      eredmeny.fuvardij = ertek;
      eredmeny.fuvardijPenznem = dij[2].toUpperCase() === "EUR" ? "EUR" : "Ft";
    }
  }

  const rendszam = nyersSzoveg.match(RENDSZAM);
  if (rendszam) eredmeny.rendszamVagySofor = rendszam[1].replace(/\s+/g, " ").trim();

  return eredmeny;
}
