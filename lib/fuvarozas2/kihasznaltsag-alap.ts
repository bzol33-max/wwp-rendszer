// Kocsi-kihasználtság — TISZTA modul (se DB, se hálózat). Az 1. hullám B része
// (docs/fuvarozas-1-hullam-terv.md): a Ma lap kocsinkénti sora ebből számol;
// az adatot a lib/fuvarozas2/kihasznaltsag.ts tölti be. Teszt:
// scripts/teszt-1hullam-kihasznaltsag.ts.
//
// Fő mérőszám: fedezet / kocsi / munkanap.
//   km-költség = (rakott + üres km) × (l/100 km ÷ 100 × Ft/l + útdíj Ft/km)
//   fedezet    = bérbevétel + saját fuvar belső díja − km-költség − napi fix × munkanap
// A saját (raklap-)fuvar belső díja (2026-10-17, Budaházi Zoltán: „1”): a saját
// fuvar rakott km-e × a bérfuvarok átlagos Ft/km-e — így a saját fuvar nem tiszta
// veszteség a kocsinál. A bevétel/nap is tartalmazza.
// Ft egészre, % egy tizedesre kerekítve. 0 munkanap → a napi értékek és a
// fizetős-nap arány null; 0 km → az üres km % null.

export type KocsiIdoszak = {
  munkanapok: number;
  berBevetelFt: number;
  rakottKm: number;
  uresKm: number;
  fizetosNapok: number;
  sajatNapok: number;
  fogyasztasL100: number;
  uzemanyagFtL: number;
  utdijFtKm: number;
  napiFixFt: number;
  /** Saját fuvarok belső díja (Ft), alapból 0. */
  sajatBevetelFt?: number;
};

export type Kihasznaltsag = {
  bevetelPerNap: number | null;
  fedezetPerNap: number | null;
  uresKmSzazalek: number | null;
  /** Fizetős napok ÷ munkanapok, törtként (0–1). */
  fizetosNapArany: number | null;
  kmKoltsegFt: number;
  fedezetFt: number;
};

export function kihasznaltsag(k: KocsiIdoszak): Kihasznaltsag {
  const osszKm = k.rakottKm + k.uresKm;
  const ftPerKm = (k.fogyasztasL100 / 100) * k.uzemanyagFtL + k.utdijFtKm;
  const kmKoltseg = osszKm * ftPerKm;
  const bevetel = k.berBevetelFt + (k.sajatBevetelFt ?? 0);
  const fedezet = bevetel - kmKoltseg - k.napiFixFt * k.munkanapok;
  const vanNap = k.munkanapok > 0;
  return {
    bevetelPerNap: vanNap ? Math.round(bevetel / k.munkanapok) : null,
    // A kerekítetlen fedezetből osztunk (egy kerekítés, nem kettő).
    fedezetPerNap: vanNap ? Math.round(fedezet / k.munkanapok) : null,
    uresKmSzazalek: osszKm > 0 ? Math.round((k.uresKm / osszKm) * 1000) / 10 : null,
    fizetosNapArany: vanNap ? k.fizetosNapok / k.munkanapok : null,
    kmKoltsegFt: Math.round(kmKoltseg),
    fedezetFt: Math.round(fedezet),
  };
}

/** "YYYY-MM-DD" napok [tol, ig] között, mindkét végét beleértve (ig < tol → üres). */
export function napokListaja(tol: string, ig: string): string[] {
  const ki: string[] = [];
  const d = new Date(`${tol}T12:00:00Z`);
  const veg = new Date(`${ig}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(veg.getTime())) return ki;
  while (d <= veg) {
    ki.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ki;
}

/** Hétköznap-e (H–P). Ünnepnapot nem ismer — a munkanap itt hétköznap. */
export function hetkoznapE(nap: string): boolean {
  const n = new Date(`${nap}T12:00:00Z`).getUTCDay();
  return n >= 1 && n <= 5;
}

/** A hétköznapok száma [tol, ig] között, mindkét végét beleértve. */
export function munkanapokSzama(tol: string, ig: string): number {
  return napokListaja(tol, ig).filter(hetkoznapE).length;
}

/**
 * A saját fuvar belső díja: rakott km × belső Ft/km (egészre kerekítve).
 * Nincs belső díj (null / ≤ 0) vagy nincs km → 0.
 */
export function sajatBelsoDij(rakottKm: number, belsoFtKm: number | null): number {
  if (belsoFtKm == null || !(belsoFtKm > 0) || !(rakottKm > 0)) return 0;
  return Math.round(rakottKm * belsoFtKm);
}
