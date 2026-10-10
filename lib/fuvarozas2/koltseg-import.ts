// Költség-importok — a TISZTA rész (se DB, se hálózat, se fájlrendszer):
//   • HU-GO útdíj-tranzakciók táblázata (a portál CSV/XLSX exportja, már
//     soronként cellákra bontva) → tranzakciók, ismétlődés-kulccsal;
//   • az Oplusz-kút „Értesítés bizonylat készítésről" levelének szövege →
//     egy tankolás (időpont, tranzakciószám, összeg, rendszám, ha van: liter).
// A fájl beolvasása (exceljs) és az írás a lib/fuvarozas2/koltsegek-core.ts-ben
// van; ezt a modult a scripts/teszt-koltseg.ts ellenőrzi.
//
// A HU-GO export oszlopai NEM rögzítettek (a portál időnként átnevezi őket,
// és a felhasználó Excelben is átrendezheti): a fejlécsort a nevek alapján
// keressük meg — dátum/időpont, rendszám, összeg (bruttó), és ha van:
// nettó, útszakasz, km, kategória, azonosító.

import { findJarmuByPlate, type SajatJarmu } from "@/lib/fuvarozas/vehicles";

export type Cella = string | number | boolean | Date | null | undefined;

// ---------------------------------------------------------------------------
// Számok és időpontok

/**
 * Magyar és nemzetközi számalakok: "5 002,00", "5 002,00 Ft", "5.002,00",
 * "5002.5", "1,234,567", "-12,5", nem törő szóközzel is. Ha CSAK pont van
 * benne, tizedespontnak vesszük ("12.5"); ha CSAK vessző, tizedesvesszőnek
 * (kivéve a több vesszős ezres tagolást).
 */
export function szamHu(v: Cella): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v instanceof Date) return null;
  let s = String(v).trim().replace(/[\s  ']/g, "").replace(/(Ft|HUF|EUR|€|l|liter|km)\.?$/i, "");
  if (!s) return null;
  if (!/^[-+]?[0-9.,]+$/.test(s)) return null;
  const pont = s.lastIndexOf(".");
  const vesszo = s.lastIndexOf(",");
  if (pont >= 0 && vesszo >= 0) {
    // Az utolsó elválasztó a tizedes, a másik az ezres tagolás.
    if (vesszo > pont) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (vesszo >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ket = (n: number) => String(n).padStart(2, "0");

/**
 * Falióra szerinti időpont "YYYY-MM-DD HH:MM:SS" alakban (budapesti idő — az
 * adatbázisba `at time zone 'Europe/Budapest'`-tel kerül). Elfogad:
 * Date-et (az exceljs a cella faliórás értékét UTC-ként adja), Excel
 * sorszám-dátumot, "2026.09.27 17:43:41", "2026-09-27T17:43", "27.09.2026 17:43".
 */
export function idopontHu(v: Cella, idoCella?: Cella): string | null {
  let ev: number, ho: number, nap: number, ora = 0, perc = 0, mp = 0;
  let vanIdo = false;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    ev = v.getUTCFullYear(); ho = v.getUTCMonth() + 1; nap = v.getUTCDate();
    ora = v.getUTCHours(); perc = v.getUTCMinutes(); mp = v.getUTCSeconds();
    vanIdo = ora + perc + mp > 0;
  } else if (typeof v === "number") {
    if (!(v > 20000 && v < 80000)) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    ev = d.getUTCFullYear(); ho = d.getUTCMonth() + 1; nap = d.getUTCDate();
    ora = d.getUTCHours(); perc = d.getUTCMinutes(); mp = d.getUTCSeconds();
    vanIdo = v % 1 !== 0;
  } else if (typeof v === "string") {
    const s = v.trim();
    let m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) {
      ev = +m[1]; ho = +m[2]; nap = +m[3];
    } else {
      m = /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})\.?(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
      if (!m) return null;
      ev = +m[3]; ho = +m[2]; nap = +m[1];
    }
    if (m[4] != null) { ora = +m[4]; perc = +m[5]; mp = m[6] != null ? +m[6] : 0; vanIdo = true; }
  } else {
    return null;
  }
  if (!vanIdo && idoCella != null && idoCella !== "") {
    if (idoCella instanceof Date) {
      ora = idoCella.getUTCHours(); perc = idoCella.getUTCMinutes(); mp = idoCella.getUTCSeconds();
    } else if (typeof idoCella === "number" && idoCella >= 0 && idoCella < 1) {
      const s = Math.round(idoCella * 86400);
      ora = Math.floor(s / 3600); perc = Math.floor((s % 3600) / 60); mp = s % 60;
    } else {
      const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(idoCella));
      if (t) { ora = +t[1]; perc = +t[2]; mp = t[3] != null ? +t[3] : 0; }
    }
  }
  if (ev < 2000 || ev > 2100 || ho < 1 || ho > 12 || nap < 1 || nap > 31 || ora > 23 || perc > 59 || mp > 59) return null;
  return `${ev}-${ket(ho)}-${ket(nap)} ${ket(ora)}:${ket(perc)}:${ket(mp)}`;
}

// ---------------------------------------------------------------------------
// CSV

/** Egyszerű CSV-bontó idézőjel-kezeléssel; az elválasztót (; tab ,) az első sorokból választja. */
export function csvSorok(szoveg: string): string[][] {
  const tiszta = szoveg.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const minta = tiszta.split("\n").filter((l) => l.trim()).slice(0, 10).join("\n");
  const darab = (c: string) => minta.split(c).length - 1;
  const jelolt = [";", "\t", ","].map((c) => ({ c, n: darab(c) })).sort((a, b) => b.n - a.n)[0];
  const elv = jelolt && jelolt.n > 0 ? jelolt.c : ";";
  const sorok: string[][] = [];
  let sor: string[] = [];
  let mezo = "";
  let idezet = false;
  for (let i = 0; i < tiszta.length; i++) {
    const ch = tiszta[i];
    if (idezet) {
      if (ch === '"') {
        if (tiszta[i + 1] === '"') { mezo += '"'; i++; } else idezet = false;
      } else mezo += ch;
    } else if (ch === '"') idezet = true;
    else if (ch === elv) { sor.push(mezo); mezo = ""; }
    else if (ch === "\n") { sor.push(mezo); sorok.push(sor); sor = []; mezo = ""; }
    else mezo += ch;
  }
  if (mezo !== "" || sor.length > 0) { sor.push(mezo); sorok.push(sor); }
  return sorok.map((r) => r.map((c) => c.trim()));
}

// ---------------------------------------------------------------------------
// HU-GO

export type HuGoTranzakcio = {
  /** A forrásfájl sorszáma (1-től), a hibák visszajelzéséhez. */
  sor: number;
  /** "YYYY-MM-DD HH:MM:SS", budapesti falióra. */
  idopont: string;
  rendszam: string;
  bruttoFt: number;
  nettoFt: number | null;
  tavKm: number | null;
  szakasz: string | null;
  kategoria: string | null;
  /** Ismétlődés-kulcs (utdij_tranzakcio.kulso_azonosito) — ugyanaz a sor újraimportálva ugyanazt adja. */
  kulsoAzonosito: string;
  /** fuvar_jarmuvek.id, ha a rendszám saját kocsié (a pótkocsi rendszáma is). */
  jarmuId: string | null;
  jarmuKod: string | null;
};

export type HuGoBeolvasas = {
  tranzakciok: HuGoTranzakcio[];
  /** Oszlop → a felismert fejléc szövege. */
  oszlopok: Record<string, string>;
  hibak: string[];
  /** Üres / összesítő / fájlon belül ismétlődő sorok. */
  kihagyott: number;
  /** A fájlon belül kétszer szereplő sorok száma (benne van a kihagyottban). */
  ismetlodo: number;
};

type OszlopKulcs = "idopont" | "ido" | "rendszam" | "brutto" | "netto" | "km" | "szakasz" | "kategoria" | "azonosito";

function normFej(c: Cella): string {
  return String(c ?? "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

/** A fejlécsor oszlopai a nevek alapján (az első illeszkedő oszlop nyer, egy oszlop csak egy szerepet kap). */
export function huGoOszlopok(fej: Cella[]): Partial<Record<OszlopKulcs, number>> {
  const nevek = fej.map(normFej);
  const ki: Partial<Record<OszlopKulcs, number>> = {};
  const foglalt = new Set<number>();
  const keres = (kulcs: OszlopKulcs, igen: RegExp, nem?: RegExp) => {
    const i = nevek.findIndex((n, idx) => n && !foglalt.has(idx) && igen.test(n) && !(nem && nem.test(n)));
    if (i >= 0) { ki[kulcs] = i; foglalt.add(i); }
  };
  keres("rendszam", /rendsz[áa]m|license|plate|kennzeichen/);
  keres("netto", /nett[óo]|\bnet\b/);
  keres("brutto", /brutt[óo]|gross/);
  if (ki.brutto == null) keres("brutto", /fizetend|[öo]sszeg|\bd[íi]j\b|d[íi]j \(|amount|total|[úu]td[íi]j/, /nett[óo]|[áa]fa|vat|kateg/);
  keres("km", /\bkm\b|t[áa]vols[áa]g|hossz|distance|length/);
  keres("idopont", /d[áa]tum|id[őo]pont|date|time|kezdete|bel[ée]p[ée]s/, /k[ée]sz[íi]t|import|lej[áa]rat/);
  keres("ido", /^(id[őo]|[óo]ra|time)$/);
  keres("szakasz", /szakasz|section|[úu]tvonal|route|\b[úu]t\b|road/);
  keres("kategoria", /kateg[óo]ria|category|\bd-?kat/);
  keres("azonosito", /tranzakci[óo]|azonos[íi]t[óo]|\bid\b|sorsz[áa]m|transaction|bizonylat/);
  return ki;
}

function cellaSzoveg(c: Cella): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}

/**
 * A HU-GO export sorai (már cellákra bontva, az első munkalap vagy a CSV) →
 * tranzakciók. A fejlécsort az első 20 sorban keresi (a portál exportja
 * fölött lehet cím- és szűrősor). `jarmuvek`: a saját kocsik listája
 * (getJarmuvek()) a rendszám → jármű megfeleltetéshez.
 */
export function parseHuGoTabla(sorok: Cella[][], jarmuvek?: SajatJarmu[]): HuGoBeolvasas {
  const hibak: string[] = [];
  let fejIdx = -1;
  let oszl: Partial<Record<OszlopKulcs, number>> = {};
  for (let i = 0; i < Math.min(sorok.length, 20); i++) {
    const o = huGoOszlopok(sorok[i] ?? []);
    if (o.idopont != null && o.rendszam != null && o.brutto != null) { fejIdx = i; oszl = o; break; }
  }
  if (fejIdx < 0) {
    return {
      tranzakciok: [], oszlopok: {}, kihagyott: 0, ismetlodo: 0,
      hibak: ["Nem találtam a fejlécsort: kell egy dátum/időpont, egy rendszám és egy (bruttó) összeg oszlop."],
    };
  }
  const fej = sorok[fejIdx];
  const oszlopok: Record<string, string> = {};
  for (const [k, i] of Object.entries(oszl)) oszlopok[k] = cellaSzoveg(fej[i as number]);

  const ki: HuGoTranzakcio[] = [];
  const latott = new Set<string>();
  let kihagyott = 0;
  let ismetlodo = 0;
  for (let i = fejIdx + 1; i < sorok.length; i++) {
    const r = sorok[i] ?? [];
    const sorSzam = i + 1;
    const get = (k: OszlopKulcs) => (oszl[k] != null ? r[oszl[k] as number] : undefined);
    if (r.every((c) => cellaSzoveg(c) === "")) { kihagyott++; continue; }
    const rendszamNyers = cellaSzoveg(get("rendszam"));
    if (/[öo]sszes|total|summe/i.test(r.map(cellaSzoveg).join(" ")) && !rendszamNyers) { kihagyott++; continue; }
    const idopont = idopontHu(get("idopont"), get("ido"));
    const brutto = szamHu(get("brutto"));
    if (!idopont || brutto == null || !rendszamNyers) {
      hibak.push(`${sorSzam}. sor: ${!idopont ? "érvénytelen dátum" : brutto == null ? "érvénytelen összeg" : "hiányzó rendszám"}`);
      continue;
    }
    const rendszam = rendszamNyers.toUpperCase().replace(/\s+/g, "");
    const rendszamKulcs = rendszam.replace(/[^A-Z0-9]/g, "");
    const szakasz = cellaSzoveg(get("szakasz")) || null;
    const tavKm = szamHu(get("km"));
    const azon = cellaSzoveg(get("azonosito"));
    const kulsoAzonosito = `hugo:${[azon, idopont, rendszamKulcs, Math.round(brutto * 100), szakasz ?? "", tavKm ?? ""].join("|")}`;
    if (latott.has(kulsoAzonosito)) { kihagyott++; ismetlodo++; continue; }
    latott.add(kulsoAzonosito);
    const jarmu = findJarmuByPlate(rendszam, jarmuvek);
    ki.push({
      sor: sorSzam,
      idopont,
      rendszam,
      bruttoFt: Math.round(brutto),
      nettoFt: (() => { const n = szamHu(get("netto")); return n == null ? null : Math.round(n); })(),
      tavKm,
      szakasz,
      kategoria: cellaSzoveg(get("kategoria")) || null,
      kulsoAzonosito,
      jarmuId: jarmu?.id ?? null,
      jarmuKod: jarmu?.kod ?? null,
    });
  }
  return { tranzakciok: ki, oszlopok, hibak, kihagyott, ismetlodo };
}

// ---------------------------------------------------------------------------
// Oplusz-kút értesítő

export type OpluszTankolas = {
  /** "YYYY-MM-DD HH:MM:SS", budapesti falióra. */
  idopont: string;
  tranzakcioSzam: string;
  osszegFt: number;
  rendszam: string | null;
  liter: number | null;
};

/** Az Oplusz-kút gépi feladója (a levél-osztályozó és a feldolgozó közös mintája). */
export const OPLUSZ_FELADO = /(^|[<\s])opluszbenzinkut@gmail\.com\b/i;
export const OPLUSZ_BIZONYLAT_TARGY = /[ée]rtes[íi]t[ée]s\s+bizonylat\s+k[ée]sz[íi]t[ée]s/i;
export const OPLUSZ_SZAMLA_TARGY = /[ée]rtes[íi]t[ée]s\s+sz[áa]mla\s*k[ée]sz[íi]t[ée]s/i;

/**
 * „Partner: Well-worn Pallet Kft. (…) Vásárlás időpontja: 2026.09.27 17:43:41
 * Vásárlás tranzakciószáma: 1/R/00478709 Vásárlás összege: 5 002,00 Ft
 * Rendszám: AOPU427 …" → tankolás. A liter csak akkor, ha a szöveg tartalmazza
 * ("Mennyiség: 120,50 l", "120,5 liter"). Hiányzó időpont, tranzakciószám vagy
 * összeg → null (nem bizonylat-értesítő, pl. a havi számla-értesítő).
 */
export function parseOpluszErtesites(szoveg: string | null | undefined): OpluszTankolas | null {
  if (!szoveg) return null;
  const s = szoveg.replace(/\s+/g, " ");
  const idoM = /v[áa]s[áa]rl[áa]s id[őo]pontja\s*:?\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s+\d{1,2}:\d{2}(?::\d{2})?)/i.exec(s);
  const tranzM = /tranzakci[óo]sz[áa]ma\s*:?\s*([A-Z0-9][A-Z0-9/\-]*[A-Z0-9])/i.exec(s);
  const osszegM = /v[áa]s[áa]rl[áa]s [öo]sszege\s*:?\s*(-?[0-9][0-9\s .,]*)\s*(?:Ft|HUF)/i.exec(s);
  if (!idoM || !tranzM || !osszegM) return null;
  const idopont = idopontHu(idoM[1]);
  const osszegFt = szamHu(osszegM[1]);
  if (!idopont || osszegFt == null) return null;
  const rendszamM = /rendsz[áa]m\s*:?\s*([A-Z]{3,4}[\s-]?\d{3})\b/i.exec(s);
  const literM =
    /mennyis[ée]g\s*:?\s*([0-9][0-9\s.,]*?)\s*(?:l|liter|ltr)\b/i.exec(s) ??
    /\b([0-9]{1,4}(?:[.,][0-9]{1,3})?)\s*(?:liter|ltr|l)\b(?!\w)/i.exec(s);
  const liter = literM ? szamHu(literM[1]) : null;
  return {
    idopont,
    tranzakcioSzam: tranzM[1].toUpperCase(),
    osszegFt,
    rendszam: rendszamM ? rendszamM[1].toUpperCase().replace(/\s+/g, "") : null,
    liter: liter != null && liter > 0 && liter < 2000 ? liter : null,
  };
}
