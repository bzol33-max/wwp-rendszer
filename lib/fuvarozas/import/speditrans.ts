// SpediTrans-sablon (BB-Logistic Solution Kft.) — determinisztikus mezők.
//
// A SpediTrans for Windows a felrakót és a lerakót KÉT HASÁBBAN nyomtatja
// egymás mellé ("Felrakás helye: | Lerakás helye"). A Google Drive saját
// szöveg-megjelenítésében a két hasáb sorai összefésülődnek, és a nyelvi
// modell a rossz párokat rakja össze (2026-09-17, 02215-2026.pdf: a felrakó
// és a lerakó fordítva). A pdf-parse VALÓDI kimenetében viszont a két blokk
// tisztán egymás után áll:
//
//   Felrakás helye: \tLerakás helye
//   Határidő: \tHatáridő:
//   DS Smith Packaging Hungary Kft.     <- felrakó: cég
//   HU-3390 Füzesabony                  <-          irsz + város
//   Patak utca 1                        <-          utca
//   Bestpallet Kft.                     <- lerakó:  cég
//   HU-4254 Nyíradony                   <-          irsz + város
//   Kinizsi Pál utca 17.                <-          utca
//
// és a határidők egy sorral feljebb, ugyanebben a sorrendben:
//
//   2026.09.21. 11:00 \t2026.09.21. 14:00\t-ig \t-ig
//
// Itt ezt a szerkezetet olvassuk ki. Ami itt megvan, az felülírja a nyelvi
// modell tippjét (drive-sync-core.ts); ami nincs (áru, megjegyzés,
// postázási cím), az marad a modelltől. Ha a szerkezet nem pontosan ez —
// nem két, egyenként háromsoros blokk —, NEM tippelünk, a mező a modellé.
//
// A minta a scripts/teszt-minta/speditrans-megbizas.txt, a pdf-parse
// tényleges tördelésével (tabulátorokkal) — lásd partnerek.ts fejléce.
//
// NEM "use server" fájl — sima adatmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";

/** Cégnév-sor: cégforma-toldalék, számjegy nélkül (a "Pallet solution kft áruját kell kérni…" megjegyzés-sor nem ilyen: nem a toldalékkal végződik). */
const CEG_SOR = /^[^\d\t]+\b(kft|zrt|bt|nyrt|kkt|gmbh|s\.r\.o|a\.s|sp\. z o\.o)\.?$/i;
/** "HU-3390 Füzesabony" — országkód, irányítószám, város. */
const IRSZ_VAROS_SOR = /^([A-Z]{2})-(\d{4})\s+(\S.*)$/;
/** A határidő-sor: két "ÉÉÉÉ.HH.NN. ÓÓ:PP" egy sorban, a "-ig" toldalékokkal. */
const HATARIDO_SOR = /(\d{4})\.(\d{2})\.(\d{2})\.\s+\d{1,2}:\d{2}/g;
/** "HUF\t110 000,00\tFuvardíj:" — a címke az érték UTÁN áll. */
const FUVARDIJ_SOR = /^(HUF|EUR)\t([\d\s.\u00a0]+(?:,\d{2})?)\tFuvard[íi]j:/i;
/**
 * "Pozíciószám: \t<- Kérjük, hogy számlájukon erre … hivatkozzanak!\t[ 002215/26]"
 * — a pozíciószám a címke sorában, szögletes zárójelben. (A fejlécben a
 * "[Mobil]" / "[Email]" is zárójeles, ezért a címkéhez kötjük.)
 */
const POZICIOSZAM = /Poz[íi]ci[óo]sz[áa]m:[^\[\n]*\[\s*([^\]\s][^\]]*?)\s*\]/;
/** Rendszám-sor: pontosan egy rendszám a sorban (a vontató és a pótkocsi külön sorban áll). */
const RENDSZAM_SOR = /^[A-Z]{3,4}-?\d{3}$/;

type Blokk = { ceg: string; irsz: string; varos: string; utca: string };

/** "Cég, IRSZ Város, utca" — ugyanaz az alak, amit a többi partnernél a nyelvi modell is ad, és amit a varos.ts városnév-kinyerése biztosan olvas. */
function blokkCim(b: Blokk): string {
  return `${b.ceg}, ${b.irsz} ${b.varos}, ${b.utca}`;
}

/**
 * A "Határidő:" sor utáni sorokból a háromsoros (cég / irsz+város / utca)
 * blokkok. Csak addig olvasunk, amíg a szerkezet tart: az első olyan sor,
 * ami nem cégnév-sor, lezárja (a megjegyzés-sorok jönnek ott).
 */
function felLeBlokkok(sorok: string[]): Blokk[] {
  // A SpediTrans a régi kódlapról "õ"-vel írja az ő-t ("Határidõ", "Sofõr") —
  // mindhárom alakot elfogadjuk.
  const hataridoIdx = sorok.findIndex((s) => /^Határid[őõo]:\s*\tHatárid[őõo]:/.test(s));
  if (hataridoIdx === -1) return [];
  const blokkok: Blokk[] = [];
  for (let i = hataridoIdx + 1; i + 2 < sorok.length; i += 3) {
    const ceg = sorok[i].trim();
    const irszVaros = sorok[i + 1].trim().match(IRSZ_VAROS_SOR);
    const utca = sorok[i + 2].trim();
    if (!CEG_SOR.test(ceg) || !irszVaros || !utca || CEG_SOR.test(utca)) break;
    blokkok.push({ ceg, irsz: irszVaros[2], varos: irszVaros[3].trim(), utca });
  }
  return blokkok;
}

/**
 * A SpediTrans-irat determinisztikusan olvasható mezői. Üres objektum, ha
 * a szöveg nem ezt a szerkezetet követi — akkor minden a nyelvi modellé.
 */
export function kivonSpediTransMezoket(nyersSzoveg: string): Partial<KivontFuvar> {
  const sorok = nyersSzoveg.split(/\r?\n/);
  const eredmeny: Partial<KivontFuvar> = {};

  const blokkok = felLeBlokkok(sorok);
  if (blokkok.length === 2) {
    eredmeny.felrako = blokkCim(blokkok[0]);
    eredmeny.lerako = blokkCim(blokkok[1]);
  }

  const hataridoSor = sorok.find((s) => /-ig/.test(s) && [...s.matchAll(HATARIDO_SOR)].length === 2);
  if (hataridoSor) {
    const [fel, le] = [...hataridoSor.matchAll(HATARIDO_SOR)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    eredmeny.felrakasDatum = fel;
    eredmeny.lerakasDatum = le !== fel ? le : null;
  }

  const pozicio = nyersSzoveg.match(POZICIOSZAM);
  if (pozicio) eredmeny.pozicioszam = pozicio[1];

  for (const sor of sorok) {
    const dij = sor.match(FUVARDIJ_SOR);
    if (!dij) continue;
    const ertek = Number(dij[2].replace(/[\s.\u00a0]/g, "").replace(",", "."));
    if (Number.isFinite(ertek) && ertek > 0) {
      eredmeny.fuvardij = ertek;
      eredmeny.fuvardijPenznem = dij[1].toUpperCase() === "EUR" ? "EUR" : "Ft";
    }
    break;
  }

  const rendszamok = sorok.map((s) => s.trim()).filter((s) => RENDSZAM_SOR.test(s));
  if (rendszamok.length > 0) eredmeny.rendszamVagySofor = rendszamok.join(" ");

  return eredmeny;
}
