// Partner-törzs automatikus kitöltése — a döntés, adatbázis és hálózat nélkül.
//
// Budaházi Zoltán, 2026-10-19: „a partner fül katasztrófa, rendszert kell
// csinálni, minden hiányzó adatot kitölteni”. 55 partnerből 49-nél nem volt
// postacím, 50-nél számlázási e-mail, egyiknél sem adószám — miközben a saját
// kiállított számláinkon (szamla.raw_xml) és a megbízás-PDF-ekből kiolvasott
// javaslatokban ezek ott voltak, csak senki nem fogadta el őket.
//
// A szabály: CSAK üres mezőt tölt, a meglévőt soha nem írja felül. Források,
// mezőnként sorrendben:
//   adószám, számlázási cím  ← a partnernek kiállított számláink vevő-adata
//   postázási cím            ← a megbízás-PDF kifejezett postacíme (ha egyértelmű)
//                              > a számla postázási címe > a számla vevő-címe
//   számlázási e-mail        ← a számláinkon használt vevő e-mail
//                              > a megbízás-PDF (ha egyértelmű)
//   fizetési határidő (nap)  ← a megbízás-PDF (ha egyértelmű) > a számláink
//                              kiállítás→határidő napjai (medián, kerekítve)
//   papír-határidő (nap)     ← csak a megbízás-PDF (máshonnan nem tudható)
// Ha a partnerhez illő számlák KÜLÖNBÖZŐ adószámúak (két cég, hasonló név),
// a számlákból semmit nem tölt — az ember dönt.
//
// Tiszta modul: scripts/teszt-partner-kitoltes.ts teszteli.

import { sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { vevoXmlbol } from "@/lib/fuvarozas2/szamlazasi-seged-alap";
import { hihetoCim, vevoCimSzamlaXmlbol } from "@/lib/fuvarozas2/partner-javaslat-alap";
import { cimSzep } from "@/lib/fuvarozas2/cim-formazas";

export const KITOLTHETO_MEZOK = [
  "adoszam", "szamlazasi_cim", "postazasi_cim", "szamlazasi_email", "fizetesi_hatarido_nap", "papir_bekuldesi_hatarido_nap",
] as const;
export type KitolthetoMezo = (typeof KITOLTHETO_MEZOK)[number];

export const KITOLTES_CIMKE: Record<KitolthetoMezo, string> = {
  adoszam: "Adószám",
  szamlazasi_cim: "Számlázási cím",
  postazasi_cim: "Postázási cím",
  szamlazasi_email: "Számlázási e-mail",
  fizetesi_hatarido_nap: "Fizetési határidő",
  papir_bekuldesi_hatarido_nap: "Papír-határidő",
};

export type KitoltesPartner = {
  id: string;
  nev: string;
  nevvaltozatok: string[];
  adoszam: string | null;
  szamlazasi_cim: string | null;
  postazasi_cim: string | null;
  szamlazasi_email: string | null;
  fizetesi_hatarido_nap: number | null;
  papir_bekuldesi_hatarido_nap: number | null;
  posta_nem_kell: boolean;
  szamla_email_nem_kell: boolean;
};

export type KitoltesSzamla = {
  szamlaszam: string;
  vevo_nev: string;
  kiallitas_datum: string | null; // YYYY-MM-DD
  fizetesi_hatarido: string | null; // YYYY-MM-DD
  raw_xml: string | null;
};

export type KitoltesJavaslat = { mezo: string; ertek: string; forras: string; forras_leiras: string | null };

export type Kitoltes = { mezo: KitolthetoMezo; ertek: string | number; forras: "szamla" | "megbizas_pdf"; leiras: string | null };

/** Hiányzó mezők — a „nem kér postát / e-mailt” jelölésű partnernél az a mező nem hiány. */
export function hianyzoMezok(p: Pick<KitoltesPartner, KitolthetoMezo | "posta_nem_kell" | "szamla_email_nem_kell">): KitolthetoMezo[] {
  return KITOLTHETO_MEZOK.filter((m) => {
    if (m === "postazasi_cim" && p.posta_nem_kell) return false;
    if (m === "szamlazasi_email" && p.szamla_email_nem_kell) return false;
    const v = p[m];
    return v == null || (typeof v === "string" && v.trim() === "");
  });
}

const adoszamTorzs = (a: string | null) => (a ?? "").replace(/\D/g, "").slice(0, 8);

/** A partnernek kiállított (nem saját cégünknek szóló) számlák, a legújabb elöl. */
export function partnerSzamlai(p: Pick<KitoltesPartner, "nev" | "nevvaltozatok" | "adoszam">, szamlak: KitoltesSzamla[]): KitoltesSzamla[] {
  const nevek = [p.nev, ...p.nevvaltozatok];
  const torzs = adoszamTorzs(p.adoszam);
  return szamlak
    .filter((sz) => !sajatCegunkE(sz.vevo_nev))
    .filter((sz) => {
      if (torzs.length === 8) return adoszamTorzs(vevoXmlbol(sz.raw_xml).adoszam) === torzs;
      return partnerEgyezik(sz.vevo_nev, nevek);
    })
    .sort((a, b) => (b.kiallitas_datum ?? "").localeCompare(a.kiallitas_datum ?? ""));
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** „finance@happ.eu, burkus@happ.eu” → érvényes, kisbetűs, egyedi címek „, ”-vel; hibás címek kiesnek. */
export function emailLista(nyers: string | null): string | null {
  const cimek = [...new Set((nyers ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => EMAIL.test(s)))]
    .filter((s) => !/well-?worn/.test(s));
  return cimek.length > 0 ? cimek.join(", ") : null;
}

const SZOKASOS_NAPOK = [8, 15, 30, 45, 60, 90];

/**
 * A számlák kiállítás→határidő napjaiból a jellemző fizetési határidő. A 0 nap
 * (készpénz) kimarad — de ha a partner MINDIG készpénzzel fizetett, az eredmény
 * 0 = „készpénz” (Budaházi Zoltán, 2026-10-19: Tímár Dávid kp-s, nem hiány).
 */
export function fizetesiNapSzamlakbol(szamlak: KitoltesSzamla[]): number | null {
  const osszes = szamlak
    .slice(0, 12)
    .filter((sz) => sz.kiallitas_datum && sz.fizetesi_hatarido)
    .map((sz) => Math.round((Date.parse(`${sz.fizetesi_hatarido!.slice(0, 10)}T12:00:00Z`) - Date.parse(`${sz.kiallitas_datum!.slice(0, 10)}T12:00:00Z`)) / 86400000));
  if (osszes.length > 0 && osszes.every((n) => n === 0)) return 0;
  const napok = szamlak
    .slice(0, 12)
    .map((sz) => {
      if (!sz.kiallitas_datum || !sz.fizetesi_hatarido) return NaN;
      return Math.round((Date.parse(`${sz.fizetesi_hatarido.slice(0, 10)}T12:00:00Z`) - Date.parse(`${sz.kiallitas_datum.slice(0, 10)}T12:00:00Z`)) / 86400000);
    })
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 120)
    .sort((a, b) => a - b);
  if (napok.length === 0) return null;
  const median = napok[Math.floor(napok.length / 2)];
  const kozeli = SZOKASOS_NAPOK.find((s) => Math.abs(s - median) <= 3);
  return kozeli ?? median;
}

const cimKulcs = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^h-?\s*/, "").replace(/utca|u\./g, "u").replace(/[^a-z0-9]/g, "");

/** A javaslatok közül egy mező EGYÉRTELMŰ értéke (egy forrásból; a betű-/írásmód-eltérés nem számít). */
function egyertelmu(javaslatok: KitoltesJavaslat[], mezo: string, forras: string): KitoltesJavaslat | null {
  const j = javaslatok.filter((x) => x.mezo === mezo && x.forras === forras);
  if (j.length === 0) return null;
  const kulcsok = new Set(j.map((x) => (mezo === "postazasi_cim" ? cimKulcs(x.ertek) : x.ertek.trim().toLowerCase())));
  return kulcsok.size === 1 ? j[0] : null;
}

/** Egy partner kitöltési terve: csak a hiányzó mezőkre, forrással. */
export function kitoltesTerv(p: KitoltesPartner, osszesSzamla: KitoltesSzamla[], javaslatok: KitoltesJavaslat[]): Kitoltes[] {
  if (sajatCegunkE(p.nev)) return [];
  const hiany = new Set(hianyzoMezok(p));
  if (hiany.size === 0) return [];
  const ki: Kitoltes[] = [];

  let szamlak = partnerSzamlai(p, osszesSzamla);
  const adoszamok = new Set(szamlak.map((sz) => adoszamTorzs(vevoXmlbol(sz.raw_xml).adoszam)).filter((a) => a.length === 8));
  if (adoszamok.size > 1) szamlak = []; // két különböző cég: nem találgatunk
  const legujabb = szamlak[0] ?? null;
  const vevo = legujabb ? vevoXmlbol(legujabb.raw_xml) : null;

  if (hiany.has("adoszam") && vevo?.adoszam && /^\d{8}-?\d-?\d{2}$/.test(vevo.adoszam)) {
    ki.push({ mezo: "adoszam", ertek: vevo.adoszam, forras: "szamla", leiras: legujabb!.szamlaszam });
  }
  if (hiany.has("szamlazasi_cim") && vevo?.telepules && vevo.cim) {
    const cim = `${vevo.irsz ? `${vevo.irsz} ` : ""}${vevo.telepules}, ${vevo.cim}`.replace(/\s+/g, " ");
    if (hihetoCim(cim)) ki.push({ mezo: "szamlazasi_cim", ertek: cimSzep(cim), forras: "szamla", leiras: legujabb!.szamlaszam });
  }
  if (hiany.has("postazasi_cim")) {
    const pdf = egyertelmu(javaslatok, "postazasi_cim", "megbizas_pdf");
    const szamlaCim = legujabb ? vevoCimSzamlaXmlbol(legujabb.raw_xml) : null;
    if (pdf && hihetoCim(pdf.ertek)) ki.push({ mezo: "postazasi_cim", ertek: cimSzep(pdf.ertek), forras: "megbizas_pdf", leiras: pdf.forras_leiras });
    else if (szamlaCim) ki.push({ mezo: "postazasi_cim", ertek: cimSzep(szamlaCim), forras: "szamla", leiras: legujabb!.szamlaszam });
  }
  if (hiany.has("szamlazasi_email")) {
    const szamlaEmail = szamlak.map((sz) => ({ sz, e: emailLista(vevoXmlbol(sz.raw_xml).email) })).find((x) => x.e);
    const pdf = egyertelmu(javaslatok, "szamlazasi_email", "megbizas_pdf");
    const pdfEmail = pdf ? emailLista(pdf.ertek) : null;
    if (szamlaEmail) ki.push({ mezo: "szamlazasi_email", ertek: szamlaEmail.e!, forras: "szamla", leiras: szamlaEmail.sz.szamlaszam });
    else if (pdf && pdfEmail) ki.push({ mezo: "szamlazasi_email", ertek: pdfEmail, forras: "megbizas_pdf", leiras: pdf.forras_leiras });
  }
  if (hiany.has("fizetesi_hatarido_nap")) {
    const pdf = egyertelmu(javaslatok, "fizetesi_hatarido_nap", "megbizas_pdf");
    const szamlabol = fizetesiNapSzamlakbol(szamlak);
    if (pdf && Number(pdf.ertek) > 0) ki.push({ mezo: "fizetesi_hatarido_nap", ertek: Number(pdf.ertek), forras: "megbizas_pdf", leiras: pdf.forras_leiras });
    else if (szamlabol != null) ki.push({ mezo: "fizetesi_hatarido_nap", ertek: szamlabol, forras: "szamla", leiras: `${Math.min(szamlak.length, 12)} számla alapján` });
  }
  if (hiany.has("papir_bekuldesi_hatarido_nap")) {
    const pdf = egyertelmu(javaslatok, "papir_bekuldesi_hatarido_nap", "megbizas_pdf");
    if (pdf && Number(pdf.ertek) > 0) ki.push({ mezo: "papir_bekuldesi_hatarido_nap", ertek: Number(pdf.ertek), forras: "megbizas_pdf", leiras: pdf.forras_leiras });
  }
  return ki;
}
