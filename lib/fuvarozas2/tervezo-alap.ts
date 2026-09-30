// A Tervezés (2026-09-30, Budaházi Zoltán: „bejövő · döntés · hét”) tiszta
// számtana: egy kocsi hetének eredménye a fuvarok láncával (a köztes üres
// utakkal), egy új fuvar heti hatása, ütközés, ár-előzmény és célár.
// Nincs adatbázis, nincs hálózat — scripts/teszt-tervezo.ts teszteli.
//
// BECSLÉS: a rakott km a fuvar tárolt értéke (HU-GO, óránként számolva), az
// üres utak légvonalból ×1,3 (mint a régi Tervezésben), az útdíj a tárolt
// kalkulációból vagy km-arányosan. A napi költség a hét munkanapjaira FIX
// (a kocsi akkor is költ, ha áll), ezért egy új fuvar hatása: a bevétele
// mínusz a pluszban elmenő üzemanyag és útdíj.

export type Pont = { lat: number; lon: number };

export type HetFuvar = {
  id: string;
  jelleg: "ber" | "sajat";
  felrakasNap: string;
  lerakasNap: string;
  felrako: Pont | null;
  lerako: Pont | null;
  /** HU-GO szerinti rakott km, ha ki van számolva. */
  rakottKm: number | null;
  /** Bérfuvar díja Ft-ban (EUR-os díjnál null — azt nem váltjuk át). */
  dijFt: number | null;
  /** A rakott út útdíja a tárolt kalkulációból, ha van. */
  utdijFt: number | null;
};

export type HetParam = {
  telephely: Pont;
  fogyasztasL100: number;
  gazolajFt: number;
  napiFt: number;
  munkanapok: number;
  /** Útdíj km-enként, ha a szakaszra nincs tárolt érték. */
  utdijPerKm: number;
};

export type HetEredmeny = {
  fuvarDb: number;
  bevetel: number;
  rakottKm: number;
  uresKm: number;
  uzemanyagFt: number;
  utdijFt: number;
  napiFt: number;
  onkoltseg: number;
  eredmeny: number;
  /** Üres km aránya az összes km-ből, százalék. */
  uresArany: number;
};

export const KOZUTI_SZORZO = 1.3;

/** Közúti becslés légvonalból (haversine × 1,3), km. */
export function legvonalKm(a: Pont, b: Pont): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * KOZUTI_SZORZO);
}

const sorrend = (a: HetFuvar, b: HetFuvar) => a.felrakasNap.localeCompare(b.felrakasNap) || a.lerakasNap.localeCompare(b.lerakasNap) || Number(a.id) - Number(b.id);

/** Egy kocsi hete: `kezdo` az, ahol a hét elején áll (az előző lerakó vagy a telephely). */
export function hetEredmeny(fuvarok: HetFuvar[], kezdo: Pont | null, p: HetParam): HetEredmeny {
  const lanc = [...fuvarok].sort(sorrend);
  let hol: Pont = kezdo ?? p.telephely;
  let rakottKm = 0, uresKm = 0, utdijFt = 0, bevetel = 0;
  for (const f of lanc) {
    if (f.felrako) {
      const ures = legvonalKm(hol, f.felrako);
      uresKm += ures;
      utdijFt += ures * p.utdijPerKm;
    }
    const km = f.rakottKm ?? (f.felrako && f.lerako ? legvonalKm(f.felrako, f.lerako) : 0);
    rakottKm += km;
    utdijFt += f.utdijFt ?? km * p.utdijPerKm;
    if (f.jelleg === "ber" && f.dijFt) bevetel += f.dijFt;
    hol = f.lerako ?? f.felrako ?? hol;
  }
  if (lanc.length > 0) {
    const haza = legvonalKm(hol, p.telephely);
    uresKm += haza;
    utdijFt += haza * p.utdijPerKm;
  }
  const uzemanyagFt = ((rakottKm + uresKm) * p.fogyasztasL100 / 100) * p.gazolajFt;
  const napiFt = p.munkanapok * p.napiFt;
  const onkoltseg = uzemanyagFt + utdijFt + napiFt;
  const osszKm = rakottKm + uresKm;
  return {
    fuvarDb: lanc.length,
    bevetel: Math.round(bevetel),
    rakottKm: Math.round(rakottKm),
    uresKm: Math.round(uresKm),
    uzemanyagFt: Math.round(uzemanyagFt),
    utdijFt: Math.round(utdijFt),
    napiFt: Math.round(napiFt),
    onkoltseg: Math.round(onkoltseg),
    eredmeny: Math.round(bevetel - onkoltseg),
    uresArany: osszKm > 0 ? Math.round((uresKm / osszKm) * 100) : 0,
  };
}

/** Két napintervallum (YYYY-MM-DD, zárt) átfed-e. */
export function atfed(a: { felrakasNap: string; lerakasNap: string }, b: { felrakasNap: string; lerakasNap: string }): boolean {
  return a.felrakasNap <= b.lerakasNap && b.felrakasNap <= a.lerakasNap;
}

/** Mennyivel változik a hét eredménye, ha az `uj` fuvar is bekerül; ütközik-e meglévővel. */
export function hetHatas(fuvarok: HetFuvar[], uj: HetFuvar, kezdo: Pont | null, p: HetParam): { nelkule: HetEredmeny; vele: HetEredmeny; hatas: number; utkozik: boolean } {
  const tobbi = fuvarok.filter((f) => f.id !== uj.id);
  const nelkule = hetEredmeny(tobbi, kezdo, p);
  const vele = hetEredmeny([...tobbi, uj], kezdo, p);
  return { nelkule, vele, hatas: vele.eredmeny - nelkule.eredmeny, utkozik: tobbi.some((f) => atfed(f, uj)) };
}

/** A legjobb kocsi: a nem ütköző jelöltek közül a legnagyobb heti hatású; ha mind ütközik, null. */
export function legjobbKocsi<T extends { hatas: number; utkozik: boolean }>(jeloltek: T[]): T | null {
  const jo = jeloltek.filter((j) => !j.utkozik);
  return jo.length === 0 ? null : jo.reduce((a, b) => (b.hatas > a.hatas ? b : a));
}

/** Ár-előzmény: a mostani Ft/km eltérése a korábbiak átlagától, százalékban (null, ha nincs mihez mérni). */
export function elozmenyElteres(mostFtKm: number | null, korabbiFtKm: (number | null)[]): { atlag: number | null; eltere: number | null } {
  const ertek = korabbiFtKm.filter((x): x is number => x != null && x > 0);
  if (ertek.length === 0) return { atlag: null, eltere: null };
  const atlag = Math.round(ertek.reduce((a, b) => a + b, 0) / ertek.length);
  return { atlag, eltere: mostFtKm != null && mostFtKm > 0 ? Math.round(((mostFtKm - atlag) / atlag) * 100) : null };
}

/** Célár: az önköltség + a kívánt árrés (a díjhoz mérve), 5 000 Ft-ra felfelé kerekítve. */
export function celar(onkoltsegFt: number, arres = 0.08): number {
  return Math.ceil(onkoltsegFt / (1 - arres) / 5000) * 5000;
}
