// A kontókivonat beolvasása és a bevételek ⇄ számlák párosítása — adatbázis
// nélküli, tiszta függvények (a lib/szamlak/kontokivonat.ts szerver akció
// tölti be hozzájuk az adatot), hogy valódi bankexportokon önállóan is
// tesztelhetők legyenek.
//
// A bank "HISTORY_xxxx.xlsx" exportjának oszlopai: 1 Számlaszám (saját),
// 2 Devizanem, 3 Értéknap, 4 Tranzakció típusa, 5 Partner neve, 6 Partner
// számlaszáma, 7 Összeg, 8 Közlemény — a fejléc-sor napváltásonként
// megismétlődik. 2026 május előtt a "Partner neve" kétsoros volt ("+IZV …"
// azonosító + név), azóta egysoros, és a Tranzakció típusa ki van töltve.
//
// Párosítási elvek (valódi kivonatokon ellenőrizve):
//  - A vevők szinte mindig megadják a közleményben a számlaszámot, gyakran
//    többet is ("WLLWR-2026-233,234", ". WLLWR-2026-160 ,166,171",
//    "2026-130 131 139"). Ha a közlemény számlára hivatkozik, SOSEM esünk
//    vissza név+összeg találgatásra — egy már kifizetett hivatkozott számla
//    azt jelenti, hogy ez az utalás már le van könyvelve (különben egy
//    visszatérő, azonos összegű vevőnél, pl. Fabrika, egy MÁSIK nyitott
//    számlát jelölnénk fizetettnek).
//  - Automatikus (egy kattintásos) könyvelés csak akkor, ha az összeg
//    fillérre kijön; minden más javaslat kézi jóváhagyásra vár.
//  - Egy számla hátralékát egy feltöltésen belül csak egyszer lehet lefedni,
//    de ha egy utalás csak részben fedezi (részfizetés), a maradékra ugyanabban
//    a feltöltésben egy későbbi utalás is jöhet.

import ExcelJS from "exceljs";
import type {
  KivonatForras,
  KivonatParositas,
  KivonatSzamlaJelolt,
  KivonatTranzakcio,
} from "./kontokivonat-constants";

export type ParositasSzamla = {
  id: string;
  szamlaszam: string;
  vevoNev: string;
  brutto: number;
  penznem: string;
  /** "YYYY-MM-DD" — egy utalás csak a már kiállított számlákat fedezheti. */
  kiallitasDatum: string;
  fizetesiHatarido: string | null;
  fizetve: boolean;
  /** "YYYY-MM-DD", ha fizetett. */
  fizetveDatum: string | null;
  /** Korábbi részfizetésekből már beérkezett összeg (szamla.fizetett_osszeg). */
  fizetettOsszeg: number;
  /** Van-e már hozzá lekönyvelt banki utalás (kontokivonat_konyvelt) — ha nincs, a fizetés dátuma pontosítható. */
  bankIgazolt: boolean;
};

export type KivonatBeolvasas = {
  forras: KivonatForras;
  tranzakciok: KivonatTranzakcio[];
  osszesAdatSor: number;
  kihagyottKiadas: number;
  kihagyottKartya: number;
  /** Saját számlák közti átvezetés (a fizető maga a cég) — nem vevői befizetés. */
  kihagyottSajat: number;
};

/** A cég saját neve a partner mezőben = saját számlák közti átvezetés. */
function sajatAtvezetes(partnerNev: string): boolean {
  return /WELL[\s-]*WORN/i.test(partnerNev);
}

// ---------------------------------------------------------------------------
// Beolvasás
// ---------------------------------------------------------------------------

function cella(row: ExcelJS.Row, index: number): unknown {
  const cell = row.getCell(index);
  return cell.value && typeof cell.value === "object" && "result" in cell.value
    ? (cell.value as { result: unknown }).result
    : cell.value;
}

function szoveg(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** "+IZV 00761432762\nCÉGNÉV" (régi) vagy "HUNGAROTRUCK Kft      NOTPROVIDED" (új, kitöltő szóközökkel) → a tiszta név. */
function partnerNevTisztit(nyers: string): string {
  const sorok = nyers
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const utolso = sorok[sorok.length - 1] ?? "";
  return utolso.split(/\s{2,}/)[0]?.trim() ?? "";
}

/** UniCredit "HISTORY_xxxx.xlsx" vagy CIB havi bankszámlakivonat (PDF) — a fájl tartalma alapján. */
export async function olvasKivonatot(buffer: Uint8Array): Promise<KivonatBeolvasas> {
  const pdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // "%PDF"
  if (pdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      return cibKivonatSzovegbol((await parser.getText()).text);
    } finally {
      await parser.destroy();
    }
  }
  return olvasUnicreditXlsx(buffer);
}

async function olvasUnicreditXlsx(buffer: Uint8Array): Promise<KivonatBeolvasas> {
  const workbook = new ExcelJS.Workbook();
  // Az exceljs saját (régebbi stílusú) Buffer deklarációja nem egyezik a
  // @types/node generikus Buffer típusával — futásidőben ugyanaz az objektum.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const eredmeny: KivonatBeolvasas = { forras: "unicredit-xlsx", tranzakciok: [], osszesAdatSor: 0, kihagyottKiadas: 0, kihagyottKartya: 0, kihagyottSajat: 0 };
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return eredmeny;

  const kulcsDarab = new Map<string, number>();

  worksheet.eachRow((row) => {
    const elso = szoveg(cella(row, 1));
    if (!elso || elso === "Számlaszám") return;
    eredmeny.osszesAdatSor += 1;

    const osszegRaw = cella(row, 7);
    const osszeg = typeof osszegRaw === "number" ? osszegRaw : Number(szoveg(osszegRaw).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(osszeg) || osszeg <= 0) {
      eredmeny.kihagyottKiadas += 1;
      return;
    }
    const partnerNyers = szoveg(cella(row, 5));
    const tipus = szoveg(cella(row, 4));
    if (partnerNyers.startsWith("+CMS") || tipus === "Kártyatranzakció") {
      eredmeny.kihagyottKartya += 1;
      return;
    }

    if (sajatAtvezetes(partnerNevTisztit(partnerNyers) || partnerNyers)) {
      eredmeny.kihagyottSajat += 1;
      return;
    }

    const ertekNap = cella(row, 3);
    const datum = ertekNap instanceof Date ? ertekNap.toISOString().slice(0, 10) : szoveg(ertekNap).slice(0, 10).replace(/\./g, "-");
    const penznem = szoveg(cella(row, 2));
    const partnerSzamla = szoveg(cella(row, 6));
    const memo = szoveg(cella(row, 8));

    // A régi (2026 május előtti) exportban nincs közlemény és partner-számlaszám,
    // de a partner-cella első sora ("+IZV 00761432762") egyedi banki azonosító.
    const bankAzonosito = partnerNyers.startsWith("+") ? partnerNyers.split("\n")[0].trim() : "";
    const alapKulcs = [elso, datum, osszeg.toFixed(2), partnerSzamla, memo, bankAzonosito].join("|");
    const n = (kulcsDarab.get(alapKulcs) ?? 0) + 1;
    kulcsDarab.set(alapKulcs, n);

    eredmeny.tranzakciok.push({
      kulcs: n === 1 ? alapKulcs : `${alapKulcs}#${n}`,
      datum,
      partnerNev: partnerNevTisztit(partnerNyers) || partnerNyers,
      partnerSzamla,
      penznem,
      osszeg,
      memo: memo || null,
      tipus,
    });
  });

  return eredmeny;
}

/**
 * CIB havi bankszámlakivonat (PDF-ből kinyert szöveg). Egy tétel sorai: a
 * tranzakció típusa és azonosítója ("Bejövő azonnali GIRO jóváírás;
 * AZBII30093254849"), a partner számlaszáma, a partner neve, "Közlemény: …",
 * majd két dátumsor (könyvelési nap, értéknap) és egy "összeg egyenleg" sor.
 * Az oldalfejlécek/láblécek (bank adatai, "BANKSZÁMLA KIVONAT" … oszlopfejléc)
 * a tételek közé is beékelődhetnek — ezeket kihagyjuk.
 */
export function cibKivonatSzovegbol(szovegTeljes: string): KivonatBeolvasas {
  const eredmeny: KivonatBeolvasas = { forras: "cib-pdf", tranzakciok: [], osszesAdatSor: 0, kihagyottKiadas: 0, kihagyottKartya: 0, kihagyottSajat: 0 };
  const sajatSzamla = szovegTeljes.match(/\b(\d{8}-\d{8}-\d{8})\b/)?.[1] ?? "CIB";
  const penznem = szovegTeljes.match(/\n(HUF|EUR)\nPénzforgalmi/)?.[1] ?? "HUF";
  const datumSor = /^\d{4}\.\d{2}\.\d{2}\.$/;
  const osszegSor = /^(-?[\d.]+,\d{2})\s+-?[\d.]+,\d{2}$/;
  const szam = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

  let fejlecben = false;
  let blokk: string[] = [];
  const sorok = szovegTeljes.split("\n").map((s) => s.replace(/\t/g, " ").trim());
  for (let i = 0; i < sorok.length; i++) {
    const sor = sorok[i];
    if (/^STMC$|BANKSZÁMLA KIVONAT|Cégjegyzékszám|^CIB Bank Zrt/.test(sor)) fejlecben = true;
    if (fejlecben) {
      if (sor === "EGYENLEG") fejlecben = false;
      continue;
    }
    const m = sor.match(osszegSor);
    if (!(m && blokk.length >= 2 && datumSor.test(blokk[blokk.length - 1]) && datumSor.test(blokk[blokk.length - 2]))) {
      if (sor) blokk.push(sor);
      continue;
    }

    const datum = blokk[blokk.length - 1].slice(0, 10).replace(/\./g, "-");
    const leiras = blokk.slice(0, -2);
    blokk = [];
    eredmeny.osszesAdatSor += 1;
    const osszeg = szam(m[1]);
    const [tipusResz, azonosito = ""] = (leiras[0] ?? "").split(";").map((x) => x.trim());
    if (osszeg <= 0) {
      if (/BANKKÁRTYA/i.test(tipusResz)) eredmeny.kihagyottKartya += 1;
      else eredmeny.kihagyottKiadas += 1;
      continue;
    }

    const szamlaIdx = leiras.findIndex((l, idx) => idx > 0 && /^(HU\d{2}[\d ]+|\d{8}-\d{8}(-\d{8})?)$/.test(l));
    const partnerSzamla = szamlaIdx >= 0 ? leiras[szamlaIdx].replace(/\s/g, "") : "";
    const partnerNev = szamlaIdx >= 0 ? (leiras[szamlaIdx + 1] ?? "") : (leiras[1] ?? "");
    if (sajatAtvezetes(partnerNev) || /^Saját sz\. közti|FED\. ÁTVEZETÉS/i.test(tipusResz)) {
      eredmeny.kihagyottSajat += 1;
      continue;
    }
    const memoSor = leiras.find((l) => /^-?Közlemény:/.test(l));
    const memo = memoSor ? memoSor.replace(/^-?Közlemény:\s*/, "").trim() : "";

    eredmeny.tranzakciok.push({
      kulcs: ["CIB", sajatSzamla, datum, osszeg.toFixed(2), azonosito || leiras.join(" ").slice(0, 60)].join("|"),
      datum,
      partnerNev: partnerNev.startsWith("Közlemény") ? "" : partnerNev,
      partnerSzamla,
      penznem,
      osszeg,
      memo: memo && !/^[-\s]*$/.test(memo) ? memo : null,
      tipus: tipusResz,
    });
  }
  return eredmeny;
}

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

const EKEZET: Record<string, string> = { Á: "A", É: "E", Í: "I", Ó: "O", Ö: "O", Ő: "O", Ú: "U", Ü: "U", Ű: "U" };
const CEGFORMA_MINTA =
  /\b(KFT|ZRT|BT|EV|RT|NYRT|GMBH|KORLATOLT FELELOSSEGU TARSASAG|KORLATOLT FELELOSSEG\w*|KORLATOLT FELELOSS\w*|KORLATOLT F\w*|KORLATOLT)\b\.?/g;

function normalizeCegNev(nev: string): string {
  return nev
    .toUpperCase()
    .replace(/[ÁÉÍÓÖŐÚÜŰ]/g, (c) => EKEZET[c] ?? c)
    .replace(/["'.,]/g, "")
    .replace(CEGFORMA_MINTA, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nevEgyezik(bankNev: string, dbNev: string): boolean {
  const a = normalizeCegNev(bankNev);
  const b = normalizeCegNev(dbNev);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aElso = a.split(" ")[0] ?? "";
  const bElso = b.split(" ")[0] ?? "";
  return aElso.length >= 3 && aElso === bElso;
}

/** A bank "HUF"-ot, a Számlázz.hu "Ft"-ot ír ugyanarra. */
function penznemKod(penznem: string): string {
  const p = penznem.trim().toUpperCase();
  return p === "FT" ? "HUF" : p;
}

/** Összeg egész fillérre/centre — lebegőpontos összeadásnál a === különben elcsúszhat. */
function centben(osszeg: number): number {
  return Math.round(osszeg * 100);
}

/**
 * Amennyit egy utalás még fedezhet a számlából: nyitottnál a hátralék (a
 * korábbi részfizetések levonva), már fizetettnél a teljes bruttó — ott az
 * utalás nem fizet, csak a fizetés dátumát igazolja.
 */
function fedezetCent(sz: ParositasSzamla): number {
  return sz.fizetve ? centben(sz.brutto) : centben(sz.brutto) - centben(sz.fizetettOsszeg);
}

function esedekesseg(a: ParositasSzamla, b: ParositasSzamla): number {
  const ha = a.fizetesiHatarido ?? "9999-99-99";
  const hb = b.fizetesiHatarido ?? "9999-99-99";
  if (ha !== hb) return ha < hb ? -1 : 1;
  return a.szamlaszam.localeCompare(b.szamlaszam, "hu", { numeric: true });
}

function jelolt(sz: ParositasSzamla, hatralekCent: number): KivonatSzamlaJelolt {
  return {
    id: sz.id,
    szamlaszam: sz.szamlaszam,
    brutto: sz.brutto,
    hatralek: hatralekCent / 100,
    fizetettOsszeg: sz.fizetettOsszeg,
    fizetesiHatarido: sz.fizetesiHatarido,
    fizetveDatum: sz.fizetve ? sz.fizetveDatum : null,
  };
}

function formatFt(cent: number, penznem: string): string {
  return `${(cent / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${penznem}`;
}

type Hivatkozas = { elotag: string | null; ev: string; sorszam: number; explicit: boolean };

/**
 * Számla-hivatkozások a közleményből: "WLLWR-2026-233,234", "2026-130 131 139",
 * ". WLLWR-2026-160 ,166,171". Az évet kötőjel követi (a "2026/01024" jellegű
 * megrendelői pozíciószámok nem számlák), és a dátumszerű "2026-05-12" sem
 * hivatkozás. A folytatólagos számok az első hivatkozás előtagját/évét öröklik.
 */
export function kozlemenyHivatkozasai(memo: string): Hivatkozas[] {
  const minta = /(?<![A-Z0-9])(?:([A-Z]{2,10})\s*-\s*)?(20\d{2})-(\d{1,5})(?![\d]|-\d)((?:\s*[,;&+]\s*\d{1,5}(?![\d]|-\d)|\s+\d{1,5}(?![\d/.-]))*)/g;
  const eredmeny: Hivatkozas[] = [];
  for (const m of memo.toUpperCase().matchAll(minta)) {
    const elotag = m[1] ?? null;
    const explicit = elotag !== null;
    eredmeny.push({ elotag, ev: m[2], sorszam: Number(m[3]), explicit });
    for (const f of (m[4] ?? "").matchAll(/\d{1,5}/g)) {
      eredmeny.push({ elotag, ev: m[2], sorszam: Number(f[0]), explicit });
    }
  }
  return eredmeny;
}

/**
 * Év nélküli sorszámok, ha a közlemény CSAK ebből áll ("146 147", "183, 187") —
 * az utalás évére értelmezve, és (mivel nincs előtag) csak a vevő saját számláira.
 */
function csupaszSorszamok(memo: string, ev: string): Hivatkozas[] {
  if (!/^\s*\d{1,5}(?:\s*[,; ]\s*\d{1,5})*\s*\.?\s*$/.test(memo)) return [];
  return [...memo.matchAll(/\d{1,5}/g)].map((m) => ({ elotag: null, ev, sorszam: Number(m[0]), explicit: false }));
}

/** Van-e a közleményben számlahivatkozásnak látszó rész (akkor is, ha nem sikerült feloldani). */
function vanHivatkozasMinta(tranz: KivonatTranzakcio): boolean {
  if (!tranz.memo) return false;
  return kozlemenyHivatkozasai(tranz.memo).length > 0 || csupaszSorszamok(tranz.memo, tranz.datum.slice(0, 4)).length > 0;
}

/**
 * A számla vevője-e a fizető — vagy (faktorcég/megbízott fizet a vevő helyett,
 * pl. "K&H Bank Zrt. - Faktor" → "Trans-Sped Kft. megbízásából …") a vevő neve
 * szerepel-e a közleményben.
 */
function vevoEgyezik(tranz: KivonatTranzakcio, sz: ParositasSzamla): boolean {
  if (nevEgyezik(tranz.partnerNev, sz.vevoNev)) return true;
  const vevo = normalizeCegNev(sz.vevoNev);
  return vevo.length >= 4 && !!tranz.memo && normalizeCegNev(tranz.memo).includes(vevo);
}

function feloldHivatkozasokat(tranz: KivonatTranzakcio, szamlak: ParositasSzamla[]): ParositasSzamla[] {
  if (!tranz.memo) return [];
  const talalt = new Map<string, ParositasSzamla>();
  const hivatkozasok = [...kozlemenyHivatkozasai(tranz.memo), ...csupaszSorszamok(tranz.memo, tranz.datum.slice(0, 4))];
  for (const h of hivatkozasok) {
    const sorszamEgyezik = (sz: ParositasSzamla, elotaggal: boolean) => {
      const m = sz.szamlaszam.toUpperCase().match(/^([A-Z]+)-(\d{4})-(\d+)$/);
      return !!m && m[2] === h.ev && Number(m[3]) === h.sorszam && (!elotaggal || !h.elotag || m[1] === h.elotag);
    };
    let jeloltek = szamlak.filter((sz) => sorszamEgyezik(sz, true));
    // Elgépelt előtag ("WLLEWR-2026-212"): ha így nincs találat, előtag nélkül
    // próbáljuk — de akkor már a vevőnek is egyeznie kell.
    if (jeloltek.length === 0 && h.elotag) {
      h.explicit = false;
      jeloltek = szamlak.filter((sz) => sorszamEgyezik(sz, false));
    }
    // Előtag nélküli ("2026-253") hivatkozásnál a vevőnek is egyeznie kell —
    // különben egy véletlen számsor idegen számlára mutathatna. Teljes
    // számlaszámnál nem kell (pl. faktorcég is fizethet a vevő helyett).
    if (!h.explicit || jeloltek.length > 1) {
      jeloltek = jeloltek.filter((sz) => vevoEgyezik(tranz, sz));
    }
    if (jeloltek.length === 1) talalt.set(jeloltek[0].id, jeloltek[0]);
  }
  return [...talalt.values()];
}

/** A legrégebben esedékes nyitott számlák olyan (legrövidebb) sora, aminek összege pontosan kiadja a célt — és tartalmazza a kötelezőket. */
function legregebbiElotag(
  nyitottak: ParositasSzamla[],
  celCent: number,
  szabadCent: (sz: ParositasSzamla) => number,
  kotelezo: ParositasSzamla[] = []
): ParositasSzamla[] | null {
  let osszeg = 0;
  const elotag: ParositasSzamla[] = [];
  for (const sz of nyitottak) {
    elotag.push(sz);
    osszeg += szabadCent(sz);
    if (osszeg === celCent) {
      return kotelezo.every((k) => elotag.some((e) => e.id === k.id)) ? elotag : null;
    }
    if (osszeg > celCent) return null;
  }
  return null;
}

/** Legfeljebb 3 számla kombinációja, ami pontosan kiadja a célt (a legrégebbiek előnyben). */
function osszegKombinacio(
  nyitottak: ParositasSzamla[],
  celCent: number,
  szabadCent: (sz: ParositasSzamla) => number
): ParositasSzamla[] | null {
  const n = Math.min(nyitottak.length, 15);
  const c = nyitottak.map(szabadCent);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (c[i] + c[j] === celCent) return [nyitottak[i], nyitottak[j]];
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        if (c[i] + c[j] + c[k] === celCent) return [nyitottak[i], nyitottak[j], nyitottak[k]];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Párosítás
// ---------------------------------------------------------------------------

export function parositKivonatot(
  tranzakciok: KivonatTranzakcio[],
  szamlak: ParositasSzamla[],
  konyveltKulcsok: Set<string>
): KivonatParositas[] {
  // Egy számla hátralékából egy feltöltésen belül több utalás is lefedhet
  // egy-egy részt (részfizetés) — itt tartjuk nyilván, mennyit kötöttek már le.
  const lekotottCent = new Map<string, number>();
  const szamlaAzonosito = new Map(szamlak.map((sz) => [sz.id, sz]));
  const szabadCent = (sz: ParositasSzamla) => fedezetCent(sz) - (lekotottCent.get(sz.id) ?? 0);
  const szabad = (sz: ParositasSzamla) => szabadCent(sz) > 0;
  const szabadOsszegCent = (lista: ParositasSzamla[]) => lista.reduce((o, sz) => o + szabadCent(sz), 0);
  const jeloltek = (lista: ParositasSzamla[]) => lista.map((sz) => jelolt(sz, szabadCent(sz)));
  const sorrend = [...tranzakciok].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const eredmeny = new Map<string, KivonatParositas>();

  for (const tranz of sorrend) {
    const cel = centben(tranz.osszeg);
    const penznem = penznemKod(tranz.penznem);
    const kesz = (p: Omit<KivonatParositas, "tranzakcio">) => {
      // A bejelölt számlákból ennyit köt le ez az utalás — részfizetésnél csak
      // az utalás összegét, így a számla maradéka egy későbbi utalásnak megmarad.
      let marad = cel;
      for (const id of p.kivalasztottIdk) {
        const sz = szamlaAzonosito.get(id);
        if (!sz) continue;
        const resz = Math.min(szabadCent(sz), Math.max(marad, 0));
        lekotottCent.set(id, (lekotottCent.get(id) ?? 0) + resz);
        marad -= resz;
      }
      eredmeny.set(tranz.kulcs, { tranzakcio: tranz, ...p });
    };

    if (konyveltKulcsok.has(tranz.kulcs)) {
      eredmeny.set(tranz.kulcs, {
        tranzakcio: tranz, allapot: "konyvelt", mod: null, szamlak: [], kivalasztottIdk: [],
        megjegyzes: "Ez az utalás már le van könyvelve.",
      });
      continue;
    }

    const azonosPenznem = szamlak.filter((sz) => penznemKod(sz.penznem) === penznem);
    const nyitottVevo = azonosPenznem
      .filter(
        (sz) =>
          !sz.fizetve &&
          szabad(sz) &&
          sz.kiallitasDatum <= tranz.datum &&
          nevEgyezik(tranz.partnerNev, sz.vevoNev)
      )
      .sort(esedekesseg);

    const hivatkozott = feloldHivatkozasokat(tranz, azonosPenznem).sort(esedekesseg);
    if (hivatkozott.length > 0) {
      const nyitottHiv = hivatkozott.filter((sz) => !sz.fizetve && szabad(sz));
      const fizetettHiv = hivatkozott.filter((sz) => sz.fizetve);
      const igazolatlanHiv = fizetettHiv.filter((sz) => !sz.bankIgazolt && szabad(sz));
      const lista = hivatkozott.map((sz) => sz.szamlaszam).join(", ");

      if (nyitottHiv.length === 0 && igazolatlanHiv.length > 0) {
        // Már fizetettként szereplő, de banki utalással még nem igazolt számlák
        // (pl. régi tömeges import) — a fizetés dátuma pontosítható.
        if (szabadOsszegCent(igazolatlanHiv) === cel) {
          kesz({
            allapot: "datum", mod: "memo", szamlak: jeloltek(igazolatlanHiv), kivalasztottIdk: igazolatlanHiv.map((sz) => sz.id),
            megjegyzes: `Közlemény alapján — már fizetettként szerepel, a fizetés dátuma ${tranz.datum} lesz.`,
          });
          continue;
        }
        const igazolatlanVevo = azonosPenznem
          .filter((sz) => sz.fizetve && !sz.bankIgazolt && szabad(sz) && sz.kiallitasDatum <= tranz.datum && nevEgyezik(tranz.partnerNev, sz.vevoNev))
          .sort(esedekesseg);
        const elotagFiz = legregebbiElotag(igazolatlanVevo, cel, szabadCent, igazolatlanHiv);
        if (elotagFiz) {
          kesz({
            allapot: "datum", mod: "legregebbi", szamlak: jeloltek(elotagFiz), kivalasztottIdk: elotagFiz.map((sz) => sz.id),
            megjegyzes: `A közlemény ${lista} számlát említi, az összeg a vevő ${elotagFiz.length} legrégebbi, már fizetettként szereplő számlájával egyezik — ellenőrizd.`,
          });
          continue;
        }
      }

      if (nyitottHiv.length === 0) {
        eredmeny.set(tranz.kulcs, {
          tranzakcio: tranz, allapot: "konyvelt", mod: "memo", szamlak: jeloltek(hivatkozott), kivalasztottIdk: [],
          megjegyzes: fizetettHiv.length > 0
            ? `A közleményben szereplő számla már fizetve (${lista}).`
            : `A közleményben szereplő számlát ebben a feltöltésben egy másik utalás már lefedi (${lista}).`,
        });
        continue;
      }

      if (szabadOsszegCent(nyitottHiv) === cel) {
        kesz({
          allapot: "auto", mod: "memo", szamlak: jeloltek(nyitottHiv), kivalasztottIdk: nyitottHiv.map((sz) => sz.id),
          megjegyzes: fizetettHiv.length > 0
            ? `közlemény alapján; ${fizetettHiv.map((sz) => sz.szamlaszam).join(", ")} már fizetve`
            : nyitottHiv.length > 1 ? `közlemény alapján, ${nyitottHiv.length} számla` : "közlemény alapján",
        });
        continue;
      }

      if (igazolatlanHiv.length > 0 && szabadOsszegCent(nyitottHiv) + szabadOsszegCent(igazolatlanHiv) === cel) {
        const mind = [...nyitottHiv, ...igazolatlanHiv];
        kesz({
          allapot: "auto", mod: "memo", szamlak: jeloltek(mind), kivalasztottIdk: mind.map((sz) => sz.id),
          megjegyzes: `közlemény alapján; ${igazolatlanHiv.map((sz) => sz.szamlaszam).join(", ")} már fizetve — a dátuma pontosítva`,
        });
        continue;
      }

      // Részfizetés: a közlemény egyetlen nyitott számlára hivatkozik, és az
      // utalás kevesebb, mint annak hátraléka — a számla nyitva marad, csak a
      // hátralék csökken; a következő utalás (akár ugyanebben a feltöltésben)
      // zárja majd le. Több számla közti részleges megosztást nem találgatunk.
      if (nyitottHiv.length === 1 && cel < szabadCent(nyitottHiv[0])) {
        const sz = nyitottHiv[0];
        const marad = szabadCent(sz) - cel;
        kesz({
          allapot: "resz", mod: "memo", szamlak: jeloltek([sz]), kivalasztottIdk: [sz.id],
          megjegyzes: `Részfizetés a(z) ${sz.szamlaszam} számlára: a hátralék ${formatFt(szabadCent(sz), tranz.penznem)}, ebből most ${formatFt(cel, tranz.penznem)} érkezett — könyvelés után marad ${formatFt(marad, tranz.penznem)}, a számla nyitott marad.`,
        });
        continue;
      }

      const elotag = legregebbiElotag(nyitottVevo, cel, szabadCent, nyitottHiv);
      if (elotag) {
        kesz({
          allapot: "review", mod: "legregebbi", szamlak: jeloltek(elotag), kivalasztottIdk: elotag.map((sz) => sz.id),
          megjegyzes: `A közlemény ${lista} számlát említi, de az összeg a vevő legrégebbi ${elotag.length} nyitott számlájával egyezik pontosan.`,
        });
        continue;
      }

      const tobbi = nyitottVevo.filter((sz) => !nyitottHiv.some((h) => h.id === sz.id)).slice(0, 8);
      kesz({
        allapot: "review", mod: "memo", szamlak: jeloltek([...nyitottHiv, ...tobbi]), kivalasztottIdk: nyitottHiv.map((sz) => sz.id),
        megjegyzes: `Összeg-eltérés: az utalás ${formatFt(cel, tranz.penznem)}, a közleményben szereplő nyitott számlák összesen ${formatFt(szabadOsszegCent(nyitottHiv), tranz.penznem)}.`,
      });
      continue;
    }

    if (nyitottVevo.length === 0) {
      // Nincs nyitott számla: talán egy már fizetettként szereplő, de banki
      // utalással még nem igazolt számla befizetése (régi, közlemény nélküli utalás).
      const igazolatlanVevo = azonosPenznem
        .filter((sz) => sz.fizetve && !sz.bankIgazolt && szabad(sz) && sz.kiallitasDatum <= tranz.datum && nevEgyezik(tranz.partnerNev, sz.vevoNev))
        .sort(esedekesseg);
      const egyezoFiz = igazolatlanVevo.filter((sz) => szabadCent(sz) === cel);
      const elotagFiz = egyezoFiz.length > 0 ? [egyezoFiz[0]] : legregebbiElotag(igazolatlanVevo, cel, szabadCent);
      if (elotagFiz) {
        kesz({
          allapot: "datum", mod: egyezoFiz.length > 0 ? "osszeg" : "legregebbi", szamlak: jeloltek(elotagFiz), kivalasztottIdk: elotagFiz.map((sz) => sz.id),
          megjegyzes: egyezoFiz.length > 0
            ? `Nincs számlaszám a közleményben — azonos összegű, már fizetettként szereplő számla${egyezoFiz.length > 1 ? ` (${egyezoFiz.length} közül a legrégebbi)` : ""}; ellenőrizd.`
            : `Nincs számlaszám a közleményben — a vevő ${elotagFiz.length} legrégebbi, már fizetettként szereplő számlájának összege kiadja; ellenőrizd.`,
        });
        continue;
      }
      eredmeny.set(tranz.kulcs, {
        tranzakcio: tranz, allapot: "egyeb", mod: null, szamlak: [], kivalasztottIdk: [],
        megjegyzes: "Nincs ehhez a partnerhez nyitott számla.",
      });
      continue;
    }

    const egyezok = nyitottVevo.filter((sz) => szabadCent(sz) === cel);
    if (egyezok.length === 1 && !vanHivatkozasMinta(tranz)) {
      kesz({
        allapot: "auto", mod: "osszeg", szamlak: jeloltek([egyezok[0]]), kivalasztottIdk: [egyezok[0].id],
        megjegyzes: "összeg-egyezés (egyetlen ilyen összegű nyitott számla)",
      });
      continue;
    }
    if (egyezok.length >= 1) {
      kesz({
        allapot: "review", mod: "legregebbi", szamlak: jeloltek(egyezok.slice(0, 8)), kivalasztottIdk: [egyezok[0].id],
        megjegyzes: egyezok.length > 1
          ? `${egyezok.length} azonos összegű nyitott számla — a legrégebben esedékes van bejelölve.`
          : `A közleményben szereplő számlaszámot nem sikerült azonosítani ("${tranz.memo}") — azonos összegű nyitott számla bejelölve.`,
      });
      continue;
    }

    const elotag = legregebbiElotag(nyitottVevo, cel, szabadCent);
    if (elotag) {
      kesz({
        allapot: "review", mod: "legregebbi", szamlak: jeloltek(elotag), kivalasztottIdk: elotag.map((sz) => sz.id),
        megjegyzes: `Nincs számlaszám a közleményben — a vevő legrégebbi ${elotag.length} nyitott számlájának összege pontosan kiadja.`,
      });
      continue;
    }

    const kombinacio = osszegKombinacio(nyitottVevo, cel, szabadCent);
    if (kombinacio) {
      kesz({
        allapot: "review", mod: "osszeg", szamlak: jeloltek(kombinacio), kivalasztottIdk: kombinacio.map((sz) => sz.id),
        megjegyzes: `Nincs számlaszám a közleményben — ${kombinacio.length} számla összege pontosan kiadja.`,
      });
      continue;
    }

    eredmeny.set(tranz.kulcs, {
      tranzakcio: tranz, allapot: "review", mod: null, szamlak: jeloltek(nyitottVevo.slice(0, 8)), kivalasztottIdk: [],
      megjegyzes: "Nincs pontos összeg-egyezés — jelöld be kézzel, melyik számlát fedezi.",
    });
  }

  return tranzakciok.map((t) => eredmeny.get(t.kulcs)!);
}
