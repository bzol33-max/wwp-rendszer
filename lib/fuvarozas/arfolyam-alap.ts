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

/**
 * A `nap`-hoz érvényes árfolyam: az aznapi, vagy (hétvége, ünnep, még nem
 * közzétett mai) a legutóbbi korábbi. Ha korábbi sincs, a legkorábbi
 * későbbi — jelölve, hogy nem a teljesítés napjáé.
 */
export function arfolyamNapra(
  sorok: { nap: string; ft: number }[],
  nap: string
): { ft: number; nap: string; pontos: boolean } | null {
  if (sorok.length === 0) return null;
  const rendezett = [...sorok].sort((a, b) => a.nap.localeCompare(b.nap));
  let talalt: { nap: string; ft: number } | null = null;
  for (const s of rendezett) {
    if (s.nap <= nap) talalt = s;
    else break;
  }
  if (talalt) return { ft: Number(talalt.ft), nap: talalt.nap, pontos: true };
  const elso = rendezett[0];
  return { ft: Number(elso.ft), nap: elso.nap, pontos: false };
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
