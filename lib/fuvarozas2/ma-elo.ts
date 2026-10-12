// Ma oldal — élő nézet (az új terv 1. oldala, 2026-10-11): kocsinként hol
// van, megy/áll, mennyivel, merre, hova tart és mikorra, mai nyomvonal és
// idősáv. Tiszta függvények (scripts/teszt-ma-elo.ts); a bemenet a meglévő
// GPS-idővonal (lib/fuvarozas/actions.ts getIdovonalak) egy kocsira.

export type EloSzakasz =
  | { tipus: "indulas"; idopont: Date; cim: string | null; lat: number; lon: number }
  | { tipus: "vezetes"; kezdet: Date; veg: Date; honnan: string | null; hova: string | null; hovaLat: number; hovaLon: number; tavKm: number }
  | { tipus: "allas"; kezdet: Date; veg: Date; cim: string | null; lat: number; lon: number; kategoria: string };

export type EloMegallo = {
  tipus: "felrako" | "lerako";
  cim: string;
  idopont: Date;
  elhagyva: boolean;
  eppenItt: boolean;
  lat: number | null;
  lon: number | null;
};

export type EloBemenet = {
  pozicio: { lat: number; lon: number; sebesseg: number; utolsoAdat: Date; motorJar: boolean; cim: string | null; irany?: number | null } | null;
  szakaszok: EloSzakasz[];
  megallok: EloMegallo[];
  eta: { cel: string; erkezes: Date; bizonytalan: boolean } | null;
  vezetesSec: number | null;
  utolsoSzunetVege: Date | null;
  napiKm: number | null;
  most: Date;
};

export type SavElem = { tipus: "vezetes" | "allas" | "rakodas" | "piheno"; tol: number; ig: number; cimke: string | null };
export type SavPont = { perc: number; cimke: string; tipus: "felrako" | "lerako"; kesz: boolean };

export type MaElo = {
  lat: number;
  lon: number;
  irany: number | null;
  /** „MEGY” / „ÁLL” / „NINCS JEL”. */
  allapot: "MEGY" | "ÁLL" | "NINCS JEL";
  /** A nagy szám: „84 km/h”, „59 p”, „1:20”. */
  szam: string;
  szin: "kek" | "borostyan" | "szurke";
  hely: string | null;
  motorJar: boolean;
  gpsKoraPerc: number;
  /** Mióta megy / áll (perc), ha ismert. */
  ota: number | null;
  kovetkezo: { cel: string; tipus: "felrako" | "lerako"; eta: string | null; etaNap: number; lat: number | null; lon: number | null } | null;
  napiKm: number | null;
  vezetesPerc: number | null;
  szunetigPerc: number | null;
  /** A mai megtett út pontjai, időrendben, a mostani pozícióval zárva. */
  nyomvonal: [number, number][];
  /** A hátralévő megállók (koordinátával), a tervezett út szaggatott vonalához. */
  hatraVan: { lat: number; lon: number; cim: string }[];
  /** A hátralévő terv úthálózaton (lib/fuvarozas2/ma-utvonal.ts); null/hiányzik: egyenes vonalak. */
  tervUt?: [number, number][] | null;
  sav: SavElem[];
  pontok: SavPont[];
};

const PERC = 60000;
const ALLAS_MIN_PERC = 3;

/** Percek Budapest szerinti éjféltől (0–1439); más napra eső időnél a nap eltolásával. */
export function budapestPerc(d: Date, maISO: string): number {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => { if (x.type !== "literal") a[x.type] = x.value; return a; }, {});
  const nap = `${p.year}-${p.month}-${p.day}`;
  const elteres = Math.round((Date.UTC(+nap.slice(0, 4), +nap.slice(5, 7) - 1, +nap.slice(8, 10)) - Date.UTC(+maISO.slice(0, 4), +maISO.slice(5, 7) - 1, +maISO.slice(8, 10))) / 86400000);
  return elteres * 1440 + Number(p.hour) * 60 + Number(p.minute);
}

function oraPerc(perc: number): string {
  const p = Math.max(0, Math.round(perc));
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, "0")}`;
}

export function idoTartam(perc: number): string {
  return perc >= 60 ? oraPerc(perc) : `${Math.max(0, Math.round(perc))} p`;
}

function hhmm(perc: number): string {
  const n = ((Math.round(perc) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function maEloKocsi(b: EloBemenet, maISO: string): MaElo | null {
  const p = b.pozicio;
  if (!p) return null;
  const gpsKoraPerc = Math.max(0, Math.round((b.most.getTime() - p.utolsoAdat.getTime()) / PERC));
  const mozog = p.sebesseg >= 5;
  const utolso = b.szakaszok[b.szakaszok.length - 1];

  let allapot: MaElo["allapot"];
  let szam: string;
  let szin: MaElo["szin"];
  let ota: number | null = null;
  if (gpsKoraPerc > 30) {
    allapot = "NINCS JEL";
    szam = idoTartam(gpsKoraPerc);
    szin = "szurke";
  } else if (mozog) {
    allapot = "MEGY";
    szam = `${Math.round(p.sebesseg)} km/h`;
    szin = "kek";
    if (utolso && utolso.tipus === "vezetes") ota = Math.round((b.most.getTime() - utolso.kezdet.getTime()) / PERC);
  } else {
    allapot = "ÁLL";
    szin = "borostyan";
    if (utolso && utolso.tipus === "allas") ota = Math.round((b.most.getTime() - utolso.kezdet.getTime()) / PERC);
    szam = ota != null ? idoTartam(ota) : "";
  }

  // Következő megálló: az első, amit még nem hagyott el és ahol most nem áll.
  const kov = b.megallok.find((m) => !m.elhagyva && !m.eppenItt) ?? null;
  const etaCelEgyezik = kov && b.eta && !b.eta.bizonytalan && b.eta.cel === kov.cim;
  const etaIdo = etaCelEgyezik ? b.eta!.erkezes : kov?.idopont ?? null;
  const etaPerc = etaIdo ? budapestPerc(etaIdo, maISO) : null;
  const kovetkezo = kov
    ? { cel: kov.cim, tipus: kov.tipus, eta: etaPerc != null ? hhmm(etaPerc) : null, etaNap: etaPerc != null ? Math.floor(etaPerc / 1440) : 0, lat: kov.lat, lon: kov.lon }
    : null;

  // Nyomvonal: indulás → megállások / vezetések célpontjai → mostani hely.
  const nyomvonal: [number, number][] = [];
  const hozzaad = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const u = nyomvonal[nyomvonal.length - 1];
    if (!u || Math.abs(u[0] - lat) > 1e-5 || Math.abs(u[1] - lon) > 1e-5) nyomvonal.push([lat, lon]);
  };
  for (const sz of b.szakaszok) {
    if (sz.tipus === "indulas" || sz.tipus === "allas") hozzaad(sz.lat, sz.lon);
    else hozzaad(sz.hovaLat, sz.hovaLon);
  }
  hozzaad(p.lat, p.lon);

  const hatraVan = b.megallok
    .filter((m) => !m.elhagyva && m.lat != null && m.lon != null)
    .map((m) => ({ lat: m.lat as number, lon: m.lon as number, cim: m.cim }));

  // Idősáv (perc a mai éjféltől).
  const sav: SavElem[] = [];
  for (const sz of b.szakaszok) {
    if (sz.tipus === "indulas") continue;
    const tol = budapestPerc(sz.kezdet, maISO);
    const ig = budapestPerc(sz.veg, maISO);
    if (ig <= tol) continue;
    if (sz.tipus === "vezetes") sav.push({ tipus: "vezetes", tol, ig, cimke: sz.hova });
    else if (ig - tol >= ALLAS_MIN_PERC) {
      const tipus: SavElem["tipus"] = sz.kategoria === "rakodas" ? "rakodas" : sz.kategoria === "piheno" ? "piheno" : "allas";
      sav.push({ tipus, tol, ig, cimke: sz.cim });
    }
  }
  const pontok: SavPont[] = b.megallok.map((m) => ({ perc: budapestPerc(m.idopont, maISO), cimke: m.cim, tipus: m.tipus, kesz: m.elhagyva }));

  let szunetigPerc: number | null = null;
  const vezetesPerc = b.vezetesSec != null ? Math.round(b.vezetesSec / 60) : null;
  if (vezetesPerc != null) {
    const szunetOta = b.utolsoSzunetVege ? Math.round((b.most.getTime() - b.utolsoSzunetVege.getTime()) / PERC) : vezetesPerc;
    szunetigPerc = Math.max(0, 270 - Math.min(szunetOta, vezetesPerc));
  }

  return {
    lat: p.lat, lon: p.lon, irany: p.irany ?? null,
    allapot, szam, szin, hely: p.cim, motorJar: p.motorJar, gpsKoraPerc, ota,
    kovetkezo, napiKm: b.napiKm, vezetesPerc, szunetigPerc,
    nyomvonal, hatraVan, sav, pontok,
  };
}

/** Az idősáv látható ablaka (perc): alapból 05–22, de kitágul, ha korábban/később is történt valami ma. */
export function savAblak(elemek: { tol: number; ig: number }[], pontok: { perc: number }[], mostPerc: number): { tol: number; ig: number } {
  let tol = 5 * 60;
  let ig = 22 * 60;
  for (const e of elemek) { tol = Math.min(tol, e.tol); ig = Math.max(ig, e.ig); }
  for (const p of pontok) if (p.perc >= 0 && p.perc < 1440) { tol = Math.min(tol, p.perc); ig = Math.max(ig, p.perc); }
  tol = Math.max(0, Math.min(tol, mostPerc));
  ig = Math.min(1440, Math.max(ig, mostPerc));
  return { tol: Math.floor(tol / 60) * 60, ig: Math.ceil(ig / 60) * 60 };
}
