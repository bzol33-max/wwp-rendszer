// Fuvarszámla ↔ megbízás párosítás — a döntés, adatbázis nélkül.
//
// Tiszta modul (nincs "use server", nincs DB): a hívó
// (szinkronizalSzamlaSzamokat, lib/fuvarozas/megbizasok.ts) tölti be a
// számlázatlan bér fuvarokat és a párosítatlan fuvarszámlákat, ez dönt, a
// hívó ír. Így a valós esetekkel tesztelhető (scripts/teszt-szamla-parositas.ts).
//
// Két kör (Budaházi Zoltán, 2026-09-25 — „ilyenen nem bukhat a rendszer”):
//   1. SZÁM: a számla rendelésszáma a megbízás BÁRMELYIK számával egyezik
//      (pozíciószám, kanonikus hivatkozás, Reise ID, referencia), vagy a
//      megbízás irat-szövegében szerepel (pl. a Flott „Járatszám”-a, amit a
//      kiolvasás nem pozíciószámnak vett). Az egyezés írásmód-független:
//      ékezet, kis-nagybetű, szóköz, perjel, kötőjel nem számít.
//   2. TARTALÉK, ha nincs egyező szám: partner + összeg + dátum + útvonal
//      (honnan–hová) — mind a négynek egyeznie kell, és csak egyértelmű
//      (egy fuvar ↔ egy számla) találatot párosít.

import { varosNev } from "@/lib/fuvarozas/varos";

export type ParositasFuvar = {
  id: string;
  /** Megrendelő-nevek (törzs-név és a nyers megrendelő mező). */
  partnerNevek: string[];
  /** A megbízás saját számai: pozíciószám, kanonikus hivatkozás, Reise ID, referencia. */
  szamok: (string | null)[];
  /** A megbízás irat(ai)nak kiolvasott szövege (fuvar_import_naplo.nyers_szoveg). */
  nyersSzoveg: string | null;
  fuvardij: number | null;
  penznem: string | null;
  felrakasNap: string | null;
  lerakasNap: string | null;
  felrako: string | null;
  lerako: string | null;
};

export type ParositasSzamla = {
  szamlaszam: string;
  vevoNev: string;
  rendelesszam: string | null;
  netto: number | null;
  penznem: string | null;
  teljesitesNap: string | null;
  kiallitasNap: string | null;
  tetelekSzoveg: string | null;
  /** Már párosítva valamelyik fuvarhoz — a szám-körben még párosulhat (gyűjtőszámla), a többiben nem. */
  hasznalt?: boolean;
};

export type Parositas = { fuvarId: string; szamlaszam: string; mod: "szam" | "irat_szoveg" | "partner_osszeg_datum_utvonal" | "partner_osszeg_datum" };

/** Írásmód-független kulcs: ékezet, kis-nagybetű és minden nem betű/szám nélkül. */
export function szamKulcs(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Egy kulcs csak akkor használható számként, ha van benne számjegy és nem túl rövid. */
function ertelmesSzam(k: string): boolean {
  return k.length >= 4 && /\d/.test(k);
}

/** Az irat szövegének „szó”-kulcsai (a szóközök mentén darabolva), számként értelmesek. */
function iratKulcsok(szoveg: string | null): Set<string> {
  const ki = new Set<string>();
  if (!szoveg) return ki;
  for (const darab of szoveg.split(/\s+/)) {
    const k = szamKulcs(darab);
    if (ertelmesSzam(k)) ki.add(k);
  }
  return ki;
}

const CEGFORMA = new Set(["kft", "zrt", "bt", "nyrt", "kkt", "ev", "gmbh", "ltd", "sro", "as", "spzoo", "kg", "co"]);

function cegSzavak(nev: string): string[] {
  return nev
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !CEGFORMA.has(w));
}

/** A számla vevője és a megbízó ugyanaz-e: a rövidebb név minden szava szerepel a hosszabban. */
export function partnerEgyezik(vevoNev: string, partnerNevek: string[]): boolean {
  const v = cegSzavak(vevoNev);
  if (v.length === 0) return false;
  return partnerNevek.some((n) => {
    const p = cegSzavak(n ?? "");
    if (p.length === 0) return false;
    const [rovid, hosszu] = v.length <= p.length ? [v, new Set(p)] : [p, new Set(v)];
    return rovid.every((w) => hosszu.has(w));
  });
}

function osszegEgyezik(sz: ParositasSzamla, f: ParositasFuvar): boolean {
  if (sz.netto == null || f.fuvardij == null) return false;
  const pn = (p: string | null) => ((p ?? "Ft").toUpperCase() === "HUF" ? "FT" : (p ?? "Ft").toUpperCase());
  return pn(sz.penznem) === pn(f.penznem) && Math.abs(Number(sz.netto) - Number(f.fuvardij)) < 1;
}

function napSzam(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? null : Math.round(t / 86400000);
}

/** A számla teljesítése a felrakás előtti naptól a lerakás utáni 14. napig. */
function datumEgyezik(sz: ParositasSzamla, f: ParositasFuvar): boolean {
  const telj = napSzam(sz.teljesitesNap ?? sz.kiallitasNap);
  const tol = napSzam(f.felrakasNap ?? f.lerakasNap);
  const ig = napSzam(f.lerakasNap ?? f.felrakasNap);
  if (telj == null || tol == null || ig == null) return false;
  return telj >= tol - 1 && telj <= ig + 14;
}

const TETEL_ALTALANOS = new Set(["kozuti", "arufuvarozas", "fuvarozas", "fuvar", "szallitas", "belfoldi", "nemzetkozi", "fuvardij", "dij", "db", "es"]);

/** A tétel szavai az általános szavak („közúti árufuvarozás”) nélkül — ha üres, a számlán nincs útvonal. */
function tetelSzavak(tetel: string): string[] {
  return tetel
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !TETEL_ALTALANOS.has(w));
}

/** Van-e a számla tételeiben bármi az általános megnevezésen túl (város, útvonal). */
export function vanUtvonal(tetelek: string | null): boolean {
  return (tetelek ?? "").split(";").some((t) => tetelSzavak(t).length > 0);
}

/**
 * Útvonal-egyezés, két irányból (bármelyik elég):
 *   - a számla egy tételének első városa a felrakó címében, utolsó városa a
 *     lerakó címében szerepel („Nyírbátor-Budapest”, „Sopron-Miskolc-Debrecen”);
 *   - vagy a felrakó és a lerakó kinyert városneve szerepel a tételszövegben.
 */
export function utvonalEgyezik(tetelek: string | null, felrako: string | null, lerako: string | null): boolean {
  if (!tetelek) return false;
  const fel = szamKulcs(felrako);
  const le = szamKulcs(lerako);
  if (fel && le) {
    for (const tetel of tetelek.split(";")) {
      const varosok = tetelSzavak(tetel);
      if (varosok.length >= 2 && fel.includes(varosok[0]) && le.includes(varosok[varosok.length - 1])) return true;
    }
  }
  const t = szamKulcs(tetelek);
  const elso = szamKulcs(varosNev(felrako).split(" + ")[0]);
  const lerakok = varosNev(lerako).split(" + ");
  const utolso = szamKulcs(lerakok[lerakok.length - 1]);
  return elso.length >= 3 && utolso.length >= 3 && t.includes(elso) && t.includes(utolso);
}

/** Csak az egy-az-egyhez párokat tartja meg (egy fuvar egy számlát, egy számla egy fuvart). */
function egyertelmu<T extends { fuvarId: string; szamlaszam: string }>(parok: T[]): T[] {
  const fDb = new Map<string, number>();
  const szDb = new Map<string, number>();
  for (const p of parok) {
    fDb.set(p.fuvarId, (fDb.get(p.fuvarId) ?? 0) + 1);
    szDb.set(p.szamlaszam, (szDb.get(p.szamlaszam) ?? 0) + 1);
  }
  return parok.filter((p) => fDb.get(p.fuvarId) === 1 && szDb.get(p.szamlaszam) === 1);
}

export function parositSzamlakat(fuvarok: ParositasFuvar[], szamlak: ParositasSzamla[]): Parositas[] {
  const eredmeny: Parositas[] = [];
  const kesz = new Set<string>();       // párosított fuvarok
  const felhasznalt = new Set<string>(); // ebben a körben párosított számlák

  // 1a. A megbízás saját számai. Ugyanaz a szám több fuvaron is állhat
  //     (gyűjtőszámla) — ezt a korábbi párosítás is így kezelte.
  const fuvarSzamok = fuvarok.map((f) => ({ f, kulcsok: new Set(f.szamok.map(szamKulcs).filter(ertelmesSzam)) }));
  for (const sz of szamlak) {
    const k = szamKulcs(sz.rendelesszam);
    if (!ertelmesSzam(k)) continue;
    for (const { f, kulcsok } of fuvarSzamok) {
      if (kesz.has(f.id) || !kulcsok.has(k)) continue;
      eredmeny.push({ fuvarId: f.id, szamlaszam: sz.szamlaszam, mod: "szam" });
      kesz.add(f.id);
      felhasznalt.add(sz.szamlaszam);
    }
  }

  // 1b. Az irat szövegében szereplő szám — csak ugyanannál a partnernél, és
  //     csak egyértelmű találattal (egy szám véletlenül több iratban is lehet).
  const iratok = fuvarok.filter((f) => !kesz.has(f.id)).map((f) => ({ f, kulcsok: iratKulcsok(f.nyersSzoveg) }));
  const iratParok: { fuvarId: string; szamlaszam: string }[] = [];
  for (const sz of szamlak) {
    if (sz.hasznalt || felhasznalt.has(sz.szamlaszam)) continue;
    const k = szamKulcs(sz.rendelesszam);
    if (!ertelmesSzam(k)) continue;
    for (const { f, kulcsok } of iratok) {
      if (kulcsok.has(k) && partnerEgyezik(sz.vevoNev, f.partnerNevek)) iratParok.push({ fuvarId: f.id, szamlaszam: sz.szamlaszam });
    }
  }
  for (const p of egyertelmu(iratParok)) {
    eredmeny.push({ ...p, mod: "irat_szoveg" });
    kesz.add(p.fuvarId);
    felhasznalt.add(p.szamlaszam);
  }

  // 2. Tartalék: partner + összeg + dátum + útvonal — mind a négy. Ha a
  //    számlán nincs útvonal (csak „Közúti árufuvarozás”), a másik három is
  //    elég (Budaházi Zoltán, 2026-09-25: ritka, de előfordul — WLLWR-2026-315);
  //    ha van útvonal és nem egyezik, az kizárja a párt.
  const tartalekParok: { fuvarId: string; szamlaszam: string; utvonalNelkul: boolean }[] = [];
  for (const sz of szamlak) {
    if (sz.hasznalt || felhasznalt.has(sz.szamlaszam)) continue;
    for (const f of fuvarok) {
      if (kesz.has(f.id)) continue;
      if (
        partnerEgyezik(sz.vevoNev, f.partnerNevek) &&
        osszegEgyezik(sz, f) &&
        datumEgyezik(sz, f) &&
        (!vanUtvonal(sz.tetelekSzoveg) || utvonalEgyezik(sz.tetelekSzoveg, f.felrako, f.lerako))
      ) tartalekParok.push({ fuvarId: f.id, szamlaszam: sz.szamlaszam, utvonalNelkul: !vanUtvonal(sz.tetelekSzoveg) });
    }
  }
  for (const p of egyertelmu(tartalekParok)) {
    eredmeny.push({ fuvarId: p.fuvarId, szamlaszam: p.szamlaszam, mod: p.utvonalNelkul ? "partner_osszeg_datum" : "partner_osszeg_datum_utvonal" });
  }

  return eredmeny;
}
