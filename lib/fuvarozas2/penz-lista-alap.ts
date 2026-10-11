// Megbízások · pénz-nézet (az új terv 3. oldala, 2026-10-11): papír, számla,
// pénz megbízásonként. Tiszta besorolás és összesítés; az adat a meglévő
// megbízás-sorból és a Számlázz.hu-ból szinkronizált `szamla` táblából jön.
// Teszt: scripts/teszt-penz-lista.ts.

export type PenzSzuro = "teendo" | "szamlazatlan" | "papir" | "kikuldve" | "lejart" | "fizetve" | "mind";
export const PENZ_SZUROK: { k: PenzSzuro; c: string }[] = [
  { k: "teendo", c: "Teendő" },
  { k: "szamlazatlan", c: "Számlázatlan" },
  { k: "papir", c: "Papír hiányzik" },
  { k: "kikuldve", c: "Kiküldve" },
  { k: "lejart", c: "Lejárt" },
  { k: "fizetve", c: "Fizetve" },
  { k: "mind", c: "Mind" },
];

const KESZ = new Set(["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"]);

export type PenzBemenet = {
  id: string;
  jelleg: "ber" | "sajat";
  allapot: string;
  nap: string;
  fuvardij: number | null;
  penznem: string;
  szamlaSzam: string | null;
  vanPapir: boolean;
  szamla: { brutto: number; fizetett: number; penznem: string; kiallitas: string; hatarido: string | null; fizetve: boolean; fizetveNap: string | null } | null;
};

export type PenzAllapot = {
  kesz: boolean;
  szamlazatlan: boolean;
  papirHianyzik: boolean;
  kikuldve: boolean;
  lejart: boolean;
  fizetve: boolean;
  /** Napok a lerakás óta (papír / számlázatlan kora). */
  kor: number;
  /** Lejárt számlánál hány napja. */
  lejartNap: number;
};

export function napKul(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86400000);
}

export function penzAllapot(s: PenzBemenet, ma: string): PenzAllapot {
  const kesz = KESZ.has(s.allapot);
  const ber = s.jelleg === "ber";
  const szamlazatlan = kesz && ber && !s.szamlaSzam;
  // Papír: csak ami még nem ment tovább (teljesítve / számlázható) — a már
  // számlázott, postázott fuvar papírja nyilván megvolt; a saját fuvarnál
  // 60 napnál régebbit nem kérünk számon (régi adatban nincs fotó-jelölés).
  const kor = Math.max(0, napKul(s.nap, ma));
  const papirHianyzik = (s.allapot === "teljesitve" || s.allapot === "szamlazhato") && !s.vanPapir && (ber || kor <= 60);
  const sz = s.szamla;
  const fizetve = !!sz?.fizetve;
  const nyitott = !!sz && !sz.fizetve;
  const lejart = nyitott && !!sz!.hatarido && sz!.hatarido < ma;
  const kikuldve = nyitott && !lejart;
  return {
    kesz, szamlazatlan, papirHianyzik, kikuldve, lejart, fizetve,
    kor,
    lejartNap: lejart ? napKul(sz!.hatarido!, ma) : 0,
  };
}

export function szurobeEsik(a: PenzAllapot, szuro: PenzSzuro): boolean {
  switch (szuro) {
    case "teendo": return a.szamlazatlan || a.papirHianyzik || a.lejart;
    case "szamlazatlan": return a.szamlazatlan;
    case "papir": return a.papirHianyzik;
    case "kikuldve": return a.kikuldve;
    case "lejart": return a.lejart;
    case "fizetve": return a.fizetve;
    case "mind": return true;
  }
}

/** Pénznemenkénti összeg: { Ft: 30000, EUR: 480 } → „480 EUR + 30 000 Ft”. */
export type Osszegek = Record<string, number>;
export function hozzaad(o: Osszegek, penznem: string, x: number) {
  const k = penznem === "HUF" ? "Ft" : penznem;
  o[k] = (o[k] ?? 0) + x;
}
export function osszegSzoveg(o: Osszegek): string {
  const r = Object.entries(o).filter(([, v]) => Math.round(v) !== 0).sort(([a], [b]) => (a === "Ft" ? 1 : b === "Ft" ? -1 : a.localeCompare(b)));
  return r.length ? r.map(([k, v]) => `${Math.round(v).toLocaleString("hu-HU")} ${k}`).join(" + ") : "0 Ft";
}

export type PenzOsszesito = {
  szamlazatlan: { db: number; osszeg: Osszegek };
  papir: { db: number; legregebbi: number };
  kintlevo: { osszeg: Osszegek; savok: [Osszegek, Osszegek, Osszegek] };
  lejart: { db: number; osszeg: Osszegek };
  befolyt: { db: number; osszeg: Osszegek };
  szamok: Record<PenzSzuro, number>;
};

/**
 * Összesítő a csempékhez. A számla-oldali összegek számlánként egyszer
 * számítanak (több megbízás is mutathat ugyanarra a számlára).
 */
export function osszesit(sorok: (PenzBemenet & { a: PenzAllapot })[], ma: string): PenzOsszesito {
  const o: PenzOsszesito = {
    szamlazatlan: { db: 0, osszeg: {} },
    papir: { db: 0, legregebbi: 0 },
    kintlevo: { osszeg: {}, savok: [{}, {}, {}] },
    lejart: { db: 0, osszeg: {} },
    befolyt: { db: 0, osszeg: {} },
    szamok: { teendo: 0, szamlazatlan: 0, papir: 0, kikuldve: 0, lejart: 0, fizetve: 0, mind: 0 },
  };
  const latottSzamla = new Set<string>();
  const honap = ma.slice(0, 7);
  for (const s of sorok) {
    for (const f of PENZ_SZUROK) if (szurobeEsik(s.a, f.k)) o.szamok[f.k]++;
    if (s.a.szamlazatlan) { o.szamlazatlan.db++; if (s.fuvardij) hozzaad(o.szamlazatlan.osszeg, s.penznem, s.fuvardij); }
    if (s.a.papirHianyzik) { o.papir.db++; o.papir.legregebbi = Math.max(o.papir.legregebbi, s.a.kor); }
    const sz = s.szamla;
    if (!sz || !s.szamlaSzam || latottSzamla.has(s.szamlaSzam)) continue;
    latottSzamla.add(s.szamlaSzam);
    if (!sz.fizetve) {
      const nyitott = Math.max(0, sz.brutto - sz.fizetett);
      hozzaad(o.kintlevo.osszeg, sz.penznem, nyitott);
      const kor = napKul(sz.kiallitas, ma);
      hozzaad(o.kintlevo.savok[kor <= 30 ? 0 : kor <= 60 ? 1 : 2], sz.penznem, nyitott);
      if (s.a.lejart) { o.lejart.db++; hozzaad(o.lejart.osszeg, sz.penznem, nyitott); }
    } else if (sz.fizetveNap?.slice(0, 7) === honap) {
      o.befolyt.db++;
      hozzaad(o.befolyt.osszeg, sz.penznem, sz.brutto);
    }
  }
  return o;
}
