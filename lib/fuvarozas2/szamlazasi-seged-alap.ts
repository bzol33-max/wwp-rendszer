// Számlázási segéd — tiszta, hálózat nélküli rész (scripts/teszt-szamlazasi-seged.ts).
// (2026-10-11)
//
// A „Számlázok” gomb mögött a számla minden mezője úgy, ahogy a
// Számlázz.hu-ba (és a kész számlára) kerül, a számla sorrendjében, mezőnként
// másolható értékkel. A mezők a 10 legutóbbi kimenő számla mintájára
// (WLLWR-2026-284 … 348): vevő (név, irsz, település, cím, adószám), fizetési
// mód, rendelésszám, teljesítés / kiállítás / határidő, tétel („Közúti
// árufuvarozás Felrakó-Lerakó”, 1 db, egységár, 27% áfa), pénznem, e-mail.

import { varosNev } from "@/lib/fuvarozas/varos";
import { PAPIR_HIANY_SZOVEG } from "@/lib/megbizasok/papir-alap";

export type VevoAdat = {
  nev: string | null;
  irsz: string | null;
  telepules: string | null;
  cim: string | null;
  adoszam: string | null;
  euAdoszam: string | null;
  email: string | null;
};

const URES_VEVO: VevoAdat = { nev: null, irsz: null, telepules: null, cim: null, adoszam: null, euAdoszam: null, email: null };

function xmlErtek(blokk: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(blokk);
  if (!m) return null;
  const v = m[1]
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return v || null;
}

/**
 * A vevő adatai egy korábbi számla Számlázz.hu-XML-jéből (szamla.raw_xml):
 * <vevo><nev/><cim><irsz/><telepules/><cim/></cim><adoszam/><email/></vevo>.
 * A lapos (cím-blokk nélküli) alakot is olvassa.
 */
export function vevoXmlbol(xml: string | null): VevoAdat {
  if (!xml) return { ...URES_VEVO };
  const vevo = /<vevo>([\s\S]*?)<\/vevo>/i.exec(xml)?.[1];
  if (!vevo) return { ...URES_VEVO };
  // A postázási cím blokkja nem a számlázási cím — kivesszük, mielőtt keresünk.
  const tiszta = vevo.replace(/<(postazasicim|postacim)>[\s\S]*?<\/\1>/gi, "");
  // Blokkos alak: <cim><irsz/><telepules/><cim>utca</cim></cim>; lapos: <irsz/><telepules/><cim>utca</cim>.
  const blokk = /<cim>(\s*<[\s\S]*?<\/cim>)\s*<\/cim>/i.exec(tiszta)?.[1] ?? null;
  const forras = blokk ?? tiszta;
  return {
    nev: xmlErtek(tiszta, "nev"),
    irsz: xmlErtek(forras, "irsz"),
    telepules: xmlErtek(forras, "telepules"),
    cim: xmlErtek(forras, "cim"),
    adoszam: xmlErtek(tiszta, "adoszam"),
    euAdoszam: xmlErtek(tiszta, "adoszamEU") ?? xmlErtek(tiszta, "adoszameu") ?? xmlErtek(tiszta, "csoportazonosito"),
    email: xmlErtek(tiszta, "email"),
  };
}

/** „8445 Csehbánya, Újtelep utca 41.” → irsz / település / cím. Ha nem bontható, a cím a teljes szöveg. */
export function cimBontas(szoveg: string | null): { irsz: string | null; telepules: string | null; cim: string | null } {
  const s = (szoveg ?? "").replace(/\s+/g, " ").trim();
  if (!s) return { irsz: null, telepules: null, cim: null };
  const m = /^(?:HU-?\s?)?(\d{4})\s+([^,]+?)(?:,\s*|\s+)(.+)$/.exec(s);
  if (m) {
    // „1222 Budapest Pannónia utca 9.” — vessző nélkül a település az első szó.
    const [, irsz, t, maradek] = m;
    if (s.includes(",")) return { irsz, telepules: t.trim(), cim: maradek.trim() };
    const szavak = `${t} ${maradek}`.split(" ");
    return { irsz, telepules: szavak[0], cim: szavak.slice(1).join(" ") || null };
  }
  return { irsz: null, telepules: null, cim: s };
}

/** "2026-10-09" → "2026.10.09." (ahogy a számlán áll). */
export function huDatum(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}.` : null;
}

export function napHozzaad(iso: string, nap: number): string {
  const [e, h, n] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(e, h - 1, n + nap));
  return d.toISOString().slice(0, 10);
}

export function napKulonbseg(tol: string, ig: string): number {
  const a = Date.UTC(+tol.slice(0, 4), +tol.slice(5, 7) - 1, +tol.slice(8, 10));
  const b = Date.UTC(+ig.slice(0, 4), +ig.slice(5, 7) - 1, +ig.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export type SegedMegallo = { tipus: "felrako" | "lerako"; telepules: string | null; cim_nyers: string };

/** „TÉGLÁS” → „Téglás”; a vegyes írásmódot meghagyja. */
function nagyKezdo(v: string): string {
  return v === v.toUpperCase() ? v.charAt(0) + v.slice(1).toLowerCase() : v;
}

function varosa(m: SegedMegallo): string {
  if (m.telepules?.trim()) return nagyKezdo(m.telepules.trim());
  // Irányítószám után álló szó: „…, 4002 Debrecen” → Debrecen.
  const irszUtan = /\b\d{4}\s+([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}-]+)/u.exec(m.cim_nyers)?.[1];
  if (irszUtan) return nagyKezdo(irszUtan);
  // Egyszavas címrész („Debrecen, BMW Group Plant, Mezőségi út 1”) — az a város.
  const egyszavas = m.cim_nyers.split(",").map((r) => r.trim()).find((r) => /^[A-ZÁÉÍÓÖŐÚÜŰ][\p{Ll}-]{2,}$/u.test(r));
  if (egyszavas) return egyszavas;
  // Különben a meglévő városkivágó (varos.ts); cégnév-maradéknál
  // („Werk Ujhartyan”, „BMW HU Plant Debrecen”) az utolsó szó a város.
  const v = varosNev(m.cim_nyers).trim();
  const szavak = v.split(/\s+/);
  return nagyKezdo(szavak.length > 1 ? szavak[szavak.length - 1] : v || m.cim_nyers.split(",")[0].trim());
}

/**
 * A tétel megnevezése a számlák egységes alakjában: „Közúti árufuvarozás
 * Felrakó-Lerakó” (az első felrakó és az utolsó lerakó városa). Kettőnél több
 * megállónál a második sor sorolja az állomásokat „Város (fel)-Város (le)”
 * alakban (mint a WLLWR-2026-334-en).
 */
export function fuvarMegnevezes(megallok: SegedMegallo[], tartalek?: { felrako: string | null; lerako: string | null }): { megnevezes: string; reszlet: string | null } {
  const fel = megallok.filter((m) => m.tipus === "felrako");
  const le = megallok.filter((m) => m.tipus === "lerako");
  const honnan = fel.length ? varosa(fel[0]) : (tartalek?.felrako ?? "").split(",")[0].trim();
  const hova = le.length ? varosa(le[le.length - 1]) : (tartalek?.lerako ?? "").split(",")[0].trim();
  const megnevezes = `Közúti árufuvarozás ${[honnan, hova].filter(Boolean).join("-")}`.trim();
  const reszlet = megallok.length > 2 ? megallok.map((m) => `${varosa(m)} (${m.tipus === "felrako" ? "fel" : "le"})`).join("-") : null;
  return { megnevezes, reszlet };
}

/** Áfa és bruttó: forintnál egészre, devizánál 2 tizedesre kerekítve. */
export function osszegek(netto: number, penznem: string, afaKulcs = 27): { netto: number; afa: number; brutto: number } {
  const ft = /^(ft|huf)$/i.test(penznem.trim());
  const kerek = (x: number) => (ft ? Math.round(x) : Math.round(x * 100) / 100);
  const n = kerek(netto);
  const afa = kerek((n * afaKulcs) / 100);
  return { netto: n, afa, brutto: kerek(n + afa) };
}

/** Megjelenítés a számla szerint: „320 000”, „67,50”. */
export function szamSzoveg(x: number, penznem: string): string {
  const ft = /^(ft|huf)$/i.test(penznem.trim());
  const [egesz, tort] = (ft ? Math.round(x).toFixed(0) : x.toFixed(2)).split(".");
  const csoport = egesz.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return tort ? `${csoport},${tort}` : csoport;
}

/** A Számlázz.hu pénznem-kódja: „Ft” → HUF. */
export function penznemKod(p: string | null): string {
  const s = (p ?? "").trim().toUpperCase();
  return !s || s === "FT" ? "HUF" : s;
}

export type RendelesszamBemenet = {
  hivatkozasKanonikus: string | null;
  pozicioszam: string | null;
  reiseId: string | null;
  hivatkozasMasodlagos: string | null;
  hivatkozasNincs: boolean;
  /** A partner beállítása: melyik szám kell a számlára. */
  szamlanKertSzam: "pozicioszam" | "reise_id" | "hivatkozas" | null;
  /** A partner hivatkozás-formátuma (regex), ha van. */
  formatum: string | null;
  /** A megbízóhoz tartozó levél tárgyából kiolvasott szám, ha a megbízáson nincs. */
  levelbol: string | null;
  /** Volt-e rendelésszám a partner legutóbbi számláján. */
  elozoSzamlanVolt: boolean;
  /** Duvenbeck-féle sablon: a Reise-ID mindig kötelező. */
  kotelezoSablon: boolean;
};

export type Rendelesszam = { ertek: string | null; forras: string | null; kotelezo: boolean; hiba: string | null };

/**
 * A számla „Rendelésszám” mezője. Sorrend: 1) a partnernél beállított szám
 * (Reise-ID / pozíciószám / hivatkozás), 2) a megbízás bármelyik hivatkozása,
 * 3) a megbízó levelének tárgya. Kötelező, ha a partner sablonja kéri, vagy
 * a legutóbbi számláján is volt — kivéve, ha a megbízáson jelölve, hogy nincs.
 */
export function valasztRendelesszam(b: RendelesszamBemenet): Rendelesszam {
  const tiszta = (s: string | null) => (s ?? "").trim() || null;
  const kert =
    b.szamlanKertSzam === "reise_id" ? tiszta(b.reiseId)
    : b.szamlanKertSzam === "hivatkozas" ? tiszta(b.hivatkozasKanonikus)
    : b.szamlanKertSzam === "pozicioszam" ? tiszta(b.pozicioszam)
    : null;
  const jeloltek: [string | null, string][] = [
    [kert, b.szamlanKertSzam === "reise_id" ? "a megbízás Reise-ID-je" : "a megbízás hivatkozása"],
    [tiszta(b.reiseId), "a megbízás Reise-ID-je"],
    [tiszta(b.hivatkozasKanonikus), "a megbízás hivatkozása"],
    [tiszta(b.pozicioszam), "a megbízás pozíciószáma"],
    [tiszta(b.hivatkozasMasodlagos), "a megbízás másodlagos hivatkozása"],
    [tiszta(b.levelbol), "a megbízó levelének tárgya"],
  ];
  const talalt = jeloltek.find(([v]) => v);
  const kotelezo = !b.hivatkozasNincs && (b.kotelezoSablon || b.elozoSzamlanVolt);
  const ertek = talalt?.[0] ?? null;
  let hiba: string | null = null;
  if (ertek && b.formatum) {
    try {
      if (!new RegExp(b.formatum).test(ertek)) hiba = `A szám formátuma nem a megszokott (${ertek}).`;
    } catch {
      // hibás regex a partnernél: nem akasztjuk meg a számlázást
    }
  }
  if (!ertek && kotelezo) hiba = "Hiányzik — enélkül ennél a megbízónál a számla nem párosítható.";
  return { ertek, forras: talalt?.[1] ?? null, kotelezo, hiba };
}

export type Ellenorzes = { ok: boolean; szoveg: string; blokkol: boolean };

export function ellenorzesek(p: {
  cmrDb: number;
  /** Az eredeti papírt Szabina nyugtázta (papirok_beerkeztek_at) — figyelmeztet, nem blokkol (2026-10-11). */
  papirMegvan: boolean;
  fuvardij: number | null;
  teljesites: string | null;
  kiallitas: string;
  vanSzamla: boolean;
  rendelesszam: Rendelesszam;
  vevoAdoszam: string | null;
}): Ellenorzes[] {
  const ki: Ellenorzes[] = [];
  ki.push({ ok: p.cmrDb > 0, szoveg: p.cmrDb > 0 ? `CMR / fuvarlevél megvan (${p.cmrDb} fotó)` : "Nincs fuvarlevél-fotó — a megbízók a CMR nélkül nem könyvelik", blokkol: false });
  ki.push({ ok: p.papirMegvan, szoveg: p.papirMegvan ? "Az eredeti papír megérkezett (nyugtázva)" : `${PAPIR_HIANY_SZOVEG} — számlázható, de tartsd számon`, blokkol: false });
  ki.push({ ok: p.fuvardij != null && p.fuvardij > 0, szoveg: p.fuvardij ? "A díj a megbízásból" : "Nincs fuvardíj a megbízáson", blokkol: !(p.fuvardij && p.fuvardij > 0) });
  const teljOk = !!p.teljesites && p.teljesites <= p.kiallitas;
  ki.push({ ok: teljOk, szoveg: !p.teljesites ? "Nincs teljesítési dátum (lerakás)" : teljOk ? "A teljesítés nem későbbi a kiállításnál" : "A teljesítés a kiállítás UTÁN van — elírás?", blokkol: !teljOk });
  ki.push({ ok: !p.vanSzamla, szoveg: p.vanSzamla ? "Erre a fuvarra már van számlaszám" : "Erre a fuvarra még nincs számla", blokkol: p.vanSzamla });
  ki.push({ ok: !!p.vevoAdoszam, szoveg: p.vevoAdoszam ? "A vevő adószáma megvan" : "Hiányzik a vevő adószáma (partner-törzs)", blokkol: !p.vevoAdoszam });
  const r = p.rendelesszam;
  if (r.kotelezo || r.ertek) {
    ki.push({ ok: !!r.ertek && !r.hiba, szoveg: r.ertek ? `Rendelésszám: ${r.ertek}${r.hiba ? ` — ${r.hiba}` : ""}` : `Rendelésszám: ${r.hiba ?? "hiányzik"}`, blokkol: r.kotelezo && !r.ertek });
  }
  return ki;
}

export type SegedMezo = { kulcs: string; cimke: string; ertek: string | null; megjegyzes?: string | null; masolhato?: boolean };

/** Az összes mező egy szövegben (a „Mind másolása” gombhoz), a számla sorrendjében. */
export function mindSzovegkent(mezok: SegedMezo[]): string {
  return mezok.filter((m) => m.ertek).map((m) => `${m.cimke}: ${m.ertek}`).join("\n");
}
