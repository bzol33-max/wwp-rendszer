// Fuvarozás 2 — a beérkező levelek osztályozása (E9, „Levelek" fül).
//
// MIÉRT DETERMINISZTIKUS: a levél-osztályozás dönti el, mi megy a Drive-ba
// megbízásként és mi kerül Zoltán teendői közé. Egy nyelvi modell itt
// csendben téved (és a magánlevelek sem mehetnek ki külső szolgáltatóhoz —
// átállás-ellenőrzés S17). A szabályok a VALÓDI postafiók 3 hetének
// mintáiból készültek: a visszatérő megbízók feladó-domainje, a tárgysorok
// alakja (MEGBIZ 09.14 AOPU-427 26/3663 · Fuvarmegbízás (poz: 3003) ·
// Duvenbeck Transportauftrag … Reise/Trip-ID: 23283034 · 2622824 /hu32-hu 40/),
// és a nem-megbízás levelek jellemző szavai (SOS OKMÁNY, hiányzó okmányok,
// Könyvelve, Értesítő: Számla érkezett).
//
// Tiszta modul: nincs DB, nincs hálózat — a scripts/teszt-level-osztalyozo.ts
// kitalált nevekkel ellenőrzi.

import { PARTNEREK, type Partner } from "@/lib/fuvarozas/import/partnerek";
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";

export type LevelOsztaly =
  /** Új fuvarmegbízás — a csatolmány a Drive-ba megy, onnan importálódik. */
  | "megbizas"
  /** Meglévő megbízás módosítása/pontosítása (válasz a szálban, új időpont, plusz utasítás). */
  | "modositas"
  /** A megbízó kérdez / visszaigazolást vár (státusz, mikor rakodtok, megkaptad-e). */
  | "adatkeres"
  /** Okmányt, CMR-t, számlát sürgetnek. */
  | "okmanykeres"
  /** Papírokat, szállítólevelet, adatot KÜLDENEK nekünk. */
  | "papirok"
  /** Fizetés/könyvelés visszajelzés a kimenő számlánkra. */
  | "fizetes"
  /** A Számlázz.hu automatikus értesítője a saját kimenő számlánkról. */
  | "szamla_ertesito"
  /** Timocom kiírás vagy chat — a Radar forrása. */
  | "timocom"
  /** Hírlevél, reklám, állásajánlat. */
  | "reklam"
  /** Nem tudtuk besorolni — ember nézi meg. */
  | "egyeb";

export type LevelBemenet = {
  felado: string;
  targy: string | null;
  /** A levél első pár sora (Gmail snippet) — a törzs NEM kell az osztályozáshoz. */
  snippet: string | null;
  cimzettek?: string[];
  csatolmanyNevek?: string[];
  /** A Gmail szál első üzenete-e (ha false, ez egy válasz). */
  szalElso?: boolean;
};

export type LevelOsztalyozas = {
  osztaly: LevelOsztaly;
  /** 0–100 — 70 felett a felület magától cselekszik (Drive-ba tölt), alatta megkérdez. */
  bizalom: number;
  indoklas: string[];
  partnerKod: string | null;
  partnerNev: string | null;
  /** A tárgyból/snippetből kiolvasott hivatkozási szám, ha van. */
  hivatkozas: string | null;
  /** A tárgyban felismert saját rendszám (a Duvenbeck elírt alakját is). */
  rendszam: string | null;
  /** Kérjük-e a csatolmányt a figyelőtől (csak megbízásnál és papíroknál). */
  csatolmanyKell: boolean;
};

const SZAMLAZZ = /(^|\.)szamlazz\.hu$/i;
const TIMOCOM = /(^|\.)timocom\.com$/i;
const REKLAM_DOMAIN = /(news|newsletter|marketing|info)\..*|dreamjobs\.hu|cargobull\.eu|linkedin\.com|facebookmail\.com/i;
const REKLAM_SZO = /\b(hírlevél|leiratkoz|unsubscribe|akció|webinar|kampány|toborzás|ajánlatunk[a-zé]* csomag)\b/i;

const MEGBIZAS_TARGY = [
  /\bfuvarmegb[íi]z[áa]s/i,
  /\bmegb[íi]z[áa]s\b/i,
  /\bmegbiz\b/i,
  /\balv[áa]llalkoz[óo]i megb[íi]z[áa]s/i,
  /transportauftrag/i,
  /\btransport order\b/i,
  /reise\s*\/?\s*trip[- ]?id/i,
  /\bfuvarlev[ée]l ig[ée]ny/i,
];
const MEGBIZAS_SZOVEG = [
  /csatol(va|tan|om).{0,30}megb[íi]z[áa]s/i,
  /k[üu]ld[öo]m a megb[íi]z[áa]st/i,
  /mell[ée]kelt(en)?.{0,30}(megb[íi]z[áa]s|megrendel[ée]s)/i,
  /a fent eml[íi]tett sz[áa]ll[íi]t[áa]st/i,
  /k[üu]ld[öo]m a holnapi rakod[áa]st/i,
  /csatolom a mai megb[íi]z[áa]st/i,
];
const OKMANYKERES = [
  /\bokm[áa]ny/i,
  /\bcmr\b/i,
  /fuvarokm[áa]ny/i,
  /hi[áa]nyz[óo].{0,20}(sz[áa]mla|okm[áa]ny|papír)/i,
  /\bsz[áa]ml[áa](t|tok|juk)\b.{0,40}(v[áa]r|k[ée]r|k[üu]ld)/i,
  /sc[ae]nnelve|szkennelve/i,
];
const PAPIROK = [
  /^\s*(fw:|fwd:)?\s*pap[íi]rok/i,
  /csatol(va|om).{0,30}(pap[íi]r|okm[áa]ny|cmr|sz[áa]ll[íi]t[óo]lev[ée]l)/i,
  /sz[áa]ll[íi]t[óo]lev[ée]l sz[áa]m/i,
  /palett[aá]sz[áa]m/i,
];
const MODOSITAS = [
  /nem siker[üu]lt/i,
  /m[óo]dos[íi]t/i,
  /v[áa]ltoz(ott|ás|ik)/i,
  /[úu]j id[őo]pont/i,
  /\bhelyett\b/i,
  /menjetek vissza/i,
  /ki[áa]ll[áa]si d[íi]j/i,
  /p[óo]td[íi]j/i,
  /lemond/i,
  /t[öo]r[öo]lve|t[öo]r[öo]lt[üu]k/i,
];
const ADATKERES = [
  /\?\s*$/,
  /jelezz vissza|igazold vissza|visszaigazol/i,
  /megkaptad/i,
  /hol (van|tart)|mikor [ée]r/i,
  /leszedt[ée]k|felrakt[áa]k|lerakt[áa]k/i,
  /k[ée]rlek.{0,40}(k[üu]ldd|jelezd|n[ée]zd)/i,
];
const FIZETES = [
  /k[öo]nyvelve|k[öo]nyvel[ée]sre ker[üu]lt/i,
  /befogad(va|tuk|tva)/i,
  /kiegyenl[íi]t|utal(va|tuk|tunk)/i,
];

/** „poz: 3003", „26/3663", „Reise/Trip-ID: 23283034", „02215-2026", „2622824" */
const HIVATKOZAS_MINTAK: readonly RegExp[] = [
  /reise\s*\/?\s*trip[- ]?id[:\s]*([0-9]{6,})/i,
  /\bpoz(?:[íi]ci[óo]sz[áa]m)?[.:]?\s*([A-Z0-9][A-Z0-9/\-]{2,})/i,
  /\b(\d{2}\/\d{3,5})\b/,
  /\b(\d{5}-\d{4})\b/,
  /\b(\d{7,9})\b/,
];

function domainja(cim: string): string {
  const m = /@([^\s>]+)/.exec(cim.trim().toLowerCase());
  return m ? m[1].replace(/>$/, "") : "";
}

/** Feladó/tárgy/snippet alapján visszatérő megbízó (lib/fuvarozas/import/partnerek.ts ujjlenyomatai). */
export function partnerLevelbol(b: LevelBemenet): Partner | null {
  const szoveg = `${b.felado} ${b.targy ?? ""} ${b.snippet ?? ""}`;
  for (const p of PARTNEREK) {
    if (p.ujjlenyomat.some((r) => r.test(szoveg))) return p;
  }
  return null;
}

function hivatkozasBol(szoveg: string): string | null {
  for (const r of HIVATKOZAS_MINTAK) {
    const m = r.exec(szoveg);
    if (m) return m[1];
  }
  return null;
}

const talal = (mintak: readonly RegExp[], szoveg: string) => mintak.some((r) => r.test(szoveg));
const pdfCsatolmany = (nevek: string[]) => nevek.some((n) => /\.(pdf|docx?|xlsx?)$/i.test(n));

/**
 * Egy levél besorolása. Sorrend számít: a biztosan felismerhető gépi
 * feladók (Számlázz.hu, Timocom) előre, aztán a tartalom.
 */
export function osztalyozLevelet(b: LevelBemenet): LevelOsztalyozas {
  const domain = domainja(b.felado);
  const targy = b.targy ?? "";
  const snippet = b.snippet ?? "";
  const szoveg = `${targy}\n${snippet}`;
  const csatolmanyok = b.csatolmanyNevek ?? [];
  const valasz = b.szalElso === false || /^\s*(re|válasz|fwd|fw|tov[áa]bb[íi]tott)\s*:/i.test(targy);
  const indoklas: string[] = [];
  const partner = partnerLevelbol(b);
  if (partner) indoklas.push(`feladó/szöveg alapján ${partner.nev}`);
  const jarmu = findJarmuInSzoveg(targy);
  const hivatkozas = hivatkozasBol(szoveg);

  const vissza = (osztaly: LevelOsztaly, bizalom: number, csatolmanyKell = false): LevelOsztalyozas => ({
    osztaly,
    bizalom: Math.max(0, Math.min(100, bizalom)),
    indoklas,
    partnerKod: partner?.kod ?? null,
    partnerNev: partner?.nev ?? null,
    hivatkozas,
    rendszam: jarmu?.rendszamok[0] ?? null,
    csatolmanyKell,
  });

  // 1. Gépi feladók.
  if (SZAMLAZZ.test(domain)) {
    indoklas.push("Számlázz.hu automatikus értesítő a kimenő számlánkról");
    return vissza("szamla_ertesito", 99);
  }
  if (TIMOCOM.test(domain)) {
    indoklas.push("Timocom kiírás vagy chat — a Radar forrása");
    return vissza("timocom", 95);
  }
  if ((REKLAM_DOMAIN.test(domain) && !partner) || REKLAM_SZO.test(szoveg)) {
    indoklas.push("hírlevél/reklám jelek");
    return vissza("reklam", 80);
  }

  // 2. Fizetési visszajelzés (a saját számlánk szálában).
  if (talal(FIZETES, szoveg)) {
    indoklas.push("fizetési/könyvelési visszajelzés");
    return vissza("fizetes", 85);
  }

  // 3. Okmány- és papír-ügyek — ezek gyakran a megbízás szavát is tartalmazzák,
  //    ezért a megbízás-vizsgálat ELŐTT döntünk róluk.
  if (talal(OKMANYKERES, szoveg) && !talal(MEGBIZAS_TARGY, targy)) {
    const sos = /\bsos\b|s[üu]rg[őo]s|mihamarabb/i.test(szoveg);
    indoklas.push(sos ? "okmányt sürgetnek" : "okmányt/CMR-t kérnek");
    return vissza("okmanykeres", sos ? 90 : 80);
  }
  if (talal(PAPIROK, szoveg)) {
    indoklas.push("papírokat/adatot küldenek");
    return vissza("papirok", 75, pdfCsatolmany(csatolmanyok));
  }

  // 4. Megbízás: tárgy vagy szöveg + (visszatérő partner VAGY irat-csatolmány).
  const targyJel = talal(MEGBIZAS_TARGY, targy);
  const szovegJel = talal(MEGBIZAS_SZOVEG, szoveg);
  const iratVan = pdfCsatolmany(csatolmanyok);
  if ((targyJel || szovegJel) && !valasz) {
    let b0 = 55;
    if (targyJel) { b0 += 20; indoklas.push("a tárgy megbízásra utal"); }
    if (szovegJel) { b0 += 10; indoklas.push("a szöveg megbízást említ"); }
    if (iratVan) { b0 += 10; indoklas.push(`csatolmány: ${csatolmanyok.join(", ")}`); }
    if (partner) b0 += 10;
    if (jarmu) { b0 += 5; indoklas.push(`saját rendszám a tárgyban: ${jarmu.rendszamok[0]}`); }
    if (!iratVan) indoklas.push("nincs irat-csatolmány — kézi ellenőrzés kell");
    return vissza("megbizas", b0, iratVan);
  }
  // Duvenbeck/ÁB Speed/Ghibli: a tárgy csak szám és rendszám, a partner adja a biztosat.
  if (partner && iratVan && !valasz && (jarmu || hivatkozas)) {
    indoklas.push("visszatérő megbízó + irat + azonosító a tárgyban");
    return vissza("megbizas", 80, true);
  }

  // 5. Válaszok a megbízás szálában.
  if (valasz || partner) {
    if (talal(MODOSITAS, szoveg)) {
      indoklas.push("a szálban módosítás/eltérés");
      return vissza("modositas", 80, iratVan);
    }
    if (talal(ADATKERES, szoveg)) {
      indoklas.push("kérdés vagy visszaigazolás-kérés");
      return vissza("adatkeres", 75);
    }
    if (iratVan) {
      indoklas.push("ismert partner iratot küldött, de nem egyértelmű, mi ez");
      return vissza("egyeb", 45, true);
    }
  }

  indoklas.push("nincs egyértelmű jel");
  return vissza("egyeb", 30);
}

export const OSZTALY_CIMKE: Record<LevelOsztaly, string> = {
  megbizas: "Megbízás",
  modositas: "Módosítás",
  adatkeres: "Kérdés / visszaigazolás",
  okmanykeres: "Okmányt kérnek",
  papirok: "Papírt küldtek",
  fizetes: "Fizetés / könyvelve",
  szamla_ertesito: "Számla-értesítő",
  timocom: "Timocom",
  reklam: "Reklám",
  egyeb: "Egyéb",
};

/** Melyik osztály kerül Zoltán teendői közé (a Levelek fül „Teendő" szűrője). */
export const TEENDO_OSZTALYOK: readonly LevelOsztaly[] = ["megbizas", "modositas", "adatkeres", "okmanykeres", "papirok"];
/** Ennél nagyobb bizalomnál a megbízás csatolmánya emberi jóváhagyás nélkül mehet a Drive-ba. */
export const AUTO_DRIVE_BIZALOM = 70;
