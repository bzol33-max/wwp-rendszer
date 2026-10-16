// Járművek modul — típusok és tiszta segédek (se "use server", se DB):
// a felület, a szerver-akciók és a tesztek (scripts/teszt-jarmu-torzs.ts)
// közösen használják.

import type { JarmuSzin } from "@/lib/fuvarozas/vehicles";

export type JarmuAdat = {
  id: string;
  kod: string;
  cimke: string;
  soforBecenev: string | null;
  vontatoRendszam: string | null;
  potkocsiId: string | null;
  potkocsiRendszam: string | null;
  irasvaltozatok: string[];
  szin: JarmuSzin;
  ecofleetObjectId: string | null;
  soforId: string | null;
  soforNev: string | null;
  fogyasztasL100: number | null;
  euroOsztaly: string | null;
  hugoKategoria: string | null;
  ossztomegT: number | null;
  alapTelephelyPontId: string | null;
  alapTelephelyNev: string | null;
  megjegyzes: string | null;
  aktiv: boolean;
};

export type PotkocsiAdat = {
  id: string;
  rendszam: string;
  tipus: string | null;
  raklaphelyNormal: number | null;
  raklaphelyForgatott: number | null;
  raklapDbNormal: number | null;
  raklapDbForgatott: number | null;
  megjegyzes: string | null;
  aktiv: boolean;
};

export const OKMANY_TIPUSOK = ["kgfb", "casco", "arufuvarozoi", "muszaki", "lizing", "tacho_kalibralas", "egyeb"] as const;
export type OkmanyTipus = (typeof OKMANY_TIPUSOK)[number];
export const OKMANY_TIPUS_CIMKE: Record<OkmanyTipus, string> = {
  kgfb: "KGFB",
  casco: "Casco",
  arufuvarozoi: "Árufuvarozói felelősség",
  muszaki: "Műszaki vizsga",
  lizing: "Lízing",
  tacho_kalibralas: "Tachográf-kalibrálás",
  egyeb: "Egyéb",
};

export type OkmanyAdat = {
  id: string;
  jarmuId: string | null;
  potkocsiId: string | null;
  /** A jármű címkéje vagy a pótkocsi rendszáma — megjelenítéshez. */
  targy: string;
  tipus: OkmanyTipus;
  szam: string | null;
  partner: string | null;
  /** YYYY-MM-DD vagy null. */
  lejarat: string | null;
  megjegyzes: string | null;
};

export type SoforProfilAdat = {
  alkalmazottId: string;
  nev: string;
  jogositvanyLejar: string | null;
  gkiLejar: string | null;
  tachokartyaSzam: string | null;
  tachokartyaLejar: string | null;
  adrLejar: string | null;
  megjegyzes: string | null;
};

export type TelephelyPontAdat = { id: string; nev: string; tipus: string };
export type AlkalmazottValasztas = { id: string; nev: string };

export type JarmuvekOldal = {
  /** false, ha a 031-es migráció még nem futott (a törzsadat-táblák hiányoznak). */
  torzsKesz: boolean;
  /** YYYY-MM-DD, budapesti nap — a lejárat-jelzés ehhez viszonyít. */
  ma: string;
  jarmuvek: JarmuAdat[];
  potkocsik: PotkocsiAdat[];
  okmanyok: OkmanyAdat[];
  soforok: SoforProfilAdat[];
  alkalmazottak: AlkalmazottValasztas[];
  telephelyek: TelephelyPontAdat[];
  /** A fuvar_beallitas alap fogyasztása (l/100 km) — az új jármű űrlapjának alapértéke. */
  alapFogyasztasL100: number;
  /** CAN-telemetria jármű-id szerint (utolsó 7 nap); hiányzik, ha a tábla nincs vagy üres. */
  telemetria?: Record<string, JarmuTelemetria>;
};

// ---------------------------------------------------------------------------
// Lejárat

/** Ennyi napon belüli lejárat már figyelmeztet (sárga). */
export const LEJARAT_FIGYELMEZTETES_NAP = 30;

export type LejaratAllapot = "lejart" | "hamarosan" | "rendben";

function napSzam(iso: string): number {
  const [e, h, n] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(e, h - 1, n) / 86400000;
}

/** Hány nap van hátra a lejáratig (negatív: ennyi napja lejárt). */
export function hatralevoNap(lejarat: string, ma: string): number {
  return Math.round(napSzam(lejarat) - napSzam(ma));
}

/** Lejárt (a lejárat napja előtt vagyunk-e már túl), 30 napon belül, vagy rendben; null, ha nincs dátum. */
export function lejaratAllapot(lejarat: string | null | undefined, ma: string): LejaratAllapot | null {
  if (!lejarat || !ISO_NAP.test(lejarat.slice(0, 10))) return null;
  const nap = hatralevoNap(lejarat, ma);
  if (nap < 0) return "lejart";
  if (nap <= LEJARAT_FIGYELMEZTETES_NAP) return "hamarosan";
  return "rendben";
}

// ---------------------------------------------------------------------------
// Bemenetek és ellenőrzésük (a szerver-akciók ezzel tisztítanak)

export const ISO_NAP = /^\d{4}-\d{2}-\d{2}$/;

export function normalRendszam(r: string): string {
  return r.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/** Szabad szövegű rendszám egységes alakra: nagybetű, szóközök nélkül ("aopu-427" → "AOPU-427"); üres → null. */
export function rendszamAlak(r: string | null | undefined): string | null {
  const t = (r ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return t.length ? t : null;
}

export type JarmuBemenet = {
  kod: string;
  cimke: string;
  soforBecenev: string;
  vontatoRendszam: string;
  potkocsiId: string;
  irasvaltozatok: string;
  szin: string;
  ecofleetObjectId: string;
  soforId: string;
  fogyasztasL100: string;
  euroOsztaly: string;
  hugoKategoria: string;
  ossztomegT: string;
  alapTelephelyPontId: string;
  megjegyzes: string;
  aktiv: boolean;
};

export type PotkocsiBemenet = {
  rendszam: string;
  tipus: string;
  raklaphelyNormal: string;
  raklaphelyForgatott: string;
  raklapDbNormal: string;
  raklapDbForgatott: string;
  megjegyzes: string;
  aktiv: boolean;
};

export type OkmanyBemenet = {
  /** "jarmu:<id>" vagy "potkocsi:<id>" */
  targy: string;
  tipus: string;
  szam: string;
  partner: string;
  lejarat: string;
  megjegyzes: string;
};

export type SoforProfilBemenet = {
  jogositvanyLejar: string;
  gkiLejar: string;
  tachokartyaSzam: string;
  tachokartyaLejar: string;
  adrLejar: string;
  megjegyzes: string;
};

const ures = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

function szamVagyNull(s: string, nev: string, opts: { egesz?: boolean; min?: number; max?: number } = {}): number | null {
  const t = (s ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${nev}: nem szám.`);
  if (opts.egesz && !Number.isInteger(n)) throw new Error(`${nev}: egész szám kell.`);
  if (opts.min != null && n < opts.min) throw new Error(`${nev}: legalább ${opts.min}.`);
  if (opts.max != null && n > opts.max) throw new Error(`${nev}: legfeljebb ${opts.max}.`);
  return n;
}

function idVagyNull(s: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) throw new Error("Érvénytelen azonosító.");
  return t;
}

function datumVagyNull(s: string, nev: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (!ISO_NAP.test(t)) throw new Error(`${nev}: érvénytelen dátum.`);
  return t;
}

export type TisztaJarmu = {
  kod: string;
  cimke: string;
  soforBecenev: string;
  vontatoRendszam: string | null;
  potkocsiId: string | null;
  irasvaltozatok: string[];
  szin: JarmuSzin;
  ecofleetObjectId: string | null;
  soforId: string | null;
  fogyasztasL100: number | null;
  euroOsztaly: string | null;
  hugoKategoria: string | null;
  ossztomegT: number | null;
  alapTelephelyPontId: string | null;
  megjegyzes: string | null;
  aktiv: boolean;
};

const SZINEK: JarmuSzin[] = ["blue", "yellow", "green", "purple"];

/** A jármű-űrlap ellenőrzése és tisztítása — hibánál magyar üzenetű Error. */
export function tisztitJarmu(b: JarmuBemenet): TisztaJarmu {
  const vontato = rendszamAlak(b.vontatoRendszam);
  const kod = (b.kod ?? "").trim().toUpperCase() || vontato || "";
  if (!kod) throw new Error("A kód kötelező (rendszám nélküli járműnél is, pl. JANI).");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(kod)) throw new Error("A kód 2–20 karakter: betű, szám, kötőjel.");
  const becenev = (b.soforBecenev ?? "").trim();
  if (!becenev) throw new Error("A sofőr rövid neve kötelező (így jelenik meg a kocsi mindenhol, pl. „Gergő”).");
  if (becenev.length > 30) throw new Error("A sofőr rövid neve legfeljebb 30 karakter.");
  if (!SZINEK.includes(b.szin as JarmuSzin)) throw new Error("Érvénytelen szín.");
  const eco = ures(b.ecofleetObjectId);
  if (eco && !/^\d{1,12}$/.test(eco)) throw new Error("Az Ecofleet azonosító csak számjegy lehet (üres = nincs GPS).");
  const irasvaltozatok = (b.irasvaltozatok ?? "")
    .split(/[,;\n]/)
    .map((r) => rendszamAlak(r))
    .filter((r): r is string => !!r);
  return {
    kod,
    cimke: ures(b.cimke) ?? (vontato ?? kod),
    soforBecenev: becenev,
    vontatoRendszam: vontato,
    potkocsiId: idVagyNull(b.potkocsiId),
    irasvaltozatok,
    szin: b.szin as JarmuSzin,
    ecofleetObjectId: eco,
    soforId: idVagyNull(b.soforId),
    fogyasztasL100: szamVagyNull(b.fogyasztasL100, "Fogyasztás", { min: 5, max: 80 }),
    euroOsztaly: ures(b.euroOsztaly),
    hugoKategoria: ures(b.hugoKategoria),
    ossztomegT: szamVagyNull(b.ossztomegT, "Össztömeg", { min: 1, max: 60 }),
    alapTelephelyPontId: idVagyNull(b.alapTelephelyPontId),
    megjegyzes: ures(b.megjegyzes),
    aktiv: !!b.aktiv,
  };
}

export type TisztaPotkocsi = {
  rendszam: string;
  tipus: string | null;
  raklaphelyNormal: number | null;
  raklaphelyForgatott: number | null;
  raklapDbNormal: number | null;
  raklapDbForgatott: number | null;
  megjegyzes: string | null;
  aktiv: boolean;
};

export function tisztitPotkocsi(b: PotkocsiBemenet): TisztaPotkocsi {
  const rendszam = rendszamAlak(b.rendszam);
  if (!rendszam) throw new Error("A pótkocsi rendszáma kötelező.");
  return {
    rendszam,
    tipus: ures(b.tipus),
    raklaphelyNormal: szamVagyNull(b.raklaphelyNormal, "Raklaphely (normál)", { egesz: true, min: 0, max: 100 }),
    raklaphelyForgatott: szamVagyNull(b.raklaphelyForgatott, "Raklaphely (forgatott)", { egesz: true, min: 0, max: 100 }),
    raklapDbNormal: szamVagyNull(b.raklapDbNormal, "Raklap db (normál)", { egesz: true, min: 0, max: 5000 }),
    raklapDbForgatott: szamVagyNull(b.raklapDbForgatott, "Raklap db (forgatott)", { egesz: true, min: 0, max: 5000 }),
    megjegyzes: ures(b.megjegyzes),
    aktiv: !!b.aktiv,
  };
}

export type TisztaOkmany = {
  jarmuId: string | null;
  potkocsiId: string | null;
  tipus: OkmanyTipus;
  szam: string | null;
  partner: string | null;
  lejarat: string | null;
  megjegyzes: string | null;
};

export function tisztitOkmany(b: OkmanyBemenet): TisztaOkmany {
  const m = /^(jarmu|potkocsi):(\d+)$/.exec((b.targy ?? "").trim());
  if (!m) throw new Error("Válaszd ki, melyik járműhöz vagy pótkocsihoz tartozik.");
  if (!(OKMANY_TIPUSOK as readonly string[]).includes(b.tipus)) throw new Error("Érvénytelen okmány-típus.");
  return {
    jarmuId: m[1] === "jarmu" ? m[2] : null,
    potkocsiId: m[1] === "potkocsi" ? m[2] : null,
    tipus: b.tipus as OkmanyTipus,
    szam: ures(b.szam),
    partner: ures(b.partner),
    lejarat: datumVagyNull(b.lejarat, "Lejárat"),
    megjegyzes: ures(b.megjegyzes),
  };
}

export type TisztaSoforProfil = {
  jogositvanyLejar: string | null;
  gkiLejar: string | null;
  tachokartyaSzam: string | null;
  tachokartyaLejar: string | null;
  adrLejar: string | null;
  megjegyzes: string | null;
};

export function tisztitSoforProfil(b: SoforProfilBemenet): TisztaSoforProfil {
  return {
    jogositvanyLejar: datumVagyNull(b.jogositvanyLejar, "Jogosítvány lejárata"),
    gkiLejar: datumVagyNull(b.gkiLejar, "GKI lejárata"),
    tachokartyaSzam: ures(b.tachokartyaSzam),
    tachokartyaLejar: datumVagyNull(b.tachokartyaLejar, "Tachográf-kártya lejárata"),
    adrLejar: datumVagyNull(b.adrLejar, "ADR lejárata"),
    megjegyzes: ures(b.megjegyzes),
  };
}

/**
 * Új jármű alapszíne: az első szín, amelyet még egyik AKTÍV jármű sem visel
 * (sorrend: JARMU_SZINEK). Ha mind foglalt, a legritkábban használt.
 * (Korábban minden új jármű lila lett, akkor is, ha egy másik már az volt.)
 */
export function elsoSzabadSzin(hasznalt: JarmuSzin[], szinek: readonly JarmuSzin[]): JarmuSzin {
  const db = new Map<JarmuSzin, number>(szinek.map((s) => [s, 0]));
  for (const h of hasznalt) if (db.has(h)) db.set(h, (db.get(h) ?? 0) + 1);
  const szabad = szinek.find((s) => (db.get(s) ?? 0) === 0);
  if (szabad) return szabad;
  return [...szinek].sort((a, b) => (db.get(a) ?? 0) - (db.get(b) ?? 0))[0];
}

// ---------------------------------------------------------------------------
// CAN-telemetria (Ecofleet, jarmu_can_nap) — a Járművek lista három oszlopa

/** A jarmu_can_nap egy napi sorának az a része, ami a listához kell (a canNapok() sorai ennek megfelelnek; a numeric szövegként is jöhet). */
export type CanNapSor = {
  nap: string;
  literCan: number | string | null;
  kmCan: number | string | null;
  szervizHatraKm: number | string | null;
  szervizMegbizhato: boolean | null;
  tengelyTerhelesKg: Record<string, number> | string | null;
};

export type JarmuTelemetria = {
  /** Utolsó ismert szervizig hátralévő km; null: nincs adat. */
  szervizHatraKm: number | null;
  /** false: a jármű nem küld értelmes szerviz-távot („—”). */
  szervizMegbizhato: boolean;
  /** Σ liter / Σ km × 100 a megadott napokon, ha Σ km ≥ 100; különben null. */
  canL100: number | null;
  canKm: number;
  /** Utolsó tengelyterhelés összesen (kg) és tengelyenként. */
  tengelyOsszKg: number | null;
  tengelyek: Record<string, number> | null;
};

const szamE = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function tengelyParse(v: CanNapSor["tengelyTerhelesKg"]): Record<string, number> | null {
  let o: unknown = v;
  if (typeof v === "string") {
    try { o = JSON.parse(v); } catch { return null; }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const ki: Record<string, number> = {};
  for (const [k, x] of Object.entries(o)) {
    const n = szamE(x);
    if (n != null) ki[k] = n;
  }
  return Object.keys(ki).length ? ki : null;
}

/** Egy jármű napi CAN-soraiból a lista oszlopai (tiszta, tesztelhető). Üres bemenet → null. */
export function jarmuTelemetriaOsszesit(sorok: CanNapSor[]): JarmuTelemetria | null {
  if (!sorok.length) return null;
  const rend = [...sorok].sort((a, b) => a.nap.localeCompare(b.nap));
  let liter = 0, km = 0;
  for (const s of rend) {
    const l = szamE(s.literCan), k = szamE(s.kmCan);
    if (l != null && k != null && k > 0) { liter += l; km += k; }
  }
  const szervizSor = [...rend].reverse().find((s) => szamE(s.szervizHatraKm) != null);
  const tengelySor = [...rend].reverse().map((s) => tengelyParse(s.tengelyTerhelesKg)).find((t) => t != null) ?? null;
  return {
    szervizHatraKm: szervizSor ? szamE(szervizSor.szervizHatraKm) : null,
    szervizMegbizhato: !!szervizSor?.szervizMegbizhato,
    canL100: km >= 100 ? Math.round((liter / km) * 1000) / 10 : null,
    canKm: Math.round(km),
    tengelyOsszKg: tengelySor ? Math.round(Object.values(tengelySor).reduce((a, b) => a + b, 0)) : null,
    tengelyek: tengelySor,
  };
}
