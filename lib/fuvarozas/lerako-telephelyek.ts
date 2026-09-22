// Visszatérő VEVŐINK valódi telephely-címei.
//
// (Nem tévesztendő össze a lib/fuvarozas/telephelyek.ts-szel: az a MI saját
// telephelyeink és parkolóink listája a GPS-oldalhoz. Ez itt az, ahová
// megyünk.)
//
// MIÉRT VAN EZ A FÁJL: a saját (raklap-eladási) fuvarok lerakó mezőjébe
// évek óta csak a városnév kerül — a sofőrök fejből tudják, hová mennek.
// A rendszernek viszont nem elég: a `cimPontossaga` (lib/fuvarozas/varos.ts)
// az ilyet `csak_varos`-nak minősíti, a GPS-érintés-felismerés pedig
// városközépre geokódol, több kilométeres tűréssel — azaz a megállás vagy
// nem ismerhető fel, vagy bármelyik városi megállás találatnak látszik.
// Kétszer mértük élesben: a Tata és a Tompaládony pontos címének beírása
// után a felismerés `~csak_varos` → `geo ✓`-ra váltott, a tűrés 4 km-ről
// 2 km-re esett (2026-09-22).
//
// HONNAN AZ ADAT: 200 Számlázz.hu-szállítólevél (2025.11.04 – 2026.09.23)
// MEGJEGYZÉS-rovatából, Budaházi Zoltán megerősítésével. A szállítólevélen
// szereplő VEVŐ-cím ehhez NEM használható: az a cégjegyzékbeli SZÉKHELY.
// A Solinwest székhelye Csomád (Pest vármegye), a raklap viszont Záhonyba
// és Tuzsérra megy — 300 km-rel odébb.
//
// KÉT VEVŐNÉL NINCS FIX CÍM, ezért NEM szerepelnek a szótárban:
//   - KETER Hungary (55 szállítólevél): a raklap rendszerint a KETER saját
//     vevőihez megy (Dunapack Nyíregyháza, Ehisz Eger, DS Smith Füzesabony
//     és Nagykáta). Csak ha a megjegyzésben NINCS partner, akkor a saját
//     ebesi gyár — ezért Ebes benne van, a többi nem.
//   - "MEGA-FRUIT" (12 szállítólevél): mind a 12 tanyára ment (Molnár
//     Sándor Ujhelyi-tanya, Oláh János telepe Balkány, Almáskamarás).
//     Itt a címnek a megbízáson kell szerepelnie, szótárból nem pótolható.
//
// A VÁROSNÉV-KULCS CSAK SAJÁT FUVARRA ÉRVÉNYES. Bér fuvarban ugyanaz a
// város másik céghez tartozik — a scripts/teszt-erintes.mts-ben szereplő
// "Bestpallet Kft. HU-4254 Nyíradony Patak utca 1" épp egy olyan nyíradonyi
// cím, ami NEM a Pauliké. Aki ezt a szótárt bekapcsolja valahová, a saját
// fuvarra szűrést NE hagyja el — és a SAJAT_FUVAR_DB_TIPUS konstanst
// használja, ne írjon oda kézzel 'sajat'-ot.
//
// AZ ELSŐ NEKIFUTÁS PONT EZEN BUKOTT EL (2026-09-22): a `tipus = 'sajat'`
// szűrés kézenfekvőnek látszott, de a `fuvar_megbizasok.tipus` elnevezése
// történelmi okokból FORDÍTOTT a felülethez képest — `tipus='ber'` a
// "Saját fuvarok" fül, `tipus='sajat'` a "Bér fuvarok" fül (lásd
// lib/fuvarozas/megbizasok.ts getMaiValodiSajatFuvarok). Az első javítás
// így a BÉR fuvarokon futott, azaz pont a rossz halmazon.
//
// AMI NINCS A SZÓTÁRBAN, DE A SZÁLLÍTÓLEVELEKEN OTT VAN: idegen rendszámok
// (STH-666 14 bizonylaton, SNN-753/WGF-708, SNN-753/WEN-579,
// ROD-985/WDY-633, RXF-098, WDY-632). Ezek NEM a mi kocsijaink és nem is
// alvállalkozók: a vevő küldött kocsit az áruért (Budaházi Zoltán,
// 2026-09-22). Ilyenkor nincs fuvarunk — se megbízás, se GPS, se megálló.
// A `SAJAT_JARMUVEK` listába tehát nem valók, és ha valaha szállítólevelet
// párosítunk fuvarhoz, ezekből NEM szabad fuvart csinálni. (Egy elgépelés
// is van köztük: NMZ-497 a TREBOR SAMAT levelén, az Micó NMZ-492-je.)
//
// ZÁHONY SZÁNDÉKOSAN HIÁNYZIK, és nem is kell pótolni: a Solinwest ottani
// telepének utcája sehonnan nem jött elő, de a sofőr a helyszínen az
// „Itt vagyok" gombbal rögzíti a kocsi koordinátáját a címhez
// (rogzitMegalloHelyet, lib/fuvarozas/sofor.ts) — a csupasz városnév ettől
// ugyanolyan jól felismerhetővé válik, mint egy pontos cím.
//
// NEM "use server" fájl — sima adatmodul, tesztből is hívható.

export type LerakoTelephely = {
  /** A városnév pontosan úgy, ahogy a megbízás lerakó mezőjébe kerül. */
  varos: string;
  /** A teljes, geokódolható cím — ez váltja ki a csupasz városnevet. */
  cim: string;
  /** Kinek a telepe — ember számára, a felülvizsgálathoz. */
  ceg: string;
  /** Honnan tudjuk, hogy ez a jó cím. */
  forras: string;
};

/**
 * Azok a helyek, ahol a csupasz városnév EGYÉRTELMŰEN egy telephelyet
 * jelent. Ami kétes, az szándékosan kimaradt — lásd a lenti
 * KETSEGES_CIMEK listát; oda inkább semmit nem írunk, mint rossz címet.
 */
export const LERAKO_TELEPHELYEK: readonly LerakoTelephely[] = [
  {
    varos: "Tompaládony",
    cim: "9662 Tompaládony, 0117/8 hrsz.",
    ceg: "FABRIKA + 2000 Kft. (az ÁB Speed ugyanezen a telephelyen van)",
    forras: "71 szállítólevél + Budaházi Zoltán megerősítése (2026-09-22)",
  },
  {
    varos: "Ebes",
    cim: "4211 Ebes, Zsong-völgy 2.",
    ceg: "KETER Hungary Kft. gyára",
    forras: "55 szállítólevél; csak ha a megjegyzésben nincs másik partner",
  },
  {
    varos: "Ózd",
    cim: "3600 Ózd, Kovács Hagyó Gyula út 7.",
    ceg: "VASBÁR-KER Kft.",
    forras: "10 szállítólevél megjegyzése (5× a 7., 5× a 27.); a 7. a jó — Budaházi Zoltán, 2026-09-22",
  },
  {
    varos: "Tuzsér",
    cim: "4623 Tuzsér, Kálongatanya 0115/29 hrsz.",
    ceg: "SOLINWEST (só-üzem)",
    forras: "5 szállítólevél megjegyzése + nyilvános cégadat",
  },
  {
    varos: "Nyíradony",
    cim: "4254 Nyíradony, Állomás utca 11.",
    ceg: "PAULIK Kft. telepe (a Nyíregyháza, Búza tér 9. csak a székhely)",
    forras: "Budaházi Zoltán, 2026-09-22",
  },
  {
    varos: "Nyírgelse",
    cim: "4362 Nyírgelse, Debreceni u. 1.",
    ceg: "PAULIK Kft. másik telepe",
    forras: "2 szállítólevél megjegyzése + Budaházi Zoltán, 2026-09-22",
  },
] as const;

/**
 * Ismert címek, amiket SZÁNDÉKOSAN nem teszünk a városnév-szótárba, mert a
 * városnév nem azonosítja őket egyértelműen. Itt vannak följegyezve, hogy
 * egy megbízás rögzítésekor legyen honnan kimásolni — és hogy senki ne
 * "pótolja" őket jóhiszeműen a fenti listába.
 */
export const KETSEGES_CIMEK: readonly { hely: string; ok: string }[] = [
  { hely: "Dunapack, 4400 Nyíregyháza, Tünde út 2.", ok: "Nyíregyházán a PAULIK székhelye és a COLOR PACK is ott van" },
  { hely: "Ehisz Zrt., 3300 Eger, Meder u. 29.", ok: "Eger nagyváros, két szállítólevélből nem általánosítható" },
  { hely: "DS Smith, 3390 Füzesabony, Patak u. 1.", ok: "Füzesabonyba bér fuvar is megy (Pikopack, Kerecsendi út 123.)" },
  { hely: "DS Smith, 2760 Nagykáta, Perczel Mór út 134.", ok: "egyetlen szállítólevél" },
  { hely: "Tommy-Invest, 3170 Szécsény, Varsányi út 4.", ok: "a LECO GmbH megbízásából, nem visszatérő" },
  { hely: "Pál-Ferr-Box Kft., 2800 Tatabánya, Zója utca 12.", ok: '"MEGA-FRUIT" is Tatabányán van (Réti utca 82.)' },
  { hely: "Oláh János telepe, 4233 Balkány, Balogh tanya 2.", ok: "Balkányban a PERPUSZ is vevő, és SAJÁT telephelyünk is van" },
  { hely: "Christeyns, Bököny, Kossuth utca 158.", ok: "irányítószám nélkül jegyezték föl" },
  { hely: "SOLINWEST, Záhony", ok: "a pontos utca se a szállítóleveleken, se a neten nincs meg" },
];

/**
 * A `fuvar_megbizasok.tipus` értéke, ami a felületen "Saját fuvar" — azaz a
 * saját raklapunkat visszük. Igen, 'ber': az oszlop elnevezése fordított,
 * lásd a fájl fejlécét. Ez a konstans azért van, hogy ne kelljen fejben
 * tartani.
 */
export const SAJAT_FUVAR_DB_TIPUS = "ber";

/** A városnévhez tartozó teljes cím, ha a város egyértelműen egy telephelyet jelent. */
export function lerakoTelephelyCime(varos: string | null | undefined): string | null {
  const t = varos?.trim().toLowerCase();
  if (!t) return null;
  return LERAKO_TELEPHELYEK.find((h) => h.varos.toLowerCase() === t)?.cim ?? null;
}
