// Kamionstop: 7,5 t feletti tehergépkocsik hétvégi / ünnepnapi forgalomkorlátozása
// — 190/2008. (VII. 30.) Korm. rendelet 2. § (hatályos szöveg, njt.hu, 2026-10-17):
//
// (1) a) július 1. – augusztus 31.:
//        aa) szombaton – amennyiben az nem munkanap – 15 órától vasárnap 22 óráig,
//        ab) munkaszüneti napokon a megelőző nap 22 órától a munkaszüneti nap 22 óráig,
//     b) szeptember 1. – június 30.: a megelőző nap 22 órától vasárnap és
//        munkaszüneti napokon 22 óráig közlekedni nem szabad.
// (2) Ha a munkaszüneti nap az a) időszakban szombat vagy vasárnap előtti, vagy a
//     b) időszakban vasárnap előtti napra esik, a korlátozást a korlátozott időszak
//     első nap 8 órától az utolsó nap 22 óráig folyamatosan, megszakítás nélkül kell
//     alkalmazni.
// (3) A b) és (2) nem vonatkozik nov. 4. – márc. 1. között a nemzetközi forgalomban
//     közlekedő, legalább EURO 3-as tehergépkocsira — ezt itt NEM kezeljük
//     (belföldi fuvarokra tervezünk, a szigorúbb szabály a biztonságos).
//
// Értelmezés:
// - „munkaszüneti nap" = törvényes ünnep (Mt. 102. §), az áthelyezett pihenőnap NEM.
// - (2): az ünnep első napjának 8:00-ás kezdete sosem korábbi, mint az (1) szerinti
//   előző nap 22:00, így a gyakorlati hatása: az ünnep és a hétvége ablakai között
//   nincs rés (nyáron pénteki ünnep: csütörtök 22:00 – vasárnap 22:00).
// - Nyári ledolgozós szombat: az aa) pont szó szerint nem él; óvatosságból a
//   vasárnapot ekkor is szombat 22:00 – vasárnap 22:00 tiltjuk (mint a b) pontban).
//
// Időábrázolás: Europe/Budapest helyi falióra, "YYYY-MM-DDTHH:MM" sztring. A
// számolás percekben, tisztán aritmetikával (Date.UTC csak naptár-számolóként),
// a nyári időszámítás váltását (márc./okt. utolsó vasárnap) kézzel kezeljük —
// ez mindig vasárnap hajnal, azaz tilalmi ablakon belül esik, ezért a vezetési
// időt nem érinti, csak a várakozás valós hosszát.

import { ledolgozosSzombat, torvenyesUnnep } from "@/lib/jelenlet/shared";

export type TilalmiAblak = { tol: string; ig: string; ok: string };

const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const HETVEGI_OK = "hétvégi kamionstop";
const NYARI_HETVEGI_OK = "nyári hétvégi kamionstop (szombat 15:00-tól)";

// --- Naptár- és percszámolás (időzóna-független) ---

/** Helyi falióra-perc 1970-01-01T00:00 óta (nem valós idő, csak naptár-aritmetika). */
function helyiPerc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Hibás időpont: ${s} (várt: YYYY-MM-DDTHH:MM)`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

function helyiSztring(perc: number): string {
  return new Date(perc * 60000).toISOString().slice(0, 16);
}

export function napEltol(nap: string, n: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = vasárnap … 6 = szombat. */
function hetNapja(nap: string): number {
  return new Date(`${nap}T12:00:00Z`).getUTCDay();
}

function nyariIdoszak(nap: string): boolean {
  const h = nap.slice(5, 7);
  return h === "07" || h === "08";
}

function utolsoVasarnap(ev: number, honap: number): string {
  const d = new Date(Date.UTC(ev, honap, 0, 12)); // a hónap utolsó napja
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** Budapest UTC-eltolása percben az adott helyi időpontban (kétértelmű órában: nyári idő). */
function eltolas(helyi: number): number {
  const ev = new Date(helyi * 60000).getUTCFullYear();
  const kezd = helyiPerc(`${utolsoVasarnap(ev, 3)}T02:00`);
  const veg = helyiPerc(`${utolsoVasarnap(ev, 10)}T03:00`);
  return helyi >= kezd && helyi < veg ? 120 : 60;
}

/** Helyi sztring → valós (UTC) perc. */
export function valos(s: string): number {
  const h = helyiPerc(s);
  return h - eltolas(h);
}

/** Valós (UTC) perc → helyi sztring. */
export function helyi(v: number): string {
  const nyari = v + 120;
  return helyiSztring(eltolas(nyari) === 120 ? nyari : v + 60);
}

function unnepOk(nap: string, nev: string): string {
  return `${nev} (${HONAP_ROVID[+nap.slice(5, 7) - 1]} ${+nap.slice(8, 10)}.)`;
}

// --- Tilalmi ablakok ---

type Szakasz = { tol: number; ig: number; ok: string[] };

/** Egy nap által kiváltott (1)/(2) szerinti szakaszok, helyi percben. */
function napSzakaszai(nap: string): Szakasz[] {
  const ki: Szakasz[] = [];
  const elozo = napEltol(nap, -1);
  const hn = hetNapja(nap);
  const unnep = torvenyesUnnep(nap);

  // (1) ab) és b): munkaszüneti nap — előző nap 22:00-tól aznap 22:00-ig.
  if (unnep) ki.push({ tol: helyiPerc(`${elozo}T22:00`), ig: helyiPerc(`${nap}T22:00`), ok: [unnepOk(nap, unnep)] });

  // (1) b) (és óvatos nyári tartalék): vasárnap — szombat 22:00-tól vasárnap 22:00-ig.
  if (hn === 0) ki.push({ tol: helyiPerc(`${elozo}T22:00`), ig: helyiPerc(`${nap}T22:00`), ok: [HETVEGI_OK] });

  // (1) aa): nyári, nem ledolgozós szombat 15:00 – vasárnap 22:00.
  if (hn === 6 && nyariIdoszak(nap) && !ledolgozosSzombat(nap)) {
    ki.push({ tol: helyiPerc(`${nap}T15:00`), ig: helyiPerc(`${napEltol(nap, 1)}T22:00`), ok: [NYARI_HETVEGI_OK] });
  }

  // (2): ünnep a hétvége előtt — folyamatosan az ünnep 8:00-tól az utolsó korlátozott nap 22:00-ig.
  if (unnep) {
    const kov = hetNapja(napEltol(nap, 1));
    const ervenyes = nyariIdoszak(nap) ? kov === 6 || kov === 0 : kov === 0;
    if (ervenyes) {
      let utolso = nap;
      for (;;) {
        const n = napEltol(utolso, 1);
        if (hetNapja(n) === 0 || hetNapja(n) === 6 || torvenyesUnnep(n)) utolso = n;
        else break;
      }
      ki.push({ tol: helyiPerc(`${nap}T08:00`), ig: helyiPerc(`${utolso}T22:00`), ok: [] });
    }
  }
  return ki;
}

/**
 * A [tolNap, igNap] (YYYY-MM-DD, zárt) napokat érintő kamionstop-ablakok,
 * összefűzve (az egymásba érő / érintkező szakaszok egy ablak). Az ablakok
 * teljes hosszukban jönnek vissza, akkor is, ha a kért szakaszon túlnyúlnak.
 * `ig` kizáró: ig-kor már lehet indulni.
 */
export function tilalmiAblakok(tolNap: string, igNap: string): TilalmiAblak[] {
  const szakaszok: Szakasz[] = [];
  for (let n = napEltol(tolNap, -6); n <= napEltol(igNap, 6); n = napEltol(n, 1)) szakaszok.push(...napSzakaszai(n));
  szakaszok.sort((a, b) => a.tol - b.tol || a.ig - b.ig);

  const osszefuzott: Szakasz[] = [];
  for (const s of szakaszok) {
    const utolso = osszefuzott[osszefuzott.length - 1];
    if (utolso && s.tol <= utolso.ig) {
      utolso.ig = Math.max(utolso.ig, s.ig);
      for (const o of s.ok) if (!utolso.ok.includes(o)) utolso.ok.push(o);
    } else osszefuzott.push({ tol: s.tol, ig: s.ig, ok: [...s.ok] });
  }

  const elso = helyiPerc(`${tolNap}T00:00`);
  const vege = helyiPerc(`${napEltol(igNap, 1)}T00:00`);
  return osszefuzott
    .filter((s) => s.ig > elso && s.tol < vege)
    .map((s) => ({
      tol: helyiSztring(s.tol),
      ig: helyiSztring(s.ig),
      // A nyári szombati ablak már magában foglalja a vasárnapot — ne írjuk ki kétszer.
      ok: (s.ok.includes(NYARI_HETVEGI_OK) ? s.ok.filter((o) => o !== HETVEGI_OK) : s.ok).join(" + "),
    }));
}

/**
 * `vezetesPerc` vezetés `indulas`-tól (helyi "YYYY-MM-DDTHH:MM"). Ha a vezetés
 * tilalmi ablakba érne, a kamion az ablak kezdetén megáll és a végén folytatja
 * (a már levezetett idő megmarad); ha az indulás ablakon belül van, a végéig vár.
 * `varakozasPerc` valós percben (a nyári időszámítás váltását figyelembe véve);
 * `ablak` az első ablak, ami miatt várni kellett.
 */
export function tilalmonAtugrik(
  indulas: string,
  vezetesPerc: number,
): { erkezes: string; varakozasPerc: number; ablak: TilalmiAblak | null } {
  let t = valos(indulas);
  let hatra = Math.max(0, vezetesPerc);
  let varakozasPerc = 0;
  let ablak: TilalmiAblak | null = null;

  while (hatra > 0) {
    const nap = helyi(t).slice(0, 10);
    const kov = tilalmiAblakok(nap, napEltol(nap, 14)).find((a) => valos(a.ig) > t);
    if (!kov) {
      t += hatra;
      break;
    }
    const tol = valos(kov.tol);
    if (tol <= t) {
      const ig = valos(kov.ig);
      varakozasPerc += ig - t;
      t = ig;
      ablak ??= kov;
    } else if (t + hatra <= tol) {
      t += hatra;
      hatra = 0;
    } else {
      hatra -= tol - t;
      t = tol;
    }
  }
  return { erkezes: helyi(t), varakozasPerc, ablak };
}
