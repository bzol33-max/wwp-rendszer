// Számlázz.hu partner-export (CSV) → partner-törzs kitöltés — tiszta modul,
// adatbázis nélkül (scripts/teszt-partner-szamlazz.ts teszteli).
//
// 2026-11-18 (tulajdonos: „minden adat minden partnernél meglegyen”): a
// Számlázz.hu partnerlistája a hivatalos név, székhely, adószám, számlázási
// e-mail, fizetési határidő és (ha van) postacím forrása. Csak az ÜRES mezőket
// tölti; a Számlázz.hu-s nevet névváltozatként felveszi, hogy a számlák is a
// partnerhez párosuljanak (FABRIKA + 2000 ↔ Fabrika 2000). Új partnert nem hoz
// létre — a listában a raklap-vevők és a magánszemélyek is benne vannak.

import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";
import { sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";

export type SzamlazzPartner = {
  nev: string;
  adoszam: string | null;
  szekhely: string | null;
  postazasiCim: string | null;
  email: string | null;
  fizetesiHataridoNap: number | null;
  keszpenz: boolean;
  penznem: string | null;
};

export type ImportPartner = {
  id: string;
  nev: string;
  nevvaltozatok: string[];
  adoszam: string | null;
  szekhely: string | null;
  szamlazasi_cim: string | null;
  postazasi_cim: string | null;
  szamlazasi_email: string | null;
  fizetesi_hatarido_nap: number | null;
  posta_nem_kell: boolean;
  szamla_email_nem_kell: boolean;
};

export type ImportMezo = "adoszam" | "szekhely" | "szamlazasi_cim" | "postazasi_cim" | "szamlazasi_email" | "fizetesi_hatarido_nap" | "nevvaltozatok";

export type ImportTerv = {
  partnerId: string;
  partnerNev: string;
  szamlazzNev: string;
  /** Mező → új érték (csak ahol a partnernél üres volt). */
  valtozas: Partial<Record<ImportMezo, string | number | string[]>>;
};

/** Egyszerű CSV-olvasó: vessző, idézőjel, „""” escape, több soros mező nélkül. */
export function csvSorok(szoveg: string): string[][] {
  const sorok: string[][] = [];
  for (const sor of szoveg.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!sor.trim()) continue;
    const mezok: string[] = [];
    let akt = "";
    let idezet = false;
    for (let i = 0; i < sor.length; i++) {
      const c = sor[i];
      if (idezet) {
        if (c === '"' && sor[i + 1] === '"') { akt += '"'; i++; }
        else if (c === '"') idezet = false;
        else akt += c;
      } else if (c === '"') idezet = true;
      else if (c === ",") { mezok.push(akt); akt = ""; }
      else akt += c;
    }
    mezok.push(akt);
    sorok.push(mezok.map((m) => m.trim()));
  }
  return sorok;
}

const cim = (irsz: string, telepules: string, utca: string): string | null => {
  const t = [irsz, telepules].filter(Boolean).join(" ");
  const s = [t, utca].filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
  return s && /\d/.test(s) ? s : null;
};

/** A Számlázz.hu partner-export oszlopai név szerint (a fejléc sorrendje változhat). */
export function szamlazzPartnerek(csv: string): SzamlazzPartner[] {
  const sorok = csvSorok(csv);
  if (sorok.length < 2) return [];
  const fej = sorok[0].map((f) => f.toLowerCase());
  const idx = (nev: string) => fej.findIndex((f) => f === nev);
  const iNev = idx("partner neve"), iIrsz = idx("irányítószám"), iTel = idx("település"), iUtca = idx("utca és házszám");
  const iPIrsz = idx("postacím: irányítószám"), iPTel = idx("postacím: település"), iPUtca = idx("postacím: utca és házszám");
  const iAdo = idx("adószám"), iKozAdo = idx("közösségi adószám"), iEmail = idx("email cím"), iFiz = idx("fizetési határidő (nap)"), iMod = idx("alapértelmezett fizetési mód"), iDev = idx("devizanem");
  if (iNev < 0) return [];
  const ki: SzamlazzPartner[] = [];
  for (const s of sorok.slice(1)) {
    const g = (i: number) => (i >= 0 ? (s[i] ?? "") : "");
    // A Számlázz.hu-ban idézőjeles nevek („"HAPP" Kft.”, „BALKÁNYI Vetőmag KFT."”) — az idézőjel nem a név része.
    const nev = g(iNev).replace(/"/g, "").replace(/\s+/g, " ").trim();
    if (!nev) continue;
    const ado = g(iAdo).replace(/\s/g, "");
    const kozAdo = g(iKozAdo).replace(/\s/g, "");
    const email = g(iEmail).split(/[,;]\s*/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)).join(", ");
    const fiz = Number(g(iFiz));
    const keszpenz = /készpénz/i.test(g(iMod));
    ki.push({
      nev,
      adoszam: /^\d{8}-?\d-?\d{2}$/.test(ado) ? ado : kozAdo || null,
      szekhely: cim(g(iIrsz), g(iTel), g(iUtca)),
      postazasiCim: cim(g(iPIrsz), g(iPTel), g(iPUtca)),
      email: email || null,
      fizetesiHataridoNap: Number.isInteger(fiz) && fiz > 0 ? fiz : keszpenz ? 0 : null,
      keszpenz,
      penznem: g(iDev) || null,
    });
  }
  return ki;
}

const adoTorzs = (a: string | null) => (a ?? "").replace(/\D/g, "").slice(0, 8);

/** Számlázz.hu-partner a törzs egy partneréhez: adószám-törzs szerint, különben név szerint (egyértelmű találat kell). */
export function parositSzamlazzPartnert(p: ImportPartner, lista: SzamlazzPartner[]): { sz: SzamlazzPartner; alap: "adoszam" | "nev" } | null {
  const t = adoTorzs(p.adoszam);
  if (t.length === 8) {
    const a = lista.filter((x) => adoTorzs(x.adoszam) === t);
    if (a.length === 1) return { sz: a[0], alap: "adoszam" };
  }
  const nevek = [p.nev, ...p.nevvaltozatok];
  const n = lista.filter((x) => partnerEgyezik(x.nev, nevek));
  if (n.length === 1) return { sz: n[0], alap: "nev" };
  // Több névtalálat (pl. SOLINWEST 2000 / SOLINWEST AGRO): ha az egyik pontosan a partner neve, az.
  const pontos = n.filter((x) => x.nev.toLowerCase() === p.nev.toLowerCase());
  return pontos.length === 1 ? { sz: pontos[0], alap: "nev" } : null;
}

/** Egy partner kitöltési terve — csak az üres mezők, meg a névváltozat. */
export function szamlazzTerv(p: ImportPartner, sz: SzamlazzPartner): ImportTerv | null {
  if (sajatCegunkE(p.nev)) return null;
  const v: ImportTerv["valtozas"] = {};
  if (!p.adoszam && sz.adoszam) v.adoszam = sz.adoszam;
  if (!p.szekhely && sz.szekhely) v.szekhely = sz.szekhely;
  if (!p.szamlazasi_cim && sz.szekhely) v.szamlazasi_cim = sz.szekhely;
  if (!p.postazasi_cim && !p.posta_nem_kell && (sz.postazasiCim ?? sz.szekhely)) v.postazasi_cim = sz.postazasiCim ?? sz.szekhely!;
  if (!p.szamlazasi_email && !p.szamla_email_nem_kell && sz.email) v.szamlazasi_email = sz.email;
  if (p.fizetesi_hatarido_nap == null && sz.fizetesiHataridoNap != null) v.fizetesi_hatarido_nap = sz.fizetesiHataridoNap;
  const nevek = [p.nev, ...p.nevvaltozatok].map((x) => x.toLowerCase());
  if (!nevek.includes(sz.nev.toLowerCase())) v.nevvaltozatok = [...p.nevvaltozatok, sz.nev];
  return Object.keys(v).length ? { partnerId: p.id, partnerNev: p.nev, szamlazzNev: sz.nev, valtozas: v } : null;
}

/** A teljes terv: párosítás + kitöltés, és a párosítatlan partnerek neve. */
export function szamlazzImportTerv(partnerek: ImportPartner[], csv: string): { tervek: ImportTerv[]; parositatlan: string[]; szamlazzDb: number } {
  const lista = szamlazzPartnerek(csv);
  const tervek: ImportTerv[] = [];
  const parositatlan: string[] = [];
  const talalatok = partnerek.filter((p) => !sajatCegunkE(p.nev)).map((p) => ({ p, m: parositSzamlazzPartnert(p, lista) }));
  // Ha egy Számlázz.hu-partner NÉV alapján több törzs-partnerre illik (PÁNTYA Kft. ↔
  // Pántya Gáborné és PÁNTYA Teherfuvarozó, 2026-11-18), egyikhez sem kötjük —
  // rossz partnerhez kerülne a számla. Adószám-találat nem számít ütközésnek.
  const nevSzerint = new Map<string, number>();
  for (const { m } of talalatok) if (m) nevSzerint.set(m.sz.nev, (nevSzerint.get(m.sz.nev) ?? 0) + 1);
  for (const { p, m } of talalatok) {
    if (!m || (m.alap === "nev" && (nevSzerint.get(m.sz.nev) ?? 0) > 1)) { parositatlan.push(m ? `${p.nev} (többértelmű: ${m.sz.nev})` : p.nev); continue; }
    const t = szamlazzTerv(p, m.sz);
    if (t) tervek.push(t);
  }
  return { tervek, parositatlan, szamlazzDb: lista.length };
}
