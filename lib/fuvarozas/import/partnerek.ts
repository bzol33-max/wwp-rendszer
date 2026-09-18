// A visszatérő megbízóink dokumentum-sablonjai.
//
// MIÉRT VAN EZ A FÁJL: a Drive-mappa 55 iratából 44 hat partner gépi
// sablonjából származik, és MINDHÁROM visszatérő hiba ezekből fakadt:
//
//  1. HASÁBOS FEJLÉC. Minden sablon egymás mellé teszi a megbízó és a
//     megbízott adatait ("Megbízó adatai: Megbízott adatai:"), amit a
//     PDF-kiolvasás egy sorba present. A nyelvi modell ebből rendszeresen
//     MINKET olvasott megrendelőnek. A Flott-Trans iratán a mi nevünk alatt
//     rögtön az Ő adószámuk áll — ott még egy ember is elsőre elvéti.
//     -> Ha az `ujjlenyomat` illeszkedik, a megrendelő NEM TALÁLGATÁS
//        kérdése többé: a `nev` mezőt írjuk be, kész.
//
//  2. CSALI PÉNZÖSSZEGEK. Egy megbízás 1 oldal adat + 3-8 oldal szerződéses
//     szöveg, tele összegekkel: kötbér 100/300/400/500 EUR, állásdíj
//     210 EUR/nap, 10.000 Ft/óra, raklap 7.000 Ft/db, kártérítés
//     50 000 EUR. A valódi fuvardíj (pl. 180 000 HUF) egyetlen sor ebben.
//     -> A `torzsVege` első illeszkedésénél levágjuk a kisbetűs részt.
//
//  3. RENDSZÁM-ELÍRÁS. A partnerek törzsadatában a mi rendszámaink
//     következetesen hibásak (Duvenbeck: NZM492, RBT: AODU427).
//     -> lib/fuvarozas/vehicles.ts `irasvaltozatok`.
//
// AZ UJJLENYOMATOKRÓL — EZT A SZABÁLYT NE SZEGD MEG:
// Ide KIZÁRÓLAG egysoros, szövegdarab-szintű minta kerülhet (cégnév,
// e-mail-domain, szoftver neve). Ezek mindegy, milyen PDF-kiolvasóval
// nézzük, egyformán megvannak. TÖBBSOROS vagy POZÍCIÓFÜGGŐ mintát
// (pl. "a város a cím alatti második sorban") ide írni TILOS: az a
// kiolvasó elrendezésétől függ, és pontosan ezen bukott meg egy korábbi
// nekifutás — a minták a Drive saját szöveg-megjelenítéséhez készültek,
// élesben viszont a pdf-parse fut, más sortöréssel, így a feldolgozó
// minden iratra csendben nemet mondott. Elrendezésfüggő mintát csak
// VALÓDI, éles pdf-parse kimenetre szabad írni — lásd
// scripts/teszt-minta/.
//
// NEM "use server" fájl — sima adatmodul, tesztből is hívható.

import type { KivontFuvar } from "./ellenorzes";

import type { SzovegElem } from "./pdf-elemek";
import { kivonSpediTransMezoket } from "./speditrans";

export type Partner = {
  /** Belső azonosító (napló, mintafájlok neve). */
  kod: string;
  /** A megrendelő HIVATALOS neve — ez kerül a fuvar `megrendelo` mezőjébe. */
  nev: string;
  /** Egysoros szövegdarabok; bármelyik illeszkedése azonosítja a partnert. */
  ujjlenyomat: readonly RegExp[];
  /** A szerződéses kisbetűs rész kezdete — innentől a szöveg eldobható. */
  torzsVege: readonly RegExp[];
  /**
   * Az eredeti papírok postázási címe, ahogy a megbízásaikon szerepel.
   * CSAK TARTALÉK: ha a dokumentumból sikerült címet kiolvasni, az nyer.
   */
  postazasiCim?: string;
  /** Szokásos fizetési határidő napokban — szintén csak tartalék. */
  fizetesiHataridoNap?: number;
  /** Hogyan hívja a partner a saját hivatkozási számát (ember számára). */
  hivatkozasNeve?: string;
  /**
   * A partner sablonjából determinisztikusan kiolvasható mezők a pdf-parse
   * NYERS szövegéből és (PDF-nél) a pdfjs koordinátás szövegelemeiből
   * (pdf-elemek.ts; docx/Docs esetén null). Ami itt nem null, az felülírja
   * a nyelvi modell tippjét; ami hiányzik, az a modellé marad. Csak VALÓDI
   * pdf-parse/pdfjs kimenetre írt olvasó kerülhet ide (lásd fent).
   */
  kivon?: (nyersSzoveg: string, elemek: SzovegElem[] | null) => Partial<KivontFuvar>;
};

export const PARTNEREK: readonly Partner[] = [
  {
    kod: "duvenbeck",
    nev: "Duvenbeck Logisztikai Kft.",
    ujjlenyomat: [/duvenbeck/i],
    // A Duvenbeck iratait determinisztikus olvasó dolgozza fel
    // (lib/fuvarozas/duvenbeck.ts), ott nincs mit levágni.
    torzsVege: [],
    hivatkozasNeve: "Út ID (Reise ID)",
  },
  {
    kod: "ab-speed",
    nev: "ÁB Speed Szállítmányozási Kft.",
    // FIGYELEM: ékezetes kezdőbetű elé NE tegyél \b-t! A JavaScript \b csak
    // ASCII szóhatárt ismer, így a /\bÁB/ minta a szöveg elején álló "ÁB"-re
    // sem illeszkedik — ez a hiba élesben a legnagyobb, 15 fájlos partnert
    // tette volna felismerhetetlenné, némán.
    ujjlenyomat: [/abspeed\.hu/i, /[ÁA]B\s*Speed/i],
    torzsVege: [/Lerakod[áa]st\s+k[öo]vet[őo]en/i],
    // Az iratukon kifejezetten szerepel: "Új postázási címűnk".
    postazasiCim: "9662 Tompaládony, Ifjúság u. 20.",
    fizetesiHataridoNap: 60,
    hivatkozasNeve: "Pozíciószám",
  },
  {
    kod: "happ",
    nev: "HAPP Kft.",
    ujjlenyomat: [/@happ\.eu/i, /\bHAPP\s*kft\b/i, /Transorg Software/i],
    torzsVege: [/Mely tartalmazza a fuvaroz[áa]s sor[áa]n felmer[üu]l[őo]/i],
    postazasiCim: "8441 Márkó, Iparos utca 10.",
    fizetesiHataridoNap: 60,
    hivatkozasNeve: "Jelünk / Pozíció",
  },
  {
    kod: "rbt-europe",
    nev: "RBT EUROPE Kft.",
    ujjlenyomat: [/rbteurope\.com/i, /\bRBT\s*EUROPE\b/i, /SpedINFORM/i],
    torzsVege: [/Fel-\s*[ée]s\s+lerak[áa]s\s+ut[áa]n\s+1\s+[óo]r[áa]n\s+bel[üu]l/i],
    fizetesiHataridoNap: 30,
    hivatkozasNeve: "Poz.számunk",
  },
  {
    kod: "trans-sped",
    nev: "Trans-Sped Kft.",
    ujjlenyomat: [/@trans-sped\.hu/i, /\bTrans-Sped\b/i, /InnoManagement/i],
    torzsVege: [
      /Felt[ée]telek az alv[áa]llalkoz[óo] fel[ée]/i,
      /BELF[ÖO]LDI FUVAROZ[ÁA]SI MEGB[ÍI]Z[ÁA]S/,
    ],
    postazasiCim: "4001 Debrecen, Pf. 219.",
    // Az iratuk szerint a lerakástól számított 30 nap, ha a számlát 15
    // napon belül benyújtjuk.
    fizetesiHataridoNap: 30,
    hivatkozasNeve: "Fuvarfeladat száma",
  },
  {
    kod: "flott-trans",
    nev: "Flott-Trans Kft.",
    ujjlenyomat: [/flott\.hu/i, /\bFlott-Trans\b/i],
    torzsVege: [/Kiszolg[áa]ltat[áa]si akad[áa]lyokr[óo]l/i],
    postazasiCim: "3300 Eger, Kistályai út 12.",
    fizetesiHataridoNap: 30,
    hivatkozasNeve: "Hivatkozási szám",
  },
  {
    kod: "bb-logistic",
    nev: "BB-Logistic Solution Kft.",
    ujjlenyomat: [/BB-Logistic/i, /speditrans\.hu/i, /SpediTrans for Windows/i],
    // Egyoldalas irat, a fuvardíj és a postacím a szerződéses mondatok
    // UTÁN áll a kiolvasásban — nincs mit levágni.
    torzsVege: [],
    hivatkozasNeve: "Pozíciószám",
    // A kéthasábos felrakó/lerakó táblát a nyelvi modell fordítva olvasta
    // (2026-09-17) — a két blokkot oldalkoordinátából, a határidőket, a
    // pozíciószámot, a fuvardíjat és a rendszámokat reguláris kifejezés adja.
    kivon: kivonSpediTransMezoket,
  },
] as const;

/**
 * Megkeresi, melyik ismert partner sablonjából származik a dokumentum.
 * Több illeszkedés esetén a TÖBB ujjlenyomattal illeszkedő nyer — így egy
 * futólagos névemlítés (pl. egy másik fuvarozó neve a szerződéses részben)
 * nem üti ki az irat valódi kibocsátóját.
 */
export function felismerPartner(szoveg: string): Partner | null {
  let legjobb: Partner | null = null;
  let legjobbPont = 0;
  for (const partner of PARTNEREK) {
    const pont = partner.ujjlenyomat.filter((minta) => minta.test(szoveg)).length;
    if (pont > legjobbPont) {
      legjobb = partner;
      legjobbPont = pont;
    }
  }
  return legjobb;
}

export function partnerKodSzerint(kod: string | null | undefined): Partner | null {
  if (!kod) return null;
  return PARTNEREK.find((p) => p.kod === kod) ?? null;
}
