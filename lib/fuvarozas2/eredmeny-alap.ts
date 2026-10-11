// Eredmény oldal (az új terv 4. oldala, 2026-10-11) — tiszta számolás a
// meglévő költség-motor (koltseg-adat.ts / koltseg-szamitas.ts) eredményéből.
// Új számítási szabályt NEM vezet be: a kocsi fedezete = a meglévő
// JarmuEredmeny.eredmenyFt (bérfuvar-eredmény − nem hozzárendelt költség);
// a vízesés csak felbontja ezt tételekre. Teszt: scripts/teszt-eredmeny.ts.

export type Forras = "teny" | "becsles";

export type VizesesBemenet = {
  berBevetelFt: number;
  eredmenyFt: number;
  nemHozzarendeltFt: number;
  megbizasok: {
    jelleg: "ber" | "sajat";
    uzemanyag: { ft: number } | null;
    utdij: { ft: number } | null;
    napiFix: { ft: number };
  }[];
};

export type Vizeses = {
  bevetel: number;
  uzemanyag: number;
  utdij: number;
  napiFix: number;
  /** Üres utak, állás, fel nem osztott napok (= nem hozzárendelt költség). */
  uresAllas: number;
  /** Kézi egyéb költség, pótdíj és kerekítés — a maradék, hogy a vízesés pontosan kijöjjön. */
  egyeb: number;
  fedezet: number;
};

export function vizeses(j: VizesesBemenet): Vizeses {
  let uzemanyag = 0, utdij = 0, napiFix = 0;
  for (const m of j.megbizasok) {
    if (m.jelleg !== "ber") continue;
    uzemanyag += m.uzemanyag?.ft ?? 0;
    utdij += m.utdij?.ft ?? 0;
    napiFix += m.napiFix.ft;
  }
  const r = (x: number) => Math.round(x);
  const v = { bevetel: r(j.berBevetelFt), uzemanyag: r(uzemanyag), utdij: r(utdij), napiFix: r(napiFix), uresAllas: r(j.nemHozzarendeltFt), fedezet: r(j.eredmenyFt) };
  return { ...v, egyeb: v.bevetel - v.uzemanyag - v.utdij - v.napiFix - v.uresAllas - v.fedezet };
}

export function vizesesOsszeg(a: Vizeses, b: Vizeses): Vizeses {
  return {
    bevetel: a.bevetel + b.bevetel, uzemanyag: a.uzemanyag + b.uzemanyag, utdij: a.utdij + b.utdij, napiFix: a.napiFix + b.napiFix,
    uresAllas: a.uresAllas + b.uresAllas, egyeb: a.egyeb + b.egyeb, fedezet: a.fedezet + b.fedezet,
  };
}

export const URES_VIZESES: Vizeses = { bevetel: 0, uzemanyag: 0, utdij: 0, napiFix: 0, uresAllas: 0, egyeb: 0, fedezet: 0 };

export type PartnerBemenet = { partner: string | null; jelleg: "ber" | "sajat"; nap: string; bevetelFt: number | null; eredmenyFt: number | null };

export type PartnerSor = {
  partner: string;
  db: number;
  bevetelFt: number;
  fedezetFt: number;
  utolso: string;
  /** Rendszeres megbízó (≥5 fuvar), akitől 21+ napja nem jött fuvar. */
  elmaradt: boolean;
};

export function napKulonbseg(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

export function partnerOsszesites(megbizasok: PartnerBemenet[], ma: string): PartnerSor[] {
  const m = new Map<string, PartnerSor>();
  for (const x of megbizasok) {
    if (x.jelleg !== "ber") continue;
    const nev = (x.partner ?? "").trim() || "Ismeretlen megbízó";
    const s = m.get(nev) ?? { partner: nev, db: 0, bevetelFt: 0, fedezetFt: 0, utolso: x.nap, elmaradt: false };
    s.db += 1;
    s.bevetelFt += x.bevetelFt ?? 0;
    s.fedezetFt += x.eredmenyFt ?? 0;
    if (x.nap > s.utolso) s.utolso = x.nap;
    m.set(nev, s);
  }
  const sorok = [...m.values()].map((s) => ({
    ...s,
    bevetelFt: Math.round(s.bevetelFt),
    fedezetFt: Math.round(s.fedezetFt),
    elmaradt: s.db >= 5 && napKulonbseg(s.utolso, ma) >= 21,
  }));
  return sorok.sort((a, b) => b.fedezetFt - a.fedezetFt || b.db - a.db);
}

/** „Ingyen” dolgozunk neki: legalább 3 fuvar, és a fedezet a bevétel 2%-a alatt (vagy negatív). */
export function ingyenesMegbizok(sorok: PartnerSor[]): { legrosszabb: PartnerSor | null; nullszaldo: PartnerSor[] } {
  const gyanus = sorok.filter((s) => s.db >= 3 && s.fedezetFt < Math.max(0, s.bevetelFt) * 0.02);
  const legrosszabb = [...gyanus].sort((a, b) => a.fedezetFt - b.fedezetFt)[0] ?? null;
  const nullszaldo = gyanus.filter((s) => s !== legrosszabb && Math.abs(s.fedezetFt) <= Math.max(25000, s.bevetelFt * 0.02));
  return { legrosszabb: legrosszabb && legrosszabb.fedezetFt < 0 ? legrosszabb : null, nullszaldo };
}

/** „+216 e”, „−1,2 M”: ezer Ft-ra kerekítve, előjellel. */
export function ezerFt(ft: number, elojel = true): string {
  const abs = Math.abs(ft);
  const jel = ft < 0 ? "−" : elojel && ft > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${jel}${(abs / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} M`;
  return `${jel}${Math.round(abs / 1000).toLocaleString("hu-HU")} e`;
}

const HONAPOK = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

export function honapNev(iso: string): string {
  return HONAPOK[+iso.slice(5, 7) - 1];
}

/** Az aktuális hónap és az előző 3 kezdete/vége (ISO), legrégebbi elöl. */
export function negyHonap(ma: string): { kezdet: string; veg: string; cimke: string; folyamatban: boolean }[] {
  const ev = +ma.slice(0, 4), ho = +ma.slice(5, 7) - 1;
  const ki: { kezdet: string; veg: string; cimke: string; folyamatban: boolean }[] = [];
  for (let i = 3; i >= 0; i--) {
    const k = new Date(Date.UTC(ev, ho - i, 1));
    const v = new Date(Date.UTC(ev, ho - i + 1, 0));
    const kezdet = k.toISOString().slice(0, 10);
    const veg = v.toISOString().slice(0, 10);
    const folyamatban = i === 0;
    const nev = honapNev(kezdet);
    ki.push({ kezdet, veg, folyamatban, cimke: folyamatban ? `${nev.slice(0, 3)}. 1–${+ma.slice(8, 10)}.` : nev });
  }
  return ki;
}
