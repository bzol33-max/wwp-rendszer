// A Duvenbeck-megbízások determinisztikus (nem LLM-es) értelmezője.
//
// MIÉRT KÜLÖN MODUL EZ AZ EGY PARTNER?
//
// A Duvenbeck gépi úton, mindig ugyanabból a sablonból állítja elő a
// dokumentumait, és EGY fuvarhoz KETTŐT küld egyszerre:
//
//   TA<szám>_V<n>.pdf     — Fuvar Megbízás: ár, számlázási utasítás,
//                           azonosítók, rendszám, időablakok
//   FRALI<szám>_V<n>.pdf  — Rakománylista: ugyanaz a fuvar, de TISZTA
//                           címekkel, súllyal, referenciaszámokkal
//
// A kettő nem duplikátum, hanem kiegészíti egymást: az árat csak a megbízás
// tartalmazza, a géppel olvasható címet viszont csak a rakománylista. A
// megbízás hasábos elrendezését ugyanis a PDF-szövegkiolvasás összekeveri —
// a város három sorral a utcanév alá, súly- és dátumsorok közé kerül:
//
//   FIEGE Szállítmányozási / Campona utca . 1 / 9007KG /
//   PV: 14.09.2026 13:00 Loading / 1225 Budapest / ...
//
// Emiatt az általános, LLM-es kivonatolás felrakóként a puszta "Campona
// utca . 1"-et adta vissza, város nélkül. A rakománylistában ugyanez egyetlen
// sor: "FIEGE Szállítmányozási Campona utca . 1 HU 1225 Budapest".
//
// Mivel a sablon gépi és stabil, itt nem kell (és nem is szabad) nyelvi
// modellt használni: a reguláris kifejezés pontos, ingyenes és tesztelhető.
//
// AZONOSSÁG: az Út ID (németül Reise ID, angolul Trip ID) mindkét
// dokumentumban szerepel, és egyetlen fuvart azonosít. Ez köti össze a párt,
// és ez az a szám, amit a Duvenbeck a számlán lát: maga a megbízás írja elő,
// hogy "Szamlakat kerjük Reise ID-k szerint megosztva kiallitani es
// elküldeni". Ezért lesz ez a fuvar pozíciószáma is.

/** Egy megálló a túra ütemtervéből. */
export type DuvenbeckMegallo = {
  szerep: "felrako" | "lerako";
  /** Teljes, geokódolható cím — "Cégnév, Utca házszám, irsz Város". */
  cim: string;
  /** Az időablak kezdete (PV: Felrako/kirako datum -tol), ISO dátum + óra. */
  ablakTol: { datum: string; ido: string } | null;
  /** Az időablak vége (PB: ... -ig). */
  ablakIg: { datum: string; ido: string } | null;
};

export type DuvenbeckDok = {
  /** Melyik a kettő közül — ez dönti el, melyik mezőjében bízunk. */
  tipus: "megbizas" | "rakomanylista";
  /** Fuvar Megbízás ID a "/" előtti része (pl. "1980534") — a pár közös száma. */
  megbizasId: string;
  /** A dokumentum verziószáma a "/" után, ill. a fájlnév "_V" utótagjából. */
  verzio: number | null;
  /** Rakománylista ID, csak a rakománylistán. */
  rakomanylistaId: string | null;
  /** Út ID / Reise ID / Trip ID — a fuvar azonossága és a számlázási kulcs. */
  reiseId: string | null;
  /** Túra ID — csak a megbízáson, tájékoztató. */
  turaId: string | null;
  /** A dokumentumban talált, rendszámnak látszó szövegek, előfordulási sorrendben. */
  rendszamJeloltek: string[];
  /** Fuvardíj (a "Teljes osszeg / Total" sor, ha van, egyébként a "Fuvardij" sor). */
  fuvardij: number | null;
  penznem: "EUR" | "Ft" | null;
  /** Bordero szám — a Duvenbeck belső elszámolási hivatkozása. */
  bordero: string | null;
  /** A rakomány súlya kilogrammban ("9007KG") — a megbízáson szerepel. */
  sulyKg: number | null;
  megallok: DuvenbeckMegallo[];
  /** Ahová a számlát és a fuvarpapírokat (POD) kérik — a Duvenbecknél e-mail cím. */
  szamlaCim: string | null;
};

/**
 * Európai számírás: a pont az ezres, a vessző a tizedes elválasztó
 * ("1.250,00" -> 1250.5, "500,00" -> 500). A magyar/angol olvasat fordítva
 * értené, és egy 1.250,00 EUR-os fuvardíjból 1,25-öt csinálna.
 */
function szamErtek(nyers: string): number | null {
  const n = Number(nyers.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "14.09.2026" -> "2026-09-14". A sablon mindenhol napot.hónapot.évet ír. */
function isoDatum(nap: string, honap: string, ev: string): string {
  return `${ev}-${honap}-${nap}`;
}

/**
 * Az első illeszkedő csoport, vagy null. A "[^0-9]{0,N}" alakú hézag azért
 * kell, mert a címke és az érték közé a PDF-kiolvasás hol sortörést, hol a
 * másik nyelvű címkét teszi ("Ut ID:\n\n23279022", ill. "Ut ID: / Tour ID23279022").
 */
function elsoTalalat(szoveg: string, minta: RegExp): string | null {
  return szoveg.match(minta)?.[1]?.trim() || null;
}

/**
 * Magyar rendszám-alakok a dokumentum bármely pontján: 3-4 betű + 3 szám,
 * kötőjellel vagy anélkül (NMZ-492, AOPU427). A Duvenbeck a "Car_O Trip:"
 * mező mellett a rakománylistán a megállók fölött is kiírja, de a mezőnév
 * körüli szöveg elrendezése változik, ezért nem a címkére horgonyzunk.
 *
 * A szűk alak fontos: a dokumentum tele van más azonosítókkal (UH748629,
 * S0011570473, HU13500287, H80F2), ezek egyike sem illeszkedik.
 */
const RENDSZAM_ALAK = /\b([A-Z]{3,4}-?\d{3})\b/g;

function rendszamJeloltek(szoveg: string): string[] {
  const talalatok = [...szoveg.matchAll(RENDSZAM_ALAK)].map((m) => m[1]);
  return [...new Set(talalatok)];
}

/**
 * A megállók címe HÁROM külön soron áll — ez a `pdf-parse` tényleges
 * kimenete, nem az, amit egy dúsabb PDF-olvasó ad. (Az első változat egysoros
 * címre épült, ezért élesben egyetlen megállót sem ismert fel, és a rendszer
 * némán visszaesett a nyelvi modellre.)
 *
 * Rakománylista — a hármas egyben, országkóddal:
 *
 *   Yanfeng International Automotive     <- cégnév
 *   Juhar utca 17                        <- utca
 *   HU 8500 Papa                         <- országkód + irányítószám + város
 *
 * Megbízás — az utca/irányítószám/országkód hármas megállónként, de a cégnevek
 * ELŐTTE, egy tömbben (és hosszú név két sorra törik, ezért nem indexelhető
 * megbízhatóan):
 *
 *   Campona utca . 1
 *   1225 Budapest
 *   HU
 */
const RAKOMANYLISTA_VAROS = /^([A-Z]{2})\s+(\d{4})\s+(\S.*)$/;
const MEGBIZAS_VAROS = /^(\d{4})\s+(\S.*)$/;
const ORSZAGKOD_SOR = /^[A-Z]{2}$/;

/** A megállók szerepe — a rakománylistán egy sorban, a megbízáson a fordítástól külön. */
const SZEREP_RAKOMANYLISTA = /^(BERAKODAS|KIRAKODAS)\s*\/\s*(LOADING|UNLOADING)\s*$/i;
const SZEREP_MEGBIZAS = /^(Berakodas|Kirakodas)\s*\/\s*$/i;

/**
 * Az időablak két vége KÜLÖN soron van, és minden megállóé egymás után, a
 * megállók sorrendjében. A dátum-feltétel zárja ki a lap alján lévő
 * jelmagyarázatot ("PV: Felrako/ kirako datum (tol) / ...").
 */
const PV_SOR = /^PV:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/;
const PB_SOR = /^PB:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/;

function szeletek(szoveg: string): string[] {
  return szoveg
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function szerepekSorrendben(sorok: string[], minta: RegExp): ("felrako" | "lerako")[] {
  return sorok
    .map((sor) => sor.match(minta))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => (m[1].toUpperCase().startsWith("BERAKODAS") ? "felrako" : "lerako"));
}

/** A PV/PB sorok párba állítva, előfordulási sorrendben (megállónként egy pár). */
function ablakokSorrendben(sorok: string[]): { tol: DuvenbeckMegallo["ablakTol"]; ig: DuvenbeckMegallo["ablakIg"] }[] {
  const ido = (m: RegExpMatchArray) => ({ datum: isoDatum(m[1], m[2], m[3]), ido: m[4] });
  const pv = sorok.map((s) => s.match(PV_SOR)).filter((m): m is RegExpMatchArray => !!m).map(ido);
  const pb = sorok.map((s) => s.match(PB_SOR)).filter((m): m is RegExpMatchArray => !!m).map(ido);
  return pv.map((tol, i) => ({ tol, ig: pb[i] ?? null }));
}

function osszeallit(
  szerepek: ("felrako" | "lerako")[],
  cimek: string[],
  ablakok: { tol: DuvenbeckMegallo["ablakTol"]; ig: DuvenbeckMegallo["ablakIg"] }[]
): DuvenbeckMegallo[] {
  return szerepek.map((szerep, i) => ({
    szerep,
    cim: cimek[i] ?? "",
    ablakTol: ablakok[i]?.tol ?? null,
    ablakIg: ablakok[i]?.ig ?? null,
  }));
}

/** A rakománylista megállói: minden "HU 8500 Papa" alakú sor elé a két előző sor a cégnév és az utca. */
function rakomanylistaMegallok(szoveg: string): DuvenbeckMegallo[] {
  const sorok = szeletek(szoveg);
  const cimek: string[] = [];
  sorok.forEach((sor, i) => {
    const m = sor.match(RAKOMANYLISTA_VAROS);
    if (!m || i < 2) return;
    cimek.push([sorok[i - 2], sorok[i - 1], `${m[2]} ${m[3]}`].filter(Boolean).join(", "));
  });
  return osszeallit(szerepekSorrendben(sorok, SZEREP_RAKOMANYLISTA), cimek, ablakokSorrendben(sorok));
}

/**
 * A megbízás megállói — tartalék arra az esetre, ha a rakománylista mégsem
 * érkezne meg a párjával. A megállót az "irányítószám Város" + a rá következő
 * "HU" sor párosa azonosítja; enélkül a saját szakolyi (4234) és a Duvenbeck
 * csehbányai (8445) irányítószáma is megállónak látszana, mert azok után nem
 * áll országkód-sor.
 *
 * A cégneveket csak akkor vesszük hozzá, ha pontosan annyi névsor van, ahány
 * megálló: hosszú cégnév két sorra törik ("Yanfeng International" /
 * "Automotive"), és akkor a nevek nem rendelhetők megállókhoz. Ilyenkor
 * inkább utca + város, mint rossz cégnév a rossz megállón.
 */
function megbizasMegallok(szoveg: string): DuvenbeckMegallo[] {
  const sorok = szeletek(szoveg);

  const varosIndexek = sorok
    .map((sor, i) => (MEGBIZAS_VAROS.test(sor) && ORSZAGKOD_SOR.test(sorok[i + 1] ?? "") ? i : -1))
    .filter((i) => i > 0);

  const utolsoSzerepIndex = sorok.reduce((acc, sor, i) => (SZEREP_MEGBIZAS.test(sor) ? i : acc), -1);
  const nevjeloltek =
    utolsoSzerepIndex >= 0 && varosIndexek.length > 0
      ? sorok
          .slice(utolsoSzerepIndex + 1, varosIndexek[0] - 1)
          .filter((sor) => !/^(loading|unloading)$/i.test(sor))
      : [];
  const nevek = nevjeloltek.length === varosIndexek.length ? nevjeloltek : [];

  const cimek = varosIndexek.map((vi, k) => {
    const m = sorok[vi].match(MEGBIZAS_VAROS);
    return [nevek[k], sorok[vi - 1], m ? `${m[1]} ${m[2]}` : null].filter(Boolean).join(", ");
  });

  return osszeallit(szerepekSorrendben(sorok, SZEREP_MEGBIZAS), cimek, ablakokSorrendben(sorok));
}

/**
 * Felismeri és értelmezi a Duvenbeck két dokumentumtípusát. null, ha a szöveg
 * nem Duvenbeck-dokumentum — ilyenkor a hívó az általános, LLM-es
 * kivonatolást használja tovább.
 */
export function parseDuvenbeck(szoveg: string): DuvenbeckDok | null {
  if (!/duvenbeck/i.test(szoveg)) return null;

  const rakomanylistaTalalat = szoveg.match(/Rakomanylista:\s*ID\s*(\d+)(?:\/(\d+))?/i);
  const megbizasTalalat = szoveg.match(/Fuvar Megbizas:\s*ID\s*(\d+)(?:\/(\d+))?/i);
  if (!megbizasTalalat) return null;

  const tipus = rakomanylistaTalalat ? "rakomanylista" : "megbizas";
  // A verziószám a saját azonosítója után áll: a megbízáson a megbízás ID-é
  // ("1980534/1"), a rakománylistán a rakománylista ID-é ("1994504/1") — ott
  // ugyanis a megbízás ID verzió nélkül szerepel.
  const verzioNyers = rakomanylistaTalalat ? rakomanylistaTalalat[2] : megbizasTalalat[2];

  // A "Teljes osszeg / Total" az elszámolandó végösszeg (a "Fuvardij" sor az
  // alapdíj) — pótdíjas megbízásnál a kettő eltérhet, ezért a végösszeg nyer.
  const osszeg =
    szoveg.match(/Teljes osszeg\s*\/\s*Total\s*([\d.,]+)\s*(EUR|HUF|Ft)/i) ??
    szoveg.match(/Fuvardij\s*\/\s*Freight price\s*([\d.,]+)\s*(EUR|HUF|Ft)/i);

  const megallok = tipus === "rakomanylista" ? rakomanylistaMegallok(szoveg) : megbizasMegallok(szoveg);

  return {
    tipus,
    megbizasId: megbizasTalalat[1],
    verzio: verzioNyers ? Number(verzioNyers) : null,
    rakomanylistaId: rakomanylistaTalalat?.[1] ?? null,
    reiseId: elsoTalalat(szoveg, /Ut ID:[^0-9]{0,40}(\d{6,})/i),
    turaId: elsoTalalat(szoveg, /Tura ID:[^0-9]{0,40}(\d{6,})/i),
    rendszamJeloltek: rendszamJeloltek(szoveg),
    fuvardij: osszeg ? szamErtek(osszeg[1]) : null,
    penznem: osszeg ? (/eur/i.test(osszeg[2]) ? "EUR" : "Ft") : null,
    bordero: elsoTalalat(szoveg, /Bordero:\s*([A-Z0-9]+)/i),
    sulyKg: Number(elsoTalalat(szoveg, /(\d{3,6})\s*KG\b/i)) || null,
    megallok: megallok.filter((m) => m.cim),
    szamlaCim: elsoTalalat(szoveg, /([A-Za-z0-9._%+-]+@duvenbeck\.[a-z]{2,})/i),
  };
}

/** A megállók egy szerephez tartozó címei " + "-szal fűzve — lásd lib/fuvarozas/varos.ts bontsMegallokra. */
export function megalloCimek(dok: DuvenbeckDok, szerep: "felrako" | "lerako"): string {
  return dok.megallok
    .filter((m) => m.szerep === szerep)
    .map((m) => m.cim)
    .join(" + ");
}
