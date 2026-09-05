// IDEIGLENES adatfájl — a Gmail "Fuvarmegbízás" címkével ellátott levelek
// (406 levél / 189 szál) alapján végzett pontosítási kör eredménye. Csak az
// egyszeri javításhoz/kiegészítéshez kell (lásd fixKapcsolatok() a
// lib/fuvarozas/kapcsolatok.ts-ben) — utána mindkettő törölhető.
import type { AddKapcsolatInput } from "@/lib/fuvarozas/kapcsolatok-constants";

// Meglévő sorok javítása. A "match" azonosítja a sort (cég + kapcsolattartó,
// vagy ha az egyedi, csak cég), a "patch" a frissítendő mezőket adja meg.
export const KAPCSOLATOK_FIXES: {
  match: { ceg: string; kapcsolattarto?: string };
  patch: Partial<AddKapcsolatInput>;
}[] = [
  {
    // A "Hajdu János" név egy régebbi, feltehetően elavult/téves dokumentumból
    // származott. Két független, 2026 szeptemberi Gmail-szálban (mindkettő a
    // hajduspedicio@gmail.com fiókból) a küldő neve következetesen
    // "Zoltán Hajdu", az aláírás pedig "Zoli" — ez a "Zoltán" nevet erősíti
    // meg, nem a "János"-t. Az e-mail cím is javítva: a régi
    // hajduspedicio@t-online.hu helyett a ténylegesen aktív
    // hajduspedicio@gmail.com a helyes.
    match: { ceg: "Hajdúspedíció Kft.", kapcsolattarto: "Hajdu János" },
    patch: {
      kapcsolattarto: "Hajdu Zoltán",
      email: "hajduspedicio@gmail.com",
      megjegyzes:
        "Javítva Gmail alapján (2026.09.): a korábbi \"Hajdu János\" név és a hajduspedicio@t-online.hu cím elavult volt. A helyes cím hajduspedicio@gmail.com, a küldő neve minden ellenőrzött levélben \"Zoltán Hajdu\" (aláírás: \"Zoli\").",
    },
  },
  {
    // Korábban csak telefonszám volt rögzítve e-mail nélkül; a Gmail
    // aláírásban szerepel a cím.
    match: { ceg: "Pro Line Speed Kft.", kapcsolattarto: "Prostyák Tamás" },
    patch: { email: "prostyak1@gmail.com" },
  },
  {
    // A korábban rögzített "Németh Ákos" kapcsolatot a Gmail-ellenőrzés nem
    // találta aktív, aláírással megerősített küldőként az akos@abspeed.hu /
    // akos.nemeth@abspeed.hu címekről (csak cc-ben szerepelt) — ettől
    // függetlenül a Drive-dokumentumból származó adat megmarad, csak jelzéssel.
    match: { ceg: "ÁB Speed Szállítmányozási Kft.", kapcsolattarto: "Németh Ákos" },
    patch: {
      megjegyzes:
        "Gmail-ellenőrzéskor ez a kapcsolat nem volt igazolható aláírással ellátott küldőként (csak cc-ben szerepelt). Lásd emellett: Szabó Károly (transport@abspeed.hu) — ő a ténylegesen aláírt levelek küldője.",
    },
  },
  {
    // A Drive-dokumentumból (PDF) hiányzott az e-mail cím — a Gmailben
    // megtalált eredeti levél (a pontosan ugyanahhoz a megbízáshoz tartozó
    // "MGB 1754" szál) igazolta a feladó címét.
    match: { ceg: "Alpok-Trans Kft.", kapcsolattarto: "Borhi Szilárd" },
    patch: { email: "szilard@alpoktrans.hu" },
  },
  {
    // A Drive-dokumentumból hiányzott a telefonszám — a Gmail-aláírás
    // igazolta.
    match: { ceg: "Trans-Sped Kft.", kapcsolattarto: "Tálas Viktória" },
    patch: { telefon: "+36 20 246 3969" },
  },
];

// Új sorok — korábban nem szerepeltek a Kapcsolatok táblában.
export const KAPCSOLATOK_UJ: AddKapcsolatInput[] = [
  {
    ceg: "ÁB Speed Szállítmányozási Kft.",
    kapcsolattarto: "Szabó Károly",
    telefon: "+36 20 275 0191",
    email: "transport@abspeed.hu",
    megjegyzes:
      "Gmail alapján (2026.09.) ő a ténylegesen aláírással megerősített küldő a transport@abspeed.hu címről. Fontos: más személy, mint a Lorry GM Kft.-nél szereplő azonos nevű Szabó Károly.",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "RBT Europe Kft.",
    kapcsolattarto: "Rabi Klári",
    telefon: "+36 70 397 4377",
    email: "rbtfinance@rbteurope.com",
    megjegyzes: "Pénzügyi kapcsolattartó (a korábban rögzített Orsós Dorottya mellett).",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Well Pack Hungaria Kft.",
    kapcsolattarto: "Fonai Orsolya",
    telefon: "+36 20 574 6094",
    email: "orsolya.fonai@wellpack.hu",
    megjegyzes:
      "Gmail alapján ő a legtöbb levélben aláírással megerősített küldő (a korábban rögzített Sági Fanni csak cc-ben szerepelt, saját aláírás nélkül).",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Lorry GM Kft.",
    kapcsolattarto: "Szabó Károly",
    telefon: "+36 70 455 5205",
    email: "karoly.szabo@lorry.hu",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Lorry GM Kft.",
    kapcsolattarto: "Siklér-Czotter Kitti",
    telefon: "+36 70 455 5516",
    email: "raklapos@lorry.hu",
    megjegyzes: "Raklapos ügyintéző (kifejezetten raklapos ügyekhez).",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Bi-Ma Logisztika Kft.",
    kapcsolattarto: "Bihari Gábor",
    telefon: "+36 70 539 3197",
    email: "b.gabor@bi-ma.hu",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Mission Trans",
    // Nincs igazolt személynév — lásd megjegyzés.
    email: "kovacs.fanni@missiontrans.hu",
    megjegyzes:
      "Csak automata (InnoManagement portál) értesítő levél volt fellelhető, aláírás/telefonszám nélkül. A feladó neve a levélben \"kovacs.fanni\", de ez nem igazolt személynév.",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "ÁJ-TRANS Kft.",
    kapcsolattarto: "Dravucz Edina",
    telefon: "+36 70 88 47 079",
    email: "dravucz.edina@ajtrans.hu",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "CEMIX",
    kapcsolattarto: "Üregi Szabolcs",
    email: "szabolcs.uregi@cemix.hu",
    megjegyzes: "Közvetlen megrendelő (nem fuvarszervező partner). Telefonszám nem volt igazolható.",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "XPEDIT Logistics Kft.",
    kapcsolattarto: "Kristóf Szegedi",
    telefon: "+36 30 372 2220",
    email: "kristof.szegedi@xpeditlog.com",
    forras: "Gmail — label:Fuvarmegbízás",
  },
  {
    ceg: "Solinwest Agro Kft.",
    kapcsolattarto: "Őri Beatrix",
    telefon: "+36 70 421 6811 / +36 27 739 703",
    email: "ertekesites@solinwest.hu",
    forras: "Gmail — label:Fuvarmegbízás",
  },
];
