// MNB hivatalos devizaárfolyam — a TISZTA rész (se DB, se hálózat): a SOAP-
// válasz értelmezése és a teljesítési naphoz tartozó árfolyam kiválasztása.
// A lekérés és a tárolás a lib/fuvarozas/arfolyam.ts-ben van; a teszt
// (scripts/teszt-koltseg.ts) egy valódi MNB-válasz mintájával ellenőrzi.
//
// Az MNB válasza (GetExchangeRates): a SOAP-törzsben egy ESCAPE-ELT XML
// szöveg —
//   <GetExchangeRatesResult>&lt;MNBExchangeRates&gt;&lt;Day date="2026-10-09"&gt;
//     &lt;Rate unit="1" curr="EUR"&gt;364,82&lt;/Rate&gt;&lt;/Day&gt;…
// A szám magyar tizedesvesszővel jön, néha 5 tizedessel ("366,76000"); a
// `unit` a darabszám (pl. JPY: 100) — az egy egységre eső Ft-ot tároljuk.

export type MnbArfolyam = { nap: string; penznem: string; ft: number };

function entitasok(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Az MNB SOAP-válaszából (vagy a már kibontott MNBExchangeRates XML-ből) a napi árfolyamok. */
export function parseMnbArfolyamok(xml: string): MnbArfolyam[] {
  const belso = entitasok(xml);
  const ki: MnbArfolyam[] = [];
  const napMinta = /<Day\s+date="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Day>/g;
  for (const nap of belso.matchAll(napMinta)) {
    const rataMinta = /<Rate\s+([^>]*)>\s*([0-9][0-9\s.,]*)\s*<\/Rate>/g;
    for (const r of nap[2].matchAll(rataMinta)) {
      const attr = r[1];
      const penznem = /curr="([A-Z]{3})"/.exec(attr)?.[1];
      const egyseg = Number(/unit="(\d+)"/.exec(attr)?.[1] ?? "1") || 1;
      const ertek = Number(r[2].replace(/\s/g, "").replace(",", "."));
      if (!penznem || !Number.isFinite(ertek) || ertek <= 0) continue;
      ki.push({ nap: nap[1], penznem, ft: Math.round((ertek / egyseg) * 10000) / 10000 });
    }
  }
  return ki;
}

/** Hogyan viszonyul a használt árfolyam napja a teljesítés napjához. */
export type ArfolyamTipus =
  /** Pontosan a teljesítés napjának árfolyama. */
  | "aznapi"
  /** A megelőző közzétett nap árfolyama, mert aznap nincs (hétvége, vagy ma 12:00 előtt). */
  | "elozo"
  /** Régebbi árfolyam, pedig közben lett volna közzétett nap (ünnep, vagy hiányzó/elavult adat). */
  | "regi"
  /** Korábbi nincs, a legkorábbi KÉSŐBBI napé. */
  | "kesobbi";

/** Az MNB a munkanapi árfolyamot délben (~12:00, budapesti idő) teszi közzé. */
export const MNB_KOZZETETEL_ORA = 12;

function napHetNapja(nap: string): number {
  return new Date(`${nap}T12:00:00Z`).getUTCDay();
}

function napLepes(nap: string, delta: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Kellett-e már árfolyamot közzétenni erre a napra: hétköznap, és vagy múltbeli
 * nap, vagy a mai nap 12:00 (budapesti idő) után. Ünnepnapot nem ismer — azt
 * a hívó a hiányzó sorból látja (és óránként legfeljebb egyszer kérdez újra).
 * `ma`/`ora` nélkül minden hétköznapot közzétettnek vesz.
 */
export function kozzetettNapKell(nap: string, ma?: string, ora?: number): boolean {
  const h = napHetNapja(nap);
  if (h === 0 || h === 6) return false;
  if (ma == null) return true;
  if (nap < ma) return true;
  if (nap > ma) return false;
  return (ora ?? 0) >= MNB_KOZZETETEL_ORA;
}

/** A `nap`-ra érvényes árfolyam várt közzétételi napja: a legutóbbi `nap` előtti/aznapi nap, amelyre már kellett közzétett árfolyam. */
export function elvartArfolyamNap(nap: string, ma?: string, ora?: number): string | null {
  let d = nap;
  for (let i = 0; i < 10; i++) {
    if (kozzetettNapKell(d, ma, ora)) return d;
    d = napLepes(d, -1);
  }
  return null;
}

/**
 * Azok a teljesítési napok, amelyekhez HIÁNYZIK a tárolt árfolyam: a várt
 * közzétételi napra (lásd fent) nincs PONTOSAN arra a napra szóló sor. A
 * régi szabály (bármely sor 4 napon belül) egy 4 napos árfolyamot is
 * meglévőnek vett — ez nem.
 */
export function hianyzoArfolyamNapok(
  sorok: { nap: string }[],
  napok: string[],
  ma: string,
  ora: number
): string[] {
  const meglevo = new Set(sorok.map((s) => s.nap));
  return napok.filter((n) => {
    const v = elvartArfolyamNap(n, ma, ora);
    return v != null && !meglevo.has(v);
  });
}

/**
 * A `nap`-hoz érvényes árfolyam: az aznapi, vagy (hétvége, ünnep, még nem
 * közzétett mai) a legutóbbi korábbi. Ha korábbi sincs, a legkorábbi
 * későbbi. `pontos` CSAK az aznapi árfolyamnál igaz; a `tipus` mondja meg,
 * jogos-e a korábbi nap (hétvége / ma dél előtt → "elozo") vagy elavult
 * ("regi").
 */
export function arfolyamNapra(
  sorok: { nap: string; ft: number }[],
  nap: string,
  ma?: string,
  ora?: number
): { ft: number; nap: string; pontos: boolean; tipus: ArfolyamTipus } | null {
  if (sorok.length === 0) return null;
  const rendezett = [...sorok].sort((a, b) => a.nap.localeCompare(b.nap));
  let talalt: { nap: string; ft: number } | null = null;
  for (const s of rendezett) {
    if (s.nap <= nap) talalt = s;
    else break;
  }
  if (talalt) {
    if (talalt.nap === nap) return { ft: Number(talalt.ft), nap: talalt.nap, pontos: true, tipus: "aznapi" };
    const elvart = elvartArfolyamNap(nap, ma, ora);
    // Jogos előző nap: a várt közzétételi nap nem későbbi a talált sornál (hétvége, ma dél előtt).
    const tipus: ArfolyamTipus = elvart == null || elvart <= talalt.nap ? "elozo" : "regi";
    return { ft: Number(talalt.ft), nap: talalt.nap, pontos: false, tipus };
  }
  const elso = rendezett[0];
  return { ft: Number(elso.ft), nap: elso.nap, pontos: false, tipus: "kesobbi" };
}

/** Rövid felirat az árfolyam mellé (a Kimutatás és az EUR-átváltás címkéje). */
export function arfolyamTipusCimke(tipus: ArfolyamTipus | undefined, pontos?: boolean): string {
  if (tipus === "aznapi" || (tipus == null && pontos !== false)) return "";
  if (tipus === "elozo") return "előző közzétett nap";
  if (tipus === "regi") return "régebbi árfolyam — aznapi nincs tárolva";
  return "tartalék";
}

/** A GetExchangeRates SOAP 1.1 kérés törzse. */
export function mnbKeresTorzs(kezdet: string, veg: string, penznemek: string[]): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://www.mnb.hu/webservices/">` +
    `<soap:Body><web:GetExchangeRates><web:startDate>${kezdet}</web:startDate><web:endDate>${veg}</web:endDate>` +
    `<web:currencyNames>${penznemek.join(",")}</web:currencyNames></web:GetExchangeRates></soap:Body></soap:Envelope>`
  );
}
