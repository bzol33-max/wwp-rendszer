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
// Ide KIZÁRÓLAG egysoros, szövegdarab-szintű, A CÉGRE JELLEMZŐ minta
// kerülhet (cégnév, e-mail-domain). Ezek mindegy, milyen PDF-kiolvasóval
// nézzük, egyformán megvannak. A MEGBÍZÁS-KÉSZÍTŐ SZOFTVER NEVE NEM
// UJJLENYOMAT: ugyanazt a programot több megbízó is használja (SpediTrans:
// BB-Logistic ÉS Alpok-Trans; InnoManagement, FuvarSys, SELEXPED…), és a
// szoftvernév alapján az egyik partner iratát a másik nevére vettük volna
// fel (2026-09-18). A szoftver a `kivon` olvasót választhatja, a partnert
// csak a cégnév/domain azonosítja. TÖBBSOROS vagy POZÍCIÓFÜGGŐ mintát
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
   * A partner megbízásán NINCS hivatkozási/pozíciószám (pl. Hajdúspedíció:
   * kézzel írt Word-irat). Az ilyen sor a "nincs ilyen" jelölést kapja
   * (pozicioszam_nincs), és a hiányzó szám nem kifogás.
   */
  nincsHivatkozas?: boolean;
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
    // Csak a cégnév: a SpediTrans szoftvert az Alpok-Trans is használja.
    ujjlenyomat: [/BB-Logistic/i],
    // Egyoldalas irat, a fuvardíj és a postacím a szerződéses mondatok
    // UTÁN áll a kiolvasásban — nincs mit levágni.
    torzsVege: [],
    hivatkozasNeve: "Pozíciószám",
    // A kéthasábos felrakó/lerakó táblát a nyelvi modell fordítva olvasta
    // (2026-09-17) — a két blokkot oldalkoordinátából, a határidőket, a
    // pozíciószámot, a fuvardíjat és a rendszámokat reguláris kifejezés adja.
    kivon: kivonSpediTransMezoket,
  },
  {
    kod: "alpok-trans",
    nev: "Alpok-Trans Kft.",
    // Ugyanaz a SpediTrans-sablon, mint a BB-Logisticé (MGB/26/001754,
    // 2026-08-18) — a koordinátás olvasó itt is érvényes.
    ujjlenyomat: [/Alpok-?Trans\s+Kft/i, /alpoktrans/i],
    torzsVege: [],
    postazasiCim: "9730 Kőszeg, Kelcz-Adelffy utca 13. 1/3.",
    fizetesiHataridoNap: 30,
    hivatkozasNeve: "Pozíciószám",
    kivon: kivonSpediTransMezoket,
  },
  {
    kod: "ghibli",
    nev: "Ghibli Szállítmányozási Kft.",
    // A nyelvi modell a felrakóhely zárójeles cégét (Apollo Tyres) írta
    // megrendelőnek (N26/22795, N26/22824, 2026-09-17).
    ujjlenyomat: [/ghibli\.hu/i, /Ghibli\s+Sz[áa]ll[íi]tm[áa]nyoz[áa]si/i, /NK_FUVMEGREND/],
    torzsVege: [/Sz[áa]ml[áa]z[áa]s menete, fuvarokm[áa]nyok megk[üu]ld[ée]se/i],
    // Az iratuk szerint az eredeti fuvarokmányoknak postai úton kell a
    // Ghibli Kft.-hez érkezniük.
    postazasiCim: "1211 Budapest, Petróleum u. 2.",
    // "A számla beérkezését követő 45. naptári nap utáni kedd."
    fizetesiHataridoNap: 45,
    hivatkozasNeve: "Pozíciószámunk",
  },
  {
    kod: "hajduspedicio",
    nev: "Hajdúspedíció Kft.",
    ujjlenyomat: [/hajduspedicio@t-online\.hu/i, /HAJD[ÚU]SPED[ÍI]CI[ÓO]/i],
    torzsVege: [/Megb[íi]z[áa]sunk visszaigazol[áa]s n[ée]lk[üu]l is [ée]rv[ée]nyes/i],
    postazasiCim: "3360 Heves, Táncsics M. út 4.",
    fizetesiHataridoNap: 30,
    // Kézzel írt Word-megbízás, pozíciószám nélkül.
    nincsHivatkozas: true,
  },
  {
    kod: "hrt-spedition",
    nev: "HRT Spedition Kft.",
    ujjlenyomat: [/hrtsped\.hu/i, /HRT\s+Spedition/i],
    torzsVege: [/A HRT el[őo]zetes [íi]r[áa]sbeli enged[ée]lye n[ée]lk[üu]l/i],
    postazasiCim: "1037 Budapest, Bécsi út 224.",
    // "45 napon belül, átutalással" — banki napokkal, a számla kézhezvételétől.
    fizetesiHataridoNap: 45,
    hivatkozasNeve: "Pozíciószám",
  },
  {
    kod: "sg-transport",
    nev: "SG Transport Kft.",
    ujjlenyomat: [/sgtransportkft@gmail\.com/i, /SG\s+Transport\s+Kft/i],
    torzsVege: [/Egy[ée]b felt[ée]telek/],
    // Az iratukon kifejezetten szerepel: "Postázási cím".
    postazasiCim: "4220 Hajdúböszörmény, Kálmán Ferenc utca 18/B",
    fizetesiHataridoNap: 45,
    hivatkozasNeve: "SG Tr. Kft hivatkozási szám",
  },
  {
    kod: "pro-line-speed",
    nev: "Pro Line Speed Kft.",
    ujjlenyomat: [/PRO\s*LINE\s*SPEED/i],
    torzsVege: [/[ÁA]ltal[áa]nos szerz[őo]d[ée]si felt[ée]telek/i],
    postazasiCim: "4030 Debrecen, Árnyas u. 10.",
    fizetesiHataridoNap: 30,
    // Egyoldalas, kézzel írt megbízás, hivatkozási szám nélkül.
    nincsHivatkozas: true,
  },
  {
    kod: "kk-spedit",
    nev: "K+K Spedit Kft.",
    ujjlenyomat: [/kkspedit\.hu/i, /K\s*\+\s*K\s+Spedit/i],
    torzsVege: [/K[ée]rj[üu]k a sz[áa]mla mell[ée]klet[ée]k[ée]nt csatolni/i],
    postazasiCim: "4400 Nyíregyháza, Búza tér 10.",
    // "45 napon belül átutalással" — banki napokkal, a számla kézhezvételétől.
    fizetesiHataridoNap: 45,
    hivatkozasNeve: "Pozició",
  },
  {
    kod: "well-pack",
    nev: "Well Pack Hungária Kft.",
    // FIGYELEM: nem a saját cégünk (Well-Worn Pallet) — a sajatCegunkE
    // mintája erre nem illeszkedik, de a neve hasonló, ne keverd.
    ujjlenyomat: [/wellpack\.hu/i, /WELL\s*PACK\s+HUNGARIA/i],
    torzsVege: [],
    // Az iratukon kifejezetten szerepel: "Postázási cím".
    postazasiCim: "2051 Biatorbágy, Rozália Park 11.",
    // "60 nap a leigazolt CMR beérkezési napjától számítva".
    fizetesiHataridoNap: 60,
    hivatkozasNeve: "Pozició szám",
  },
  {
    kod: "voxov",
    nev: "VOXOV Logistics Kft.",
    ujjlenyomat: [/VOXOV\s+Logistics/i],
    torzsVege: [/Szerz[őo]d[ée]ses felt[ée]telek/],
    // "Kérjük az eredeti okmányokat a számlával együtt a 1601. Budapest Pf. 131-re postázni!"
    postazasiCim: "1601 Budapest, Pf. 131.",
    fizetesiHataridoNap: 60,
    hivatkozasNeve: "Rendelési szám",
  },
] as const;

/**
 * Megkeresi, melyik ismert partner sablonjából származik a dokumentum.
 * Több illeszkedés esetén a TÖBB ujjlenyomattal illeszkedő nyer — így egy
 * futólagos névemlítés (pl. egy másik fuvarozó neve a szerződéses részben)
 * nem üti ki az irat valódi kibocsátóját. DÖNTETLENNÉL (két partner
 * ugyanannyi ujjlenyomattal) nem tippelünk: null, és a megrendelő a nyelvi
 * modellé marad, "nem ismert partner-sablon" kifogással — egy rossz
 * megrendelő drágább, mint egy ellenőrizendő sor.
 */
export function felismerPartner(szoveg: string): Partner | null {
  let legjobb: Partner | null = null;
  let legjobbPont = 0;
  let dontetlen = false;
  for (const partner of PARTNEREK) {
    const pont = partner.ujjlenyomat.filter((minta) => minta.test(szoveg)).length;
    if (pont > legjobbPont) {
      legjobb = partner;
      legjobbPont = pont;
      dontetlen = false;
    } else if (pont > 0 && pont === legjobbPont) {
      dontetlen = true;
    }
  }
  return dontetlen ? null : legjobb;
}

export function partnerKodSzerint(kod: string | null | undefined): Partner | null {
  if (!kod) return null;
  return PARTNEREK.find((p) => p.kod === kod) ?? null;
}
