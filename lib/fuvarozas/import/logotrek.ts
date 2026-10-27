// Logo Trek Kft. „Fuvarmegbízás, szállítási szerződés” — determinisztikus mezők.
//
// Miért kell: az irat MEGBÍZOTT blokkjában a mi címünk áll (4234 Szakoly),
// a lerakónál viszont csak a város („ÁRUÁTVÉT. HELYE: GYŐR”, utca nélkül).
// A nyelvi modell ilyenkor a teljes címet adó Szakolyt írta lerakónak
// (2026-10-27, Dunaharaszti–Győr). A pdf-parse ráadásul a címkéket és az
// értékeket szétszórja (az „ÁRUKISZOLG. HELYE: ÁRUÁTVÉT. HELYE:” sor az
// értékek nélkül áll, a „4234 Szakoly…” sor messze tőlük), ezért itt nem
// a szövegsorrendből, hanem a pdfjs oldalkoordinátáiból olvasunk:
//
//   bal hasáb  (x≈27)  „ÁRUKISZOLG. HELYE:”  -> értéke ugyanazon a soron, jobbra = FELRAKÓ
//   jobb hasáb (x≈300) „ÁRUÁTVÉT. HELYE:”    -> értéke ugyanazon a soron, jobbra = LERAKÓ
//   bal hasáb          „Fuvardíj:”           -> „75 000 Ft + ÁFA” ugyanazon a soron
//
// Koordináta nélkül (docx, Docs) semmit nem tippelünk: marad a modellé.
// Ami itt megvan, az felülírja a modell tippjét (drive-sync-core.ts).
//
// Minta: scripts/teszt-logotrek.mts (a valódi pdfjs-elemek koordinátái,
// kitalált nevekkel).
//
// NEM "use server" fájl — sima segédmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";
import type { SzovegElem } from "./pdf-elemek";

/** Ennyi pontnyi függőleges eltérésen belül számít egy sorba az elem. */
const SOR_TURES = 3;
const FELRAKO_CIMKE = /^[ÁA]RUKISZOLG\.?\s*HELYE:?$/i;
const LERAKO_CIMKE = /^[ÁA]RU[ÁA]TV[ÉE]T\.?\s*HELYE:?$/i;
const FUVARDIJ_CIMKE = /^Fuvard[íi]j:?$/i;
/** „75 000 Ft + ÁFA” — összeg, pénznem. */
const DIJ = /^(\d[\d\s. ]*?)\s*(Ft|HUF|EUR)\b/i;

/** Az adott oldalon, a cimkével azonos sorban, a [xMin, xMax) sávban álló elemek balról jobbra. */
function sorErteke(elemek: SzovegElem[], cimke: SzovegElem, xMin: number, xMax: number): string {
  return elemek
    .filter(
      (e) =>
        e.oldal === cimke.oldal &&
        Math.abs(e.y - cimke.y) <= SOR_TURES &&
        e.x > xMin &&
        e.x < xMax &&
        e !== cimke
    )
    .sort((a, b) => a.x - b.x)
    .map((e) => e.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function kivonLogoTrekMezoket(_nyersSzoveg: string, elemek: SzovegElem[] | null): Partial<KivontFuvar> {
  if (!elemek) return {};
  const eredmeny: Partial<KivontFuvar> = {};

  const felrakoCimke = elemek.find((e) => FELRAKO_CIMKE.test(e.str.trim()));
  const lerakoCimke = elemek.find((e) => LERAKO_CIMKE.test(e.str.trim()));

  // A két hasáb határa a jobb oldali címke x-e: a bal érték nem csúszhat át a jobb hasábba.
  if (felrakoCimke && lerakoCimke && felrakoCimke.oldal === lerakoCimke.oldal) {
    const felrako = sorErteke(elemek, felrakoCimke, felrakoCimke.x, lerakoCimke.x - 1);
    const lerako = sorErteke(elemek, lerakoCimke, lerakoCimke.x, Infinity);
    if (felrako) eredmeny.felrako = felrako;
    if (lerako) eredmeny.lerako = lerako;
  }

  const dijCimke = elemek.find((e) => FUVARDIJ_CIMKE.test(e.str.trim()));
  if (dijCimke) {
    const m = DIJ.exec(sorErteke(elemek, dijCimke, dijCimke.x, Infinity));
    if (m) {
      const osszeg = Number(m[1].replace(/[\s. ]/g, ""));
      if (Number.isFinite(osszeg) && osszeg > 0) {
        eredmeny.fuvardij = osszeg;
        eredmeny.fuvardijPenznem = m[2].toUpperCase() === "EUR" ? "EUR" : "Ft";
      }
    }
  }

  return eredmeny;
}
