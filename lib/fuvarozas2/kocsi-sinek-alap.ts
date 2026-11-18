// Megbízások „Kocsi-sínek” nézet — tiszta számítások (2026-11-18, Q5b-F terv,
// claude/megbizasok-kocsi-sinek-terv.md). Nincs DB, nincs React: a pecsétek,
// a lépésben töltött idő és a havi aggregátum itt tesztelhető
// (scripts/teszt-kocsi-sinek.ts).
import { napKul } from "@/lib/fuvarozas2/penz-lista-alap";

/** A 4 pecsét (saját fuvarnál 3: beérkezés · felvétel · lerakás=kész). */
export const PECSET_NEVEK = ["Beérk.", "Felvétel", "Lerakás", "Számla"] as const;
export type PecsetKulcs = "beerkezes" | "felvetel" | "lerakas" | "szamla";

export type PecsetBemenet = {
  jelleg: "ber" | "sajat";
  /** created_at (beérkezés) — ISO. */
  letrehozva_at: string;
  /** Első felrakó megálló: sofőr kész / GPS érkezés — ISO vagy null. */
  felvetel_at: string | null;
  /** Utolsó lerakó megálló: sofőr kész / GPS érkezés — ISO vagy null. */
  lerakas_at: string | null;
  /** Állapot, ha a megállók nem jelölték, de a fuvar már teljesítve/számlázható: allapot_at. */
  allapot: string;
  allapot_at: string | null;
  /** Párosított számla kelte (YYYY-MM-DD) vagy null. */
  szamla_kelte: string | null;
  /** Tervezett felrakás / lerakás nap (YYYY-MM-DD) — a „késik-e” küszöbhöz. */
  felrakas_nap: string | null;
  lerakas_nap: string | null;
};

export type Pecset = { kulcs: PecsetKulcs; nap: string | null; keso: "nem" | "sarga" | "piros" };

const TELJESITETT = new Set(["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"]);

function nap(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/**
 * A 4 (saját: 3) pecsét. Küszöbök (a terv szerint): felvétel a tervezett
 * felrakás napja után 1 nappal sárga, 2-vel piros; lerakás ugyanígy a lerakás
 * naphoz; számla a lerakás után 3 napig sárga, utána piros.
 */
export function pecsetek(b: PecsetBemenet, ma: string): Pecset[] {
  const beerk = nap(b.letrehozva_at);
  const felvetel = nap(b.felvetel_at) ?? (b.lerakas_at ? nap(b.lerakas_at) : null) ?? (TELJESITETT.has(b.allapot) ? nap(b.allapot_at) ?? b.felrakas_nap : null);
  const lerakas = nap(b.lerakas_at) ?? (TELJESITETT.has(b.allapot) ? nap(b.allapot_at) ?? b.lerakas_nap : null);
  const szamla = b.szamla_kelte;

  const keso = (kesz: string | null, hatar: string | null, sarga: number, piros: number): Pecset["keso"] => {
    if (kesz || !hatar) return "nem";
    const d = napKul(hatar, ma);
    return d >= piros ? "piros" : d >= sarga ? "sarga" : "nem";
  };
  const ki: Pecset[] = [
    { kulcs: "beerkezes", nap: beerk, keso: "nem" },
    { kulcs: "felvetel", nap: felvetel, keso: keso(felvetel, b.felrakas_nap, 1, 2) },
    { kulcs: "lerakas", nap: lerakas, keso: felvetel ? keso(lerakas, b.lerakas_nap ?? b.felrakas_nap, 1, 2) : "nem" },
  ];
  if (b.jelleg === "ber") ki.push({ kulcs: "szamla", nap: szamla, keso: lerakas ? keso(szamla, lerakas, 1, 4) : "nem" });
  return ki;
}

/** Hány napja áll a jelenlegi (utolsó megkapott) pecsétnél; a következő pecsét neve. */
export function lepesbenNap(p: Pecset[], ma: string): { nap: number; kovetkezo: PecsetKulcs | null } {
  const utolso = [...p].reverse().find((x) => x.nap);
  const kov = p.find((x) => !x.nap);
  return { nap: utolso?.nap ? Math.max(0, napKul(utolso.nap, ma)) : 0, kovetkezo: kov?.kulcs ?? null };
}

/** A jegy felső csíkjának színe: a legrosszabb késés dönt, különben a következő lépés színe. */
export function jegySzin(p: Pecset[]): "piros" | "sarga" | "beerkezes" | "felvetel" | "lerakas" | "szamla" | "kesz" {
  if (p.some((x) => x.keso === "piros")) return "piros";
  if (p.some((x) => x.keso === "sarga")) return "sarga";
  const kov = p.find((x) => !x.nap);
  return kov ? kov.kulcs : "kesz";
}

// ---------- havi aggregátum ----------
export type HaviFuvar = {
  id: string;
  jelleg: "ber" | "sajat";
  jarmu_kod: string | null;
  /** Lerakás napja (YYYY-MM-DD) — ez dönti el, melyik hónapé. */
  lerakas_nap: string | null;
  fuvardij: number | null;
  fuvardij_penznem: string;
  rakott_km: number | null;
  /** Számla kelte (YYYY-MM-DD) — az EUR árfolyam napja. */
  szamla_kelte: string | null;
};

export type HaviOsszesites = {
  ev: number; ho: number;
  /** Hónap napja (1-alapú) és napok száma a haladás-csíkhoz. */
  napMa: number; napokSzama: number;
  berDb: number; berFt: number; berEur: number; berEurFt: number; berElozetesEur: boolean;
  szamlazatlanFt: number;
  sajatDb: number; sajatKm: number; sajatBelsoFt: number; atlagFtKm: number | null;
  berRakottKm: number;
  kiadasFt: number | null; celFt: number | null;
  eredmenyFt: number | null; celSzazalek: number | null;
  /** Előző hónap ugyanezen napjáig számolt bérbevétel (Ft, EUR-ral együtt) és az eltérés %-a. */
  elozoFt: number; elozoSzazalek: number | null;
  kocsik: Record<string, { berFt: number; berDb: number; km: number; ftKm: number | null; sajatDb: number }>;
};

export function honapEleje(ma: string): string { return ma.slice(0, 8) + "01"; }
export function honapNapjai(ma: string): number {
  const [e, h] = ma.split("-").map(Number);
  return new Date(Date.UTC(e, h, 0)).getUTCDate();
}
export function elozoHonapUgyanezNap(ma: string): { tol: string; ig: string } {
  const [e, h, n] = ma.split("-").map(Number);
  const pe = h === 1 ? e - 1 : e, ph = h === 1 ? 12 : h - 1;
  const napok = new Date(Date.UTC(pe, ph, 0)).getUTCDate();
  const pad = (x: number) => String(x).padStart(2, "0");
  return { tol: `${pe}-${pad(ph)}-01`, ig: `${pe}-${pad(ph)}-${pad(Math.min(n, napok))}` };
}

/**
 * Havi összesítés. `arfolyam(nap)` az EUR árfolyam a számla keltére (vagy ha
 * nincs számla, a mai napra → „előzetes”). A saját belső díj: saját rakott km ×
 * a hónap bérfuvarjainak átlag Ft/rakott km-e (ha nincs bérfuvar km-mel: 0).
 */
export function haviOsszesites(
  ma: string,
  fuvarok: HaviFuvar[],
  elozoHoFuvarok: HaviFuvar[],
  arfolyam: (nap: string) => number | null,
  beallitas: { kiadasFt: number | null; celFt: number | null },
): HaviOsszesites {
  const [ev, ho, napMa] = ma.split("-").map(Number);
  const eurFt = (f: HaviFuvar, elozetes: { v: boolean }) => {
    const nap = f.szamla_kelte ?? ma;
    if (!f.szamla_kelte) elozetes.v = true;
    const a = arfolyam(nap);
    return a ? (f.fuvardij ?? 0) * a : 0;
  };
  const osszeg = (lista: HaviFuvar[]) => {
    const el = { v: false };
    let ft = 0, eur = 0, eurFtOssz = 0, db = 0, km = 0;
    for (const f of lista) {
      if (f.jelleg !== "ber") continue;
      db++;
      km += f.rakott_km ?? 0;
      if ((f.fuvardij_penznem || "Ft").toUpperCase() === "EUR") { eur += f.fuvardij ?? 0; eurFtOssz += eurFt(f, el); }
      else ft += f.fuvardij ?? 0;
    }
    return { ft, eur, eurFt: eurFtOssz, db, km, elozetes: el.v };
  };
  const b = osszeg(fuvarok);
  const osszBer = b.ft + b.eurFt;
  const atlagFtKm = b.km > 0 ? osszBer / b.km : null;
  const szamlazatlanFt = fuvarok.filter((f) => f.jelleg === "ber" && !f.szamla_kelte)
    .reduce((s, f) => s + ((f.fuvardij_penznem || "Ft").toUpperCase() === "EUR" ? (f.fuvardij ?? 0) * (arfolyam(ma) ?? 0) : (f.fuvardij ?? 0)), 0);
  const sajat = fuvarok.filter((f) => f.jelleg === "sajat");
  const sajatKm = sajat.reduce((s, f) => s + (f.rakott_km ?? 0), 0);
  const sajatBelsoFt = atlagFtKm ? sajatKm * atlagFtKm : 0;
  const e = osszeg(elozoHoFuvarok);
  const elozoFt = e.ft + e.eurFt;
  const kocsik: HaviOsszesites["kocsik"] = {};
  for (const f of fuvarok) {
    const k = f.jarmu_kod ?? "—";
    const c = (kocsik[k] ??= { berFt: 0, berDb: 0, km: 0, ftKm: null, sajatDb: 0 });
    if (f.jelleg === "sajat") { c.sajatDb++; c.km += f.rakott_km ?? 0; continue; }
    c.berDb++; c.km += f.rakott_km ?? 0;
    c.berFt += (f.fuvardij_penznem || "Ft").toUpperCase() === "EUR" ? eurFt(f, { v: false }) : (f.fuvardij ?? 0);
  }
  for (const c of Object.values(kocsik)) c.ftKm = c.km > 0 ? c.berFt / c.km : null;
  const bevetel = osszBer + sajatBelsoFt;
  return {
    ev, ho, napMa, napokSzama: honapNapjai(ma),
    berDb: b.db, berFt: b.ft, berEur: b.eur, berEurFt: b.eurFt, berElozetesEur: b.elozetes,
    szamlazatlanFt,
    sajatDb: sajat.length, sajatKm, sajatBelsoFt, atlagFtKm, berRakottKm: b.km,
    kiadasFt: beallitas.kiadasFt, celFt: beallitas.celFt,
    eredmenyFt: beallitas.kiadasFt == null ? null : bevetel - beallitas.kiadasFt,
    celSzazalek: beallitas.celFt ? Math.round((osszBer / beallitas.celFt) * 100) : null,
    elozoFt, elozoSzazalek: elozoFt > 0 ? Math.round(((osszBer - elozoFt) / elozoFt) * 100) : null,
    kocsik,
  };
}

/** „4 877 e Ft” / „12,3 M Ft” rövid pénzformátum a csempékhez. */
export function eFt(x: number | null | undefined): string {
  if (x == null) return "—";
  const a = Math.abs(x);
  if (a >= 10_000_000) return `${(x / 1_000_000).toFixed(1).replace(".", ",")} M Ft`;
  return `${String(Math.round(x / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} e Ft`;
}
