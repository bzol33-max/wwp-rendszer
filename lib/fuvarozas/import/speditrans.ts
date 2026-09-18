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
// CSAKHOGY EZ A SORREND HAMIS. A pdfjs oldalkoordinátái szerint (lásd
// pdf-elemek.ts) a "Felrakás helye:" címke és alatta a Bestpallet-blokk a
// BAL hasábban áll (x≈25), a "Lerakás helye" és a DS Smith-blokk a JOBB
// hasábban (x≈301), ugyanazokon a sorokon. A pdf-parse a jobb hasáb blokkját
// írta előbbre, ezért a felrakó és a lerakó a szövegből olvasva fordítva
// jött (a nyelvi modelltől is, egy szövegsorrendre épülő olvasótól is —
// 2026-09-18, a valóság: Nyíradonyban rakodnak fel, Füzesabonyban le).
// Ezért a felrakót és a lerakót KIZÁRÓLAG koordinátából olvassuk: ami a
// "Felrakás helye:" alatt, a bal hasáb x-énél áll, az a felrakó. Koordináta
// nélkül (docx, Docs) ezt a két mezőt nem tippeljük — marad a modellé.
//
// A határidők egy sorban állnak, balról jobbra (felrakás, lerakás):
//
//   2026.09.21. 11:00 \t2026.09.21. 14:00\t-ig \t-ig
//
// Ami itt megvan, az felülírja a nyelvi modell tippjét (drive-sync-core.ts);
// ami nincs (áru, megjegyzés, postázási cím), az marad a modelltől.
//
// Minták: scripts/teszt-minta/speditrans-megbizas.txt (a pdf-parse
// tényleges tördelése, tabulátorokkal) és speditrans-megbizas.json (a pdfjs
// szövegelemei koordinátával) — kitalált nevekkel, lásd partnerek.ts fejléce.
//
// NEM "use server" fájl — sima adatmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";
import type { SzovegElem } from "./pdf-elemek";

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

/** Egy hasáb sorai (felülről lefelé) egyetlen címmé: "Cég, IRSZ Város, utca" — a "HU-" országkód-előtag nélkül, ahogy a varos.ts városnév-kinyerése biztosan olvassa. */
function hasabCim(sorok: string[]): string {
  return sorok.map((sor) => sor.replace(/^[A-Z]{2}-(\d{4})\s+/, "$1 ")).join(", ");
}

/**
 * A felrakó és a lerakó a koordinátákból: a "Felrakás helye:" és a
 * "Lerakás helye" címke közti x-határ dönti el a hasábot, a címke sora és
 * a "Rakomány megjegyzés:" sora közti y-sáv a blokkot; a "Határidő:" sort
 * kihagyjuk. Mindkét hasábban legalább két sor és egy irányítószámos sor
 * kell — különben nem ez a sablon, nem tippelünk.
 */
function felLeKoordinatabol(elemek: SzovegElem[]): { felrako: string; lerako: string } | null {
  const fejFel = elemek.find((e) => /^Felrak[áa]s helye/.test(e.str));
  const fejLe = elemek.find((e) => /^Lerak[áa]s helye/.test(e.str) && e.oldal === fejFel?.oldal);
  if (!fejFel || !fejLe || fejLe.x <= fejFel.x) return null;
  const oldal = elemek.filter((e) => e.oldal === fejFel.oldal);
  const also = oldal
    .filter((e) => e.y < fejFel.y && /^(Rakom[áa]ny megjegyz[ée]s|Egy[ée]b):/.test(e.str))
    .reduce<number>((max, e) => Math.max(max, e.y), -Infinity);
  if (also === -Infinity) return null;
  const hataridoSorok = new Set(oldal.filter((e) => e.y < fejFel.y && /^Határid[őõo]:/.test(e.str)).map((e) => e.y));
  const blokk = oldal.filter(
    (e) => e.y < fejFel.y && e.y > also && ![...hataridoSorok].some((hy) => Math.abs(hy - e.y) <= 3)
  );
  const xHatar = (fejFel.x + fejLe.x) / 2;
  const hasab = (bal: boolean) =>
    blokk
      .filter((e) => (e.x < xHatar) === bal)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((e) => e.str.trim());
  const fel = hasab(true);
  const le = hasab(false);
  const ervenyes = (sorok: string[]) => sorok.length >= 2 && sorok.some((sor) => IRSZ_VAROS_SOR.test(sor));
  if (!ervenyes(fel) || !ervenyes(le)) return null;
  return { felrako: hasabCim(fel), lerako: hasabCim(le) };
}

/**
 * A SpediTrans-irat determinisztikusan olvasható mezői. `elemek`: a pdfjs
 * szövegelemei koordinátával (pdf-elemek.ts), PDF-nél; null, ha nincs
 * (docx, Docs) — akkor a felrakó/lerakó a modellé marad. Üres objektum, ha
 * a szöveg nem ezt a szerkezetet követi.
 */
export function kivonSpediTransMezoket(nyersSzoveg: string, elemek: SzovegElem[] | null): Partial<KivontFuvar> {
  const sorok = nyersSzoveg.split(/\r?\n/);
  const eredmeny: Partial<KivontFuvar> = {};

  const felLe = elemek ? felLeKoordinatabol(elemek) : null;
  if (felLe) {
    eredmeny.felrako = felLe.felrako;
    eredmeny.lerako = felLe.lerako;
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
