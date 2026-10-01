// Partner-adat javaslatok — a döntés, adatbázis és hálózat nélkül.
//
// A megbízás PDF-jéből (a fejléccel együtt, képként is olvasva) és a korábbi
// számlák vevőcíméből javaslat készül a partner hiányzó adataira: postázási
// cím, számlázási e-mail, papír-beküldési és fizetési határidő (Budaházi
// Zoltán, 2026-10-01 — a Flexlog címe a megbízás fejlécében volt, de nem
// szövegként, ezért a szöveges kiolvasás sosem látta). A javaslat nem írja
// felül a partnert: ember fogadja el („Átveszem”).
//
// Tiszta modul: scripts/teszt-partner-javaslat.ts teszteli.

import { sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";

export const JAVASLAT_MEZOK = ["postazasi_cim", "szamlazasi_email", "papir_bekuldesi_hatarido_nap", "fizetesi_hatarido_nap"] as const;
export type JavaslatMezo = (typeof JAVASLAT_MEZOK)[number];

export const JAVASLAT_CIMKE: Record<JavaslatMezo, string> = {
  postazasi_cim: "Postázási cím",
  szamlazasi_email: "Számlázási e-mail",
  papir_bekuldesi_hatarido_nap: "Papír-határidő (nap)",
  fizetesi_hatarido_nap: "Fizetési határidő (nap)",
};

/** Amit a modell a megbízás PDF-jéből visszaad (nyersen, ellenőrizetlenül). */
export type NyersKiolvasas = {
  megbizoNev?: unknown;
  postazasiCim?: unknown;
  szamlazasiEmail?: unknown;
  papirHataridoNap?: unknown;
  fizetesiHataridoNap?: unknown;
};

export type Javaslat = { mezo: JavaslatMezo; ertek: string };

const szoveg = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim().replace(/\s+/g, " ") : null);

/** A mi címünk (a megbízás címzettje) sosem lehet a megbízó postacíme. */
export function sajatCimE(cim: string): boolean {
  const k = cim.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /szakoly/.test(k) || /well\s*-?\s*worn/.test(k);
}

/** Hihető postacím: van benne település-szerű szó és házszám vagy irányítószám, nem a miénk. */
export function hihetoCim(cim: string): boolean {
  if (cim.length < 8 || cim.length > 200) return false;
  if (sajatCimE(cim)) return false;
  return /\d/.test(cim) && /[a-záéíóöőúüű]{3,}/i.test(cim);
}

function napSzam(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(/[^\d]/g, "")) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 180 ? n : null;
}

/**
 * A modell válaszából a partnerre vonatkozó, ellenőrzött javaslatok. Ha a
 * modell más megbízót nevez meg, mint a partner, semmit nem javasol (rossz
 * irat vagy félreolvasás) — a „nem tudom” jobb, mint a rossz cím.
 */
export function javaslatokKiolvasasbol(nyers: NyersKiolvasas | null, partnerNevek: string[]): Javaslat[] {
  if (!nyers) return [];
  const megbizo = szoveg(nyers.megbizoNev);
  if (megbizo && (sajatCegunkE(megbizo) || !partnerEgyezik(megbizo, partnerNevek))) return [];
  const ki: Javaslat[] = [];
  const cim = szoveg(nyers.postazasiCim);
  if (cim && hihetoCim(cim)) ki.push({ mezo: "postazasi_cim", ertek: cim });
  const email = szoveg(nyers.szamlazasiEmail)?.toLowerCase() ?? null;
  if (email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) && !/well-?worn/.test(email)) ki.push({ mezo: "szamlazasi_email", ertek: email });
  const papir = napSzam(nyers.papirHataridoNap);
  if (papir != null) ki.push({ mezo: "papir_bekuldesi_hatarido_nap", ertek: String(papir) });
  const fiz = napSzam(nyers.fizetesiHataridoNap);
  if (fiz != null) ki.push({ mezo: "fizetesi_hatarido_nap", ertek: String(fiz) });
  return ki;
}

function xmlErtek(blokk: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(blokk);
  if (!m) return null;
  const v = m[1]
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
  return v || null;
}

/**
 * A Számlázz.hu számla-XML-jéből (szamla.raw_xml) a vevő címe: ha van külön
 * postázási cím, az, különben a vevő címe. „1106 Budapest, Jászberényi út 45.”
 * alakban; ha nem olvasható ki, null.
 */
export function vevoCimSzamlaXmlbol(xml: string | null): string | null {
  if (!xml) return null;
  const vevo = /<vevo>([\s\S]*?)<\/vevo>/i.exec(xml)?.[1];
  if (!vevo) return null;
  const cimBlokk = (nev: string) => new RegExp(`<${nev}>([\\s\\S]*?)</${nev}>`, "i").exec(vevo)?.[1] ?? null;
  for (const blokk of [cimBlokk("postazasicim"), cimBlokk("postacim"), cimBlokk("cim"), vevo]) {
    if (!blokk) continue;
    const irsz = xmlErtek(blokk, "irsz") ?? xmlErtek(blokk, "postazasiIrsz");
    const telepules = xmlErtek(blokk, "telepules") ?? xmlErtek(blokk, "postazasiTelepules");
    const utca = xmlErtek(blokk, "cim") ?? xmlErtek(blokk, "postazasiCim");
    if (telepules && utca) {
      const cim = `${irsz ? `${irsz} ` : ""}${telepules}, ${utca}`.replace(/\s+/g, " ");
      return hihetoCim(cim) ? cim : null;
    }
  }
  return null;
}
