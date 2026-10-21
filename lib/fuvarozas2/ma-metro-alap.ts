// A Ma oldal „metróvonal” kocsikártyája (Budaházi Zoltán, 2026-10-21, V11-es
// terv: „09 vidd tovább, látnom kell az aktuális és következő megbízásait is”).
// Tiszta függvények — scripts/teszt-ma-metro.ts teszteli.
//
// A vonal a tükör-sorokból (ma-tukor.ts) épül: megállók időrendben, köztük
// szakasz (rakott / üres, kész / hátravan), a nem tervezett GPS-állás a
// helyén. A kocsi ott áll, ahol a „most” megálló van; ha épp úton van, a
// következő megálló előtti szakaszon.

import type { TukorSor } from "@/lib/fuvarozas2/ma-tukor";

type MegalloSor = Extract<TukorSor, { tipus: "megallo" }>;

export type MetroMegallo = {
  tipus: "megallo";
  fuvarId: string;
  felLe: "felrako" | "lerako";
  varos: string;
  /** A pötty fölé: tény (ha van), különben terv. */
  ido: string | null;
  allapot: MegalloSor["allapot"];
  kiemelt: MegalloSor["kiemelt"];
  elteres: string | null;
  /** A fuvar első megállójánál: a megbízás jelölése (#hivatkozás / megbízó). */
  jel: string | null;
};
export type MetroSzakasz = { tipus: "szakasz"; rakott: boolean; kesz: boolean; kocsiItt: boolean };
export type MetroAllas = { tipus: "allas"; szoveg: string };
export type MetroElem = MetroMegallo | MetroSzakasz | MetroAllas;

export function metroElemek(sorok: TukorSor[]): MetroElem[] {
  const ki: MetroElem[] = [];
  const jelek = new Map<string, string>();
  for (const r of sorok) if (r.tipus === "fuvar") jelek.set(r.fuvarId, r.hivatkozas ? `#${r.hivatkozas}` : r.jelleg === "sajat" ? "saját" : r.partner);
  const megallok = sorok.filter((r): r is MegalloSor => r.tipus === "megallo");
  const vanMost = megallok.some((m) => m.allapot === "most");
  let elozo: MegalloSor | null = null;
  const latottFuvar = new Set<string>();
  for (const r of sorok) {
    if (r.tipus === "fuvar") continue;
    if (r.tipus === "allas") {
      ki.push({ tipus: "allas", szoveg: r.allas.folyamatban ? `áll ${r.allas.tol} óta` : `állt ${r.allas.percek} p` });
      continue;
    }
    if (elozo) {
      ki.push({
        tipus: "szakasz",
        rakott: r.felLe === "lerako" && r.fuvarId === elozo.fuvarId,
        kesz: r.allapot === "kesz" || r.allapot === "most",
        kocsiItt: !vanMost && r.allapot === "kovetkezo" && elozo.allapot === "kesz",
      });
    }
    const elso = !latottFuvar.has(r.fuvarId);
    latottFuvar.add(r.fuvarId);
    ki.push({
      tipus: "megallo", fuvarId: r.fuvarId, felLe: r.felLe, varos: r.varos,
      ido: r.teny ?? r.terv, allapot: r.allapot, kiemelt: r.kiemelt, elteres: r.elteres,
      jel: elso ? jelek.get(r.fuvarId) ?? null : null,
    });
    elozo = r;
  }
  return ki;
}

/** A kocsi még el sem indult (az első megálló a következő, nincs kész előtte): a kocsi a vonal elején. */
export function kocsiAzElejen(elemek: MetroElem[]): boolean {
  const elso = elemek.find((e): e is MetroMegallo => e.tipus === "megallo");
  return !!elso && elso.allapot === "kovetkezo";
}

export type MegbizasKartya = {
  fuvarId: string;
  /** A fuvar megállói közül: első felrakó és utolsó lerakó (tény / terv), a kapcsolattartó. */
  fel: { varos: string; ido: string | null; kesz: boolean } | null;
  le: { varos: string; ido: string | null; kesz: boolean } | null;
  ceg: string | null;
  kontakt: string | null;
  telefon: string | null;
  /** „rakottan úton”, „felrakásra megy”, „lerakón”, „felrakón” … */
  allapot: string;
  holnap: boolean;
};

export type AktualisKovetkezo = {
  aktualis: MegbizasKartya | null;
  kovetkezo: MegbizasKartya | null;
  /** Ma volt fuvar, és minden megállója kész. */
  maKesz: boolean;
};

function kartya(fuvarId: string, megallok: MegalloSor[], holnap: boolean): MegbizasKartya {
  const sajat = megallok.filter((m) => m.fuvarId === fuvarId);
  const fel = sajat.find((m) => m.felLe === "felrako") ?? null;
  const le = [...sajat].reverse().find((m) => m.felLe === "lerako") ?? null;
  const most = sajat.find((m) => m.allapot === "most") ?? sajat.find((m) => m.allapot === "kovetkezo") ?? null;
  let allapot = "tervezett";
  if (sajat.length && sajat.every((m) => m.allapot === "kesz")) allapot = "kész";
  else if (most?.allapot === "most") allapot = most.kiemelt === "varakozik" ? `${most.felLe === "felrako" ? "felrakón" : "lerakón"} vár` : most.felLe === "felrako" ? "felrakón" : "lerakón";
  else if (most?.allapot === "kovetkezo") allapot = sajat.some((m) => m.felLe === "felrako" && m.allapot === "kesz") ? "rakottan úton" : "felrakásra megy";
  return {
    fuvarId,
    fel: fel ? { varos: fel.varos, ido: fel.teny ?? fel.terv, kesz: fel.allapot === "kesz" } : null,
    le: le ? { varos: le.varos, ido: le.teny ?? le.terv, kesz: le.allapot === "kesz" } : null,
    ceg: most?.ceg ?? null, kontakt: most?.kontaktNev ?? null, telefon: most?.telefon ?? null,
    allapot, holnap,
  };
}

/**
 * Aktuális = az első nem kész megálló fuvarja; következő = a mai sorrendben
 * utána jövő, még nyitott fuvar, ha nincs: a holnapi első.
 */
export function aktualisEsKovetkezo(sorok: TukorSor[], holnapiIdk: string[]): AktualisKovetkezo {
  const megallok = sorok.filter((r): r is MegalloSor => r.tipus === "megallo");
  const sorrend: string[] = [];
  for (const m of megallok) if (!sorrend.includes(m.fuvarId)) sorrend.push(m.fuvarId);
  const nyitott = (id: string) => megallok.some((m) => m.fuvarId === id && m.allapot !== "kesz");
  const aktId = megallok.find((m) => m.allapot !== "kesz")?.fuvarId ?? null;
  const kovMa = aktId ? sorrend.slice(sorrend.indexOf(aktId) + 1).find(nyitott) ?? null : null;
  const kovHolnap = kovMa ? null : holnapiIdk.find((id) => id !== aktId) ?? null;
  return {
    aktualis: aktId ? kartya(aktId, megallok, false) : null,
    kovetkezo: kovMa ? kartya(kovMa, megallok, false) : kovHolnap ? { ...kartya(kovHolnap, [], true) } : null,
    maKesz: !aktId && megallok.length > 0,
  };
}

/** „190 000 Ft”, „1 250 €”; nincs díj → null. */
export function dijSzoveg(dij: string | number | null | undefined, penznem: string | null | undefined): string | null {
  const n = dij == null || dij === "" ? NaN : Number(dij);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pn = (penznem ?? "HUF").toUpperCase();
  const szam = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return pn === "EUR" ? `${szam} €` : pn === "HUF" || pn === "FT" ? `${szam} Ft` : `${szam} ${pn}`;
}

/** Flotta-átlag: Σ liter / Σ km × 100 a kocsik 7 napos összesítőiből (csak ahol van l/100). */
export function flottaFogyasztas(t: { canL100: number | null; canKm: number }[]): number | null {
  let liter = 0, km = 0;
  for (const x of t) if (x.canL100 != null && x.canKm > 0) { liter += (x.canL100 * x.canKm) / 100; km += x.canKm; }
  return km >= 100 ? Math.round((liter / km) * 1000) / 10 : null;
}

/** A kocsi l/100-a a flotta-átlaghoz: +25 → „+25 %”; ±5 %-on belül null (nem érdemes jelezni). */
export function fogyasztasElteres(l100: number | null | undefined, flotta: number | null | undefined): number | null {
  if (l100 == null || flotta == null || flotta <= 0) return null;
  const p = Math.round(((l100 - flotta) / flotta) * 100);
  return Math.abs(p) < 5 ? null : p;
}
