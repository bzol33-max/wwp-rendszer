// Használati napló (db/migrations/039_oldal_megnyitas.sql) — tiszta logika:
// mely útvonal naplózandó, mit tartunk meg a query-stringből, 30 mp-es
// dedup, és a Rendszer-lap „Használat (14 nap)” összesítése.
// Teszt: scripts/teszt-oldal-naplo.ts.

/** A query-stringből CSAK ezek maradnak meg (nézet-választók, nincs bennük személyes adat). */
export const MEGTARTOTT_KULCSOK = ["het", "m", "nezet", "tab"] as const;
export const DEDUP_MS = 30_000;
const MAX_UTVONAL = 200;
const MAX_ERTEK = 40;

/**
 * Naplózandó-e az útvonal: /fuvarozas2, /m és /erkezes (és alattuk). Az
 * /erkezes (a régi dolgozói nézet) 2026-10-16 óta: a kivezetése előtt látni
 * kell, ki használja még (docs/fuvarozas-1-hullam-terv.md D8).
 */
export function naplozando(utvonal: string | null | undefined): boolean {
  if (!utvonal || utvonal.length > MAX_UTVONAL) return false;
  return /^\/(fuvarozas2|m|erkezes)(\/|$)/.test(utvonal);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Az útvonal egységesítése: a záró perjel le, az azonosító-szakaszok
 * (szám, uuid, hosszú hex) „[id]”-re — így a /megbizasok/123 és /456
 * ugyanannak a lapnak számít.
 */
export function egysegesUtvonal(utvonal: string): string {
  const u = utvonal
    .split("/")
    .map((s) => (/^\d+$/.test(s) || UUID.test(s) || /^[0-9a-f]{16,}$/i.test(s) ? "[id]" : s))
    .join("/");
  return u.length > 1 && u.endsWith("/") ? u.slice(0, -1) : u;
}

/** A query-stringből a megtartott kulcsok, ábécérendben, röviden („het=41&nezet=lista”); üres → null. */
export function szurtParameter(kereses: string | URLSearchParams | null | undefined): string | null {
  if (!kereses) return null;
  const p = typeof kereses === "string" ? new URLSearchParams(kereses.startsWith("?") ? kereses.slice(1) : kereses) : kereses;
  const ki: string[] = [];
  for (const k of MEGTARTOTT_KULCSOK) {
    const v = p.get(k);
    if (v === null || v === "") continue;
    ki.push(`${k}=${v.slice(0, MAX_ERTEK)}`);
  }
  return ki.length ? ki.join("&") : null;
}

/**
 * Dedup: ugyanazt a kulcsot (felhasználó + útvonal) 30 mp-en belül egyszer
 * számoljuk. A `utolso` térképet helyben frissíti; true, ha naplózni kell.
 */
export function kuldeniKell(utolso: Map<string, number>, kulcs: string, most: number, ablakMs = DEDUP_MS): boolean {
  const elozo = utolso.get(kulcs);
  if (elozo !== undefined && most - elozo < ablakMs) return false;
  utolso.set(kulcs, most);
  // Ne nőjön a végtelenségig (nyitva hagyott fül / hosszan futó szerver).
  if (utolso.size > 200) {
    for (const [k, t] of utolso) if (most - t >= ablakMs) utolso.delete(k);
  }
  return true;
}

export type HasznalatSor = { utvonal: string; felhasznalo: string; db: number; utoljara: string };
export type HasznalatUtvonal = {
  utvonal: string;
  db: number;
  utoljara: string;
  felhasznalok: { felhasznalo: string; db: number; utoljara: string }[];
};

/** Útvonalanként összesít (megnyitás szerint csökkenő), felhasználónkénti bontással. */
export function hasznalatOsszesit(sorok: HasznalatSor[]): HasznalatUtvonal[] {
  const m = new Map<string, HasznalatUtvonal>();
  for (const s of sorok) {
    const u = m.get(s.utvonal) ?? { utvonal: s.utvonal, db: 0, utoljara: s.utoljara, felhasznalok: [] };
    u.db += s.db;
    if (Date.parse(s.utoljara) > Date.parse(u.utoljara)) u.utoljara = s.utoljara;
    u.felhasznalok.push({ felhasznalo: s.felhasznalo, db: s.db, utoljara: s.utoljara });
    m.set(s.utvonal, u);
  }
  const ki = [...m.values()];
  for (const u of ki) u.felhasznalok.sort((a, b) => b.db - a.db || a.felhasznalo.localeCompare(b.felhasznalo));
  return ki.sort((a, b) => b.db - a.db || a.utvonal.localeCompare(b.utvonal));
}
