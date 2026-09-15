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
 * Egy megálló címe a RAKOMÁNYLISTÁBÓL. Ott a teljes cím egyetlen sor, a végén
 * országkóddal, irányítószámmal és várossal:
 *
 *   "BMW HU Plant Debrecen BMW Koerút 1 HU 4002 Debrecen"
 *
 * A lusta (.*?) és a sorvégi horgony együtt biztosítja, hogy az UTOLSÓ
 * "<országkód> <irsz> <város>" hármast találjuk meg — különben a cégnévben
 * szereplő "BMW HU Plant..." "HU"-ja szakítaná ketté a sort.
 */
const RAKOMANYLISTA_CIMSOR = /^(.*?\S)\s+([A-Z]{2})\s+(\d{4})\s+(\S.*)$/;

/** A megállók szerepe a rakománylistán — a címsoroktól külön, hasábosan jelennek meg. */
const SZEREP_SOR = /^(BERAKODAS|KIRAKODAS)\s*\/\s*(LOADING|UNLOADING)\b/i;

/** "PV: 15.09.2026 06:00 PB: 15.09.2026 22:00" — a rakománylistán egy sorban. */
const ABLAK_PAR =
  /PV:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})\s*PB:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/g;

function szeletek(szoveg: string): string[] {
  return szoveg
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A rakománylista megállói. A hasábos elrendezés miatt előbb jön MINDEN
 * megálló szerepe (BERAKODAS, KIRAKODAS), utána MINDEN címe, utána MINDEN
 * időablaka — egymáshoz a sorrendjük rendeli őket, nem a közelségük.
 */
function rakomanylistaMegallok(szoveg: string): DuvenbeckMegallo[] {
  const sorok = szeletek(szoveg);

  const szerepek: ("felrako" | "lerako")[] = [];
  const cimek: string[] = [];
  for (const sor of sorok) {
    const szerep = sor.match(SZEREP_SOR);
    if (szerep) {
      szerepek.push(szerep[1].toUpperCase() === "BERAKODAS" ? "felrako" : "lerako");
      continue;
    }
    const cim = sor.match(RAKOMANYLISTA_CIMSOR);
    if (cim) cimek.push(`${cim[1]}, ${cim[3]} ${cim[4]}`);
  }

  const ablakok = [...szoveg.matchAll(ABLAK_PAR)].map((m) => ({
    ablakTol: { datum: isoDatum(m[1], m[2], m[3]), ido: m[4] },
    ablakIg: { datum: isoDatum(m[5], m[6], m[7]), ido: m[8] },
  }));

  return szerepek.map((szerep, i) => ({
    szerep,
    cim: cimek[i] ?? "",
    ablakTol: ablakok[i]?.ablakTol ?? null,
    ablakIg: ablakok[i]?.ablakIg ?? null,
  }));
}

/**
 * A megbízás megállói — tartalék arra az esetre, ha a rakománylista mégsem
 * érkezne meg a párjával. Itt a cím hasábosan szét van esve, ezért csak a
 * biztosan felismerhető darabokat vesszük ki: a blokk első két szelete a
 * cégnév és az utca, az irányítószám + város pedig a blokkon belül bárhol
 * állhat. Ami a hasábkeveredés miatt közé csúszik (súly, LM, dátum, a cégnév
 * második fele), azt eldobjuk — jobb rövidebb, de helyes címet adni.
 */
function megbizasMegallok(szoveg: string): DuvenbeckMegallo[] {
  // Az ütemterv a "Berakodas/" első előfordulásától a következő oldal
  // fejlécéig tart. E nélkül a határolás nélkül a saját szakolyi (4234) és a
  // Duvenbeck csehbányai (8445) irányítószáma is megállónak látszana.
  const kezdet = szoveg.search(/\bBerakodas\s*\//i);
  if (kezdet === -1) return [];
  const utana = szoveg.slice(kezdet);
  const vege = utana.search(/Fuvar Megbizas:\s*ID/i);
  const utemterv = vege === -1 ? utana : utana.slice(0, vege);

  const sorok = szeletek(utemterv);
  const blokkok: { szerep: "felrako" | "lerako"; sorok: string[] }[] = [];
  for (const sor of sorok) {
    const nyito = sor.match(/^(Berakodas|Kirakodas)\s*\//i);
    if (nyito) {
      blokkok.push({
        szerep: nyito[1].toLowerCase() === "berakodas" ? "felrako" : "lerako",
        sorok: [],
      });
      // A nyitó szelet maradéka is tartalmazhat adatot ("Berakodas/ FIEGE ...").
      const maradek = sor.replace(/^(Berakodas|Kirakodas)\s*\/\s*/i, "").trim();
      if (maradek) blokkok[blokkok.length - 1].sorok.push(maradek);
      continue;
    }
    if (blokkok.length > 0) blokkok[blokkok.length - 1].sorok.push(sor);
  }

  return blokkok.map(({ szerep, sorok: blokk }) => {
    const varos = blokk.map((s) => s.match(/^(\d{4})\s+([^\d,]{2,40})$/)).find(Boolean);
    // A cégnév és az utca a blokk első két, adatnak nem látszó szelete.
    const nevEsUtca = blokk
      .filter((s) => !/^\d{4}\s/.test(s) && !/^(PV|PB):/i.test(s) && !/\d+(,\d+)?LM/i.test(s) && !/^\d+KG/i.test(s))
      .slice(0, 2);
    const darabok = [...nevEsUtca, varos ? `${varos[1]} ${varos[2].trim()}` : null].filter(Boolean);
    const ablakTol = blokk.map((s) => s.match(/PV:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/)).find(Boolean);
    const ablakIg = blokk.map((s) => s.match(/PB:\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/)).find(Boolean);
    return {
      szerep,
      cim: darabok.join(", "),
      ablakTol: ablakTol ? { datum: isoDatum(ablakTol[1], ablakTol[2], ablakTol[3]), ido: ablakTol[4] } : null,
      ablakIg: ablakIg ? { datum: isoDatum(ablakIg[1], ablakIg[2], ablakIg[3]), ido: ablakIg[4] } : null,
    };
  });
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
