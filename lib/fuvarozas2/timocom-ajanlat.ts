// Timocom fuvar-ajánlat → WWP (fuvarszervező pult, B út: böngésző-gomb).
//
// A Timocomnak nincs nyilvános API-ja. A „→ WWP" könyvjelző-gomb a Timocom
// fuvarkeresőjében NYITOTT ajánlat részletpaneljét olvassa ki (csak amit a
// felhasználó lát, csak kattintásra), és a WWP /fuvarozas2/timocom lapját
// nyitja meg vele (az adat az URL # részében megy, a szerver nem naplózza).
// Ugyanez a feldolgozó fut a kézi beillesztésnél (A út) is.
//
// A részletpanel szerkezete (my.timocom.com, 2026-10-11, magyar felület):
//   Létrehozva 2026. 10. 09., 08:00:51 · Ajánlat mentése · <megbízó> ·
//   HU, 2233 Ecser · <értékelés> · TC ID: 98943 · Fel- és lerakóhelyek ·
//   215 km · <helyek: "HU\n, 4200 Hajdúszoboszló\n10. 09. - 10. 12.\n08:00 - 16:00">
//   · Kapcsolatfelvétel részletei · <név> · Beszélt nyelvek: … · +36… ·
//   Fuvarleírás · 13.6 m · 24 t · Áru jellege · … · Kiegészítő információk ·
//   … · A járművel szembeni követelmények · Jármű típusa · … ·
//   Felépítménytípusok · … · Tulajdonságok és tanúsítványok · … · Fuvardíj ·
//   Ár · … · Fizetési határidő · 30 Nap · Külső megjegyzések · …
// A fel/le jelölés csak ikonban van (svg <title>Felrakóhely/Lerakóhely</title>),
// ezt a gomb külön küldi; beillesztett szövegnél az első hely felrakó, az
// utolsó lerakó, a köztes ismeretlen.
//
// Tiszta modul (adatbázis és hálózat nélkül) — a teszt: scripts/teszt-timocom.ts.

export type TimocomHelyNyers = { tipus?: string | null; szoveg: string };

/** A gomb (vagy a beillesztés) által küldött nyers adat. */
export type TimocomBemenet = {
  /** A részletpanel teljes szövege (innerText). */
  szoveg: string;
  /** A panel címe, pl. „HU Hajdúszoboszló > HU Dunakeszi". */
  cim?: string | null;
  /** Az ajánlat oldalának címe (…/freights/search/view/<id>). */
  url?: string | null;
  /** Helyenként az ikon címe (Felrakóhely / Lerakóhely) és a sor szövege. */
  helyek?: TimocomHelyNyers[] | null;
};

export type TimocomHely = {
  tipus: "fel" | "le" | null;
  orszag: string;
  irsz: string | null;
  varos: string;
  /** "YYYY-MM-DD" */
  datumTol: string | null;
  datumIg: string | null;
  /** "HH:MM" */
  idoTol: string | null;
  idoIg: string | null;
};

export type TimocomAjanlat = {
  ajanlatId: string | null;
  url: string | null;
  tcId: string | null;
  megbizo: string | null;
  megbizoCim: string | null;
  /** "YYYY-MM-DD HH:MM:SS" */
  letrehozva: string | null;
  tavKm: number | null;
  helyek: TimocomHely[];
  kapcsolatNev: string | null;
  telefonok: string[];
  hosszM: number | null;
  sulyT: number | null;
  aru: string | null;
  kiegeszito: string | null;
  jarmuTipus: string | null;
  felepitmeny: string | null;
  tulajdonsagok: string | null;
  ar: { osszeg: number; penznem: string } | null;
  fizetesiHataridoNap: number | null;
  megjegyzes: string | null;
  /** Amire a döntésnél figyelni kell (ADR, hulladék, felépítmény, méret …). */
  figyelmeztetesek: string[];
};

const URES = /^[-–—]?$/;

function tisztit(s: string | null | undefined): string | null {
  const x = (s ?? "").replace(/\s+/g, " ").trim();
  return x && !URES.test(x) && !/^nincs kiválasztva$/i.test(x) ? x : null;
}

function sorok(szoveg: string): string[] {
  return szoveg.replace(/\r/g, "").split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** A címke UTÁNI sor(ok) a következő ismert címkéig. */
const CIMKEK = [
  "Fel- és lerakóhelyek", "Útvonal számítás", "Kapcsolatfelvétel részletei", "Fuvarleírás", "Áru jellege",
  "Kiegészítő információk", "A járművel szembeni követelmények", "Jármű típusa", "Felépítménytípusok",
  "Tulajdonságok és tanúsítványok", "Fuvardíj", "Ár", "Fizetési határidő", "Külső megjegyzések",
  "Nincs rakománytároló eszköz csere", "Rakománytároló eszköz csere",
];
const CIMKE_SET = new Set(CIMKEK.map((c) => c.toLowerCase()));

function cimkeUtan(s: string[], cimke: string): string | null {
  const i = s.findIndex((x) => x.toLowerCase() === cimke.toLowerCase());
  if (i < 0) return null;
  const ki: string[] = [];
  for (let j = i + 1; j < s.length; j++) {
    if (CIMKE_SET.has(s[j].toLowerCase())) break;
    ki.push(s[j]);
  }
  return tisztit(ki.join(" "));
}

function szam(s: string): number | null {
  const n = Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "10. 13." → "YYYY-MM-DD", az évet a létrehozás évéből (év-fordulónál a következő év). */
function datum(hn: string, alapEv: number, alapHo: number): string | null {
  const m = hn.match(/(?:(\d{4})\.\s*)?(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (!m) return null;
  const ho = Number(m[2]);
  const nap = Number(m[3]);
  if (ho < 1 || ho > 12 || nap < 1 || nap > 31) return null;
  const ev = m[1] ? Number(m[1]) : ho < alapHo - 6 ? alapEv + 1 : alapEv;
  return `${ev}-${String(ho).padStart(2, "0")}-${String(nap).padStart(2, "0")}`;
}

function helyTipus(t: string | null | undefined): "fel" | "le" | null {
  const x = (t ?? "").toLowerCase();
  if (/lerak|unloading|entlad|d[ée]chargement/.test(x)) return "le";
  if (/felrak|loading|belad|chargement/.test(x)) return "fel";
  return null;
}

/** Egy hely szövegéből: ország, irsz, város, dátum- és idősáv. */
export function parseHelySzoveg(szoveg: string, alapEv: number, alapHo: number): Omit<TimocomHely, "tipus"> | null {
  const x = szoveg
    .replace(/Legkorábbi időpont\s*-\s*Legkésőbbi időpont/gi, " ")
    .replace(/^(Felrakóhely|Lerakóhely)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = x.match(/^([A-Z]{1,3})\s*,\s*(?:([A-Z0-9][A-Z0-9 -]{1,9}?)\s+)?([^\d,]+?)(?=\s+\d{1,2}\.\s*\d{1,2}\.|\s*$)/u);
  if (!m) return null;
  const dat = [...x.matchAll(/(\d{4}\.\s*)?\d{1,2}\.\s*\d{1,2}\./g)].map((d) => datum(d[0], alapEv, alapHo));
  const idok = [...x.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((d) => `${d[1].padStart(2, "0")}:${d[2]}`);
  return {
    orszag: m[1],
    irsz: m[2]?.trim() || null,
    varos: m[3].trim(),
    datumTol: dat[0] ?? null,
    datumIg: dat[1] ?? dat[0] ?? null,
    idoTol: idok[0] ?? null,
    idoIg: idok[1] ?? idok[0] ?? null,
  };
}

/** A szövegből a helyek blokkja ("Útvonal számítás" és "Kapcsolatfelvétel" között). */
function helyekSzovegbol(s: string[]): string[] {
  const kezd = s.findIndex((x) => /^Útvonal számítás$/i.test(x) || /^Fel- és lerakóhelyek$/i.test(x));
  if (kezd < 0) return [];
  const ki: string[] = [];
  let akt: string[] = [];
  for (let j = kezd + 1; j < s.length; j++) {
    const x = s[j];
    if (/^(Kapcsolatfelvétel részletei|Fuvarleírás)$/i.test(x)) break;
    if (/^Útvonal számítás$/i.test(x) || /^\d+([.,]\d+)?\s*km$/i.test(x)) continue;
    // Új hely: országkód egyedül (a következő sor ", 4200 Város"), vagy "HU, 4200 Város".
    if (/^[A-Z]{1,3}$/.test(x) || /^[A-Z]{1,3}\s*,/.test(x)) {
      if (akt.length) ki.push(akt.join(" "));
      akt = [x];
    } else if (akt.length) {
      akt.push(x);
    }
  }
  if (akt.length) ki.push(akt.join(" "));
  return ki.map((h) => h.replace(/^([A-Z]{1,3})\s+,/, "$1,"));
}

const SAJAT_FELEPITMENY = /ponyv|mega|oldalrakod|tautliner|curtain|plane|szerelv/i;

export function parseTimocomAjanlat(be: TimocomBemenet): TimocomAjanlat {
  const s = sorok(be.szoveg ?? "");
  const egesz = s.join("\n");

  const letrM = egesz.match(/Létrehozva\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  const letrehozva = letrM
    ? `${letrM[1]}-${letrM[2].padStart(2, "0")}-${letrM[3].padStart(2, "0")} ${letrM[4].padStart(2, "0")}:${letrM[5]}:${letrM[6] ?? "00"}`
    : null;
  const most = new Date();
  const alapEv = letrM ? Number(letrM[1]) : most.getFullYear();
  const alapHo = letrM ? Number(letrM[2]) : most.getMonth() + 1;

  const tcIdx = s.findIndex((x) => /^TC ID:/i.test(x));
  const tcId = tcIdx >= 0 ? (s[tcIdx].match(/TC ID:\s*([\d-]+)/i)?.[1] ?? null) : null;

  // Megbízó: a „Létrehozva" / „Ajánlat mentése/mentve" utáni első sor; utána a címe ("HU, 2233 Ecser").
  let megbizo: string | null = null;
  let megbizoCim: string | null = null;
  const fejVeg = tcIdx >= 0 ? tcIdx : s.findIndex((x) => /^Fel- és lerakóhelyek$/i.test(x));
  for (let j = 0; j < (fejVeg >= 0 ? fejVeg : 0); j++) {
    const x = s[j];
    if (/^Létrehozva|^Ajánlat ment/i.test(x)) continue;
    if (!megbizo) { megbizo = x; continue; }
    if (!megbizoCim && /^[A-Z]{1,3},\s*\S/.test(x)) { megbizoCim = x; break; }
  }

  const tavM = egesz.match(/Fel- és lerakóhelyek\s*\n\s*(\d+(?:[.,]\d+)?)\s*km/i);

  // Helyek: a gomb soronként küldi (ikon-címmel); különben a szövegből.
  const nyersHelyek: TimocomHelyNyers[] = be.helyek?.length
    ? be.helyek
    : helyekSzovegbol(s).map((h) => ({ szoveg: h, tipus: null }));
  const helyek: TimocomHely[] = [];
  for (const h of nyersHelyek) {
    const p = parseHelySzoveg(h.szoveg, alapEv, alapHo);
    if (p) helyek.push({ tipus: helyTipus(h.tipus), ...p });
  }
  if (helyek.length >= 2) {
    if (!helyek[0].tipus) helyek[0].tipus = "fel";
    if (!helyek[helyek.length - 1].tipus) helyek[helyek.length - 1].tipus = "le";
  }

  // Kapcsolat: a „Kapcsolatfelvétel részletei" utáni név és telefonszámok.
  const kIdx = s.findIndex((x) => /^Kapcsolatfelvétel részletei$/i.test(x));
  let kapcsolatNev: string | null = null;
  const telefonok: string[] = [];
  if (kIdx >= 0) {
    for (let j = kIdx + 1; j < s.length && !/^Fuvarleírás$/i.test(s[j]); j++) {
      const x = s[j];
      if (/^\+?[\d\s/()-]{7,}$/.test(x)) {
        const t = x.replace(/[^\d+]/g, "");
        if (!telefonok.includes(t)) telefonok.push(t);
      } else if (!kapcsolatNev && !/^Beszélt nyelvek|^#$|^-$/i.test(x) && /\p{L}/u.test(x)) {
        kapcsolatNev = x;
      }
    }
  }

  // Fuvarleírás: „13.6 m" és „24 t".
  const fIdx = s.findIndex((x) => /^Fuvarleírás$/i.test(x));
  let hosszM: number | null = null;
  let sulyT: number | null = null;
  if (fIdx >= 0) {
    for (let j = fIdx + 1; j < Math.min(s.length, fIdx + 4); j++) {
      const hm = s[j].match(/^(\d+(?:[.,]\d+)?)\s*m$/i);
      const st = s[j].match(/^(\d+(?:[.,]\d+)?)\s*t$/i);
      if (hm) hosszM = szam(hm[1]);
      if (st) sulyT = szam(st[1]);
    }
  }

  const arSzoveg = cimkeUtan(s, "Ár");
  let ar: TimocomAjanlat["ar"] = null;
  if (arSzoveg) {
    const m = arSzoveg.match(/(\d[\d\s.,]*)\s*([A-Z]{3}|€|Ft|HUF)?/i);
    const osszeg = m ? szam(m[1]) : null;
    if (osszeg != null && osszeg > 0) {
      const p = (m?.[2] ?? "").toUpperCase();
      ar = { osszeg, penznem: p === "€" ? "EUR" : p === "FT" ? "HUF" : p || "EUR" };
    }
  }
  const fizM = (cimkeUtan(s, "Fizetési határidő") ?? "").match(/(\d+)\s*nap/i);

  const aru = cimkeUtan(s, "Áru jellege");
  const kiegeszito = cimkeUtan(s, "Kiegészítő információk");
  const jarmuTipus = cimkeUtan(s, "Jármű típusa");
  const felepitmeny = cimkeUtan(s, "Felépítménytípusok");
  const tulajdonsagok = cimkeUtan(s, "Tulajdonságok és tanúsítványok");
  const megjegyzes = cimkeUtan(s, "Külső megjegyzések");

  const fig: string[] = [];
  const mind = [aru, kiegeszito, tulajdonsagok, megjegyzes].filter(Boolean).join(" · ");
  if (/\bADR\b/i.test(mind)) fig.push("ADR-köteles áru — van-e ADR-felszerelés és -képzés?");
  if (/hullad[ée]k|waste|abfall/i.test(mind)) fig.push("Hulladékszállítás — engedély kell.");
  if (/enged[ée]ly|permit|genehmigung/i.test(mind) && !fig.some((f) => /engedély/.test(f))) fig.push("Engedélyt említ — nézd meg, mit.");
  if (/h[űu]t[őö]|termo|thermo|frigo|k[üu]hl/i.test([mind, felepitmeny].join(" "))) fig.push("Hűtött/termós szállítás.");
  if (felepitmeny && !SAJAT_FELEPITMENY.test(felepitmeny)) fig.push(`Felépítmény: ${felepitmeny} — a kocsik ponyvás Mega pótkocsik.`);
  if (hosszM != null && hosszM > 13.6) fig.push(`Hossz ${hosszM} m — több, mint 13,6 m.`);
  if (sulyT != null && sulyT > 24.5) fig.push(`Súly ${sulyT} t — több, mint 24 t.`);
  if (helyek.length > 2) fig.push(`${helyek.length} megálló (${helyek.filter((h) => h.tipus === "fel").length} fel, ${helyek.filter((h) => h.tipus === "le").length} le).`);
  if (helyek.some((h) => h.orszag !== "HU")) fig.push("Külföldi megálló.");
  if (!ar) fig.push("Nincs megadott ár — árajánlatot kell adni.");

  const idM = (be.url ?? "").match(/\/view\/([A-Za-z0-9_-]{10,})/);

  return {
    ajanlatId: idM?.[1] ?? null,
    url: be.url ?? null,
    tcId,
    megbizo,
    megbizoCim,
    letrehozva,
    tavKm: tavM ? szam(tavM[1]) : null,
    helyek,
    kapcsolatNev,
    telefonok,
    hosszM,
    sulyT,
    aru,
    kiegeszito,
    jarmuTipus,
    felepitmeny,
    tulajdonsagok,
    ar,
    fizetesiHataridoNap: fizM ? Number(fizM[1]) : null,
    megjegyzes,
    figyelmeztetesek: fig,
  };
}

/** A Kalkulátor megálló-szövege egy helyhez ("4200 Hajdúszoboszló" / "AT, 4020 Linz"). */
export function kalkulatorMegallo(h: TimocomHely): string {
  const alap = [h.irsz, h.varos].filter(Boolean).join(" ");
  return h.orszag === "HU" ? alap : `${alap}, ${h.orszag}`;
}

/** Az ismétlődés-kulcs: a Timocom ajánlat-azonosítója, ennek híján TC ID + útvonal + nap. */
export function timocomKulcs(a: TimocomAjanlat): string | null {
  if (a.ajanlatId) return a.ajanlatId;
  if (!a.helyek.length) return null;
  return ["tc", a.tcId ?? "", ...a.helyek.map((h) => `${h.irsz ?? ""}${h.varos}${h.datumTol ?? ""}`)].join("|").toLowerCase();
}

/** Az # részbe kódolt adat (base64url JSON) → bemenet; hibás adatnál null. */
export function dekodolHash(hash: string): TimocomBemenet | null {
  const m = hash.match(/(?:^#|&)d=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || typeof obj.szoveg !== "string") return null;
    return {
      szoveg: String(obj.szoveg).slice(0, 20_000),
      cim: typeof obj.cim === "string" ? obj.cim.slice(0, 300) : null,
      url: typeof obj.url === "string" ? obj.url.slice(0, 1000) : null,
      helyek: Array.isArray(obj.helyek)
        ? obj.helyek.slice(0, 20).map((h: { tipus?: unknown; szoveg?: unknown }) => ({ tipus: typeof h?.tipus === "string" ? h.tipus : null, szoveg: String(h?.szoveg ?? "").slice(0, 500) }))
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * A könyvjelző-gomb kódja. A Timocom fuvarkeresőjében a nyitott ajánlat
 * részletpaneljét olvassa (FreightSearchView_viewFreight; ha a Timocom
 * átnevezi, a „Fel- és lerakóhelyek" + „TC ID" szövegű legkisebb látható
 * blokk), kinyitja a kapcsolat-részt, ha csukva van (a nyitottat nem
 * csukja be), és új fülön megnyitja a WWP-t.
 * Nem kattint semmi másra, nem ír a Timocomba.
 */
export function konyvjelzoKod(origin: string): string {
  const cel = `${origin.replace(/\/$/, "")}/fuvarozas2/timocom`;
  const js = `(async()=>{try{
var L=function(){var b=document.querySelector('[class*="FreightSearchView_viewFreight"]');if(b&&b.offsetParent!==null)return b;var c=[].slice.call(document.querySelectorAll('div,section,aside')).filter(function(d){return d.offsetParent!==null&&d.innerText&&/TC ID/.test(d.innerText)&&/(Fel- és lerakóhelyek|Loading and unloading)/.test(d.innerText)});c.sort(function(a,b){return a.innerText.length-b.innerText.length});return c[0]||null};
var b=L();if(!b){alert('WWP: nyiss meg egy fuvar-ajánlatot a Timocomban (a részletpanel legyen látható), és kattints újra.');return}
var k=[].slice.call(b.querySelectorAll('[class*="FormPanelHeader_toggleable"]')).filter(function(e){return /Kapcsolat|Contact/i.test(e.innerText)})[0];if(k&&k.querySelector('[class*="collapsed"]')){k.click();await new Promise(function(r){setTimeout(r,700)})}
var seen={},hs=[];[].slice.call(b.querySelectorAll('[class*="loadingPlacesRow"]')).forEach(function(r){var c=r.querySelector('[data-testid^="LoadingPlacesView/loadingPlaceCity_"]');var key=c?c.getAttribute('data-testid'):r.innerText;if(seen[key])return;seen[key]=1;var t=r.querySelector('svg title');hs.push({tipus:t?t.textContent:null,szoveg:r.innerText})});
var ti=[].slice.call(document.querySelectorAll('[class*="Slider_title"]')).filter(function(e){return e.offsetParent!==null})[0];
var d={szoveg:b.innerText,cim:ti?ti.innerText:document.title,url:location.origin+location.pathname,helyek:hs};
var u=new TextEncoder().encode(JSON.stringify(d)),s='';for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);
window.open(${JSON.stringify(cel)}+'#d='+btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''),'_blank');
}catch(e){alert('WWP gomb hiba: '+e.message)}})();`;
  return "javascript:" + encodeURIComponent(js.replace(/\n/g, ""));
}
