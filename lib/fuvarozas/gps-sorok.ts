// A GPS lap táblázatának sor-logikája — közös a /fuvarozas GPS fül
// (components/fuvarozas/idovonal.tsx) és az Áttekintés mobil Fuvar füle
// (components/attekintes/fuvar-tablazat-mobil.tsx) között, hogy a két
// felület pontosan ugyanazt az állapotot, időt és sofőr-jelzést mutassa.
// Nincs benne se "use server", se "use client": tiszta függvények, bárhonnan
// importálható.

import type { FuvarBlokk, GondJelzes, JarmuIdovonalEredmeny, MegalloBejegyzes } from "@/lib/fuvarozas/actions";
import type { FuvardijPenznem } from "@/lib/fuvarozas/fuvar-constants";
import { SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";

/** Ennél régebbi élő GPS-adatnál figyelmeztetünk: a pozíció nem "most", a készülék kieshetett. */
export const REGI_JEL_PERC = 30;

export function formatIdo(d: Date): string {
  return new Date(d).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Budapest" });
}

export function formatEltelt(d: Date, most: number): string {
  const perc = Math.round((most - new Date(d).getTime()) / 60000);
  if (perc < 60) return `${perc} perce`;
  const ora = Math.floor(perc / 60);
  return `${ora} óra ${perc - ora * 60} perce`;
}

/** Perc → "38 perc" / "1 óra 10 perc". */
export function formatPerc(perc: number): string {
  if (perc < 60) return `${perc} perc`;
  const ora = Math.floor(perc / 60);
  const maradek = perc - ora * 60;
  return maradek === 0 ? `${ora} óra` : `${ora} óra ${maradek} perc`;
}

/**
 * Idő a nap jelölésével, ha a pont nem a megjelenített napra esik: "tegnap
 * 07:10", "holnap 08:00", távolabb "szept. 14., 08:00".
 */
export function formatIdoNapJelolessel(d: Date, napElteres: number): string {
  if (napElteres === 0) return formatIdo(d);
  if (napElteres === -1) return `tegnap ${formatIdo(d)}`;
  if (napElteres === 1) return `holnap ${formatIdo(d)}`;
  return `${new Date(d).toLocaleDateString("hu-HU", { month: "short", day: "numeric", timeZone: "Europe/Budapest" })}, ${formatIdo(d)}`;
}

export function formatSzam(n: number, tizedes = 0): string {
  return n.toLocaleString("hu-HU", { minimumFractionDigits: tizedes, maximumFractionDigits: tizedes });
}

export function formatOsszeg(osszeg: number, penznem: FuvardijPenznem): string {
  return penznem === "EUR" ? `${osszeg.toLocaleString("hu-HU")} €` : `${osszeg.toLocaleString("hu-HU")} Ft`;
}

export function jelRegi(pos: NonNullable<JarmuIdovonalEredmeny["eloPozicio"]>, most: number): boolean {
  return most - new Date(pos.utolsoAdat).getTime() > REGI_JEL_PERC * 60000;
}

/** A kocsi következő, még el nem ért megállója (a blokkok sorrendjében az első ilyen). */
export function kovetkezoMegallo(fuvarok: FuvarBlokk[]): MegalloBejegyzes | null {
  return fuvarok.flatMap((f) => f.megallok).find((b) => !b.elhagyva && !b.eppenItt) ?? null;
}

export function fuvarKesz(f: FuvarBlokk): boolean {
  return f.megallok.length > 0 && f.megallok.every((b) => b.elhagyva);
}

/** A Fuvar oszlop szövege: megbízó, hivatkozás, áru/mennyiség/súly, díj. */
export function fuvarReszletek(f: FuvarBlokk): { megrendelo: string; hivatkozas: string; aru: string | null; dij: string | null } {
  const aru = [f.aru, f.mennyiseg, f.suly].filter((x): x is string => !!x && x.trim() !== "").join(", ");
  return {
    megrendelo: f.megrendelo ?? "Megbízó ismeretlen",
    hivatkozas: f.pozicioszam ?? "hivatkozás nélkül",
    aru: aru || null,
    dij: f.fuvardij !== null ? formatOsszeg(f.fuvardij, f.fuvardijPenznem) : null,
  };
}

// ---------------------------------------------------------------------------
// Egy megálló sora
// ---------------------------------------------------------------------------

export type Allapot = "Kész" | "Rakodik" | "Úton oda" | "Csúszik" | "Terv";

export type SorAdat = {
  allapot: Allapot;
  /** Érkezés cella szövege és magyarázata (title). */
  erkezes: string;
  erkezesCim: string;
  tavozas: string;
  rakodas: string;
  /** A sofőr jelzései, soronként egy elem. */
  sofor: string[];
  /** Gondjelzések (a fuvar utolsó lerakó sorában). */
  gondok: GondJelzes[];
};

export type SorKornyezet = {
  maiNap: boolean;
  /** Van élő GPS-pozíció a kocsihoz (a hátralévő megállók ideje élő becslés, nem terv). */
  eloVan: boolean;
  kovetkezo: MegalloBejegyzes | null;
  /**
   * Igaz, ha a kocsi a nap valamelyik megállóján ÉPPEN ÁLL (rakodik) —
   * ilyenkor a következő megálló még nem "Úton oda", hanem terv: Gergő
   * Gyöngyöshalászon rakodott, és a debreceni lerakó sora "Úton oda"-t
   * mutatott (2026-09-18).
   */
  allValahol: boolean;
  /** Az adatok betöltésének pillanata (ms). */
  most: number;
  /** Igaz, ha ez a fuvar utolsó megállója — ide kerül a fuvarlevél-fotó és a gond. */
  utolsoLerako: boolean;
};

/** Igaz, ha a kocsi a nap valamelyik megállóján éppen áll. */
export function allValahol(fuvarok: FuvarBlokk[]): boolean {
  return fuvarok.some((f) => f.megallok.some((b) => b.eppenItt));
}

export function sorAdatok(b: MegalloBejegyzes, f: FuvarBlokk, ctx: SorKornyezet): SorAdat {
  const gpsLatta = b.tenylegesTavozas !== null || b.eppenItt || b.keszForras === "gps";
  const kovetkezoE = ctx.kovetkezo !== null && ctx.kovetkezo.fuvarId === b.fuvarId && ctx.kovetkezo.megalloIndex === b.megalloIndex;

  let allapot: Allapot;
  if (b.elhagyva) allapot = "Kész";
  else if (b.eppenItt) allapot = "Rakodik";
  else if (f.csuszo) allapot = "Csúszik";
  else if (ctx.maiNap && ctx.eloVan && kovetkezoE && !ctx.allValahol) allapot = "Úton oda";
  else allapot = "Terv";

  const bizonytalanJel = b.bizonytalanFelismeres ? "? " : "";
  let erkezes = "—";
  let erkezesCim = "";
  let tavozas = "—";
  let rakodas = "—";

  if ((b.elhagyva || b.eppenItt) && gpsLatta) {
    erkezes = `${bizonytalanJel}${formatIdoNapJelolessel(b.idopont, b.napElteres)}`;
    erkezesCim = b.bizonytalanFelismeres
      ? "A GPS szerint a jármű a város közelében állt meg — a megbízáson csak a város szerepel, ezért nem biztos, hogy EZ a rakodás volt."
      : "Tényleges érkezés (GPS)";
    if (b.tenylegesTavozas) {
      tavozas = formatIdoNapJelolessel(b.tenylegesTavozas, b.napElteres);
      const perc = Math.round((new Date(b.tenylegesTavozas).getTime() - new Date(b.idopont).getTime()) / 60000);
      rakodas = formatPerc(Math.max(perc, 0));
      if (b.varakozasKezdete && b.varakozasVege) {
        const varakozas = Math.round((new Date(b.varakozasVege).getTime() - new Date(b.varakozasKezdete).getTime()) / 60000);
        if (varakozas > 0) rakodas += `, ebből ${varakozas} perc várakozás`;
      }
    } else if (b.eppenItt) {
      const perc = Math.round((ctx.most - new Date(b.idopont).getTime()) / 60000);
      rakodas = `${formatPerc(Math.max(perc, 0))} eddig`;
    }
  } else if (b.elhagyva) {
    // Kézzel készre jelölve, a GPS nem látta: csak a sofőr ideje van, ha koppintott.
    if (b.keziErkezes) {
      erkezes = formatIdoNapJelolessel(b.keziErkezes, b.napElteres);
      erkezesCim = "A sofőr „Megérkeztem” koppintása";
    }
  } else if (b.becslesElavult) {
    erkezes = "nincs friss becslés";
    erkezesCim = "A megbízás tervezett időpontja elmúlt, és nem sikerült élő becslést számolni — ellenőrizd a megbízáson a címet.";
  } else if (ctx.maiNap && ctx.eloVan) {
    erkezes = `várható ${formatIdoNapJelolessel(b.idopont, b.napElteres)}`;
    erkezesCim = "Élő GPS-pozícióból becsült érkezés";
  } else {
    erkezes = `terv ${formatIdoNapJelolessel(b.idopont, b.napElteres)}`;
    erkezesCim = "A megbízás tervezett időpontja (nincs élő GPS-becslés)";
  }

  const sofor: string[] = [];
  if (b.keziErkezes) sofor.push(`Megérkeztem: ${formatIdo(b.keziErkezes)}`);
  if (b.varakozasKezdete && !b.varakozasVege) sofor.push(`Várakozik ${formatIdo(b.varakozasKezdete)} óta`);
  if (b.keszForras === "kezi") sofor.push(`Készre jelölte: ${b.keszBy ?? "?"}${b.keszAt ? `, ${formatIdo(b.keszAt)}` : ""}`);
  if (ctx.utolsoLerako && f.fuvarlevelFotoDb > 0)
    sofor.push(f.fuvarlevelFotoDb === 1 ? "Fuvarlevél fotó feltöltve" : `Fuvarlevél fotó feltöltve (${f.fuvarlevelFotoDb})`);

  return { allapot, erkezes, erkezesCim, tavozas, rakodas, sofor, gondok: ctx.utolsoLerako ? f.gondok : [] };
}

// ---------------------------------------------------------------------------
// A nap összképe
// ---------------------------------------------------------------------------

export type Osszkep = {
  fuvar: number;
  kesz: number;
  folyamatban: number;
  csuszik: number;
  nyitottGond: number;
  /** A GPS nélküli (nem bekötött, jel nélküli vagy régi jelű) kocsik sofőrjei. */
  gpsNelkul: string[];
  km: number;
};

export function osszkep(adatok: JarmuIdovonalEredmeny[], maiNap: boolean, most: number): Osszkep {
  const fuvarok = adatok.flatMap((a) => a.fuvarok);
  const folyamatban = adatok.reduce((n, a) => {
    const kov = kovetkezoMegallo(a.fuvarok);
    const aktivId = a.fuvarok.flatMap((f) => f.megallok).find((b) => b.eppenItt)?.fuvarId ?? kov?.fuvarId ?? null;
    return n + a.fuvarok.filter((f) => !fuvarKesz(f) && (f.fuvarId === aktivId || f.megallok.some((b) => b.eppenItt))).length;
  }, 0);
  const gpsNelkul = SAJAT_JARMUVEK.filter((j) => {
    if (j.ecofleetObjectId === null) return true;
    if (!maiNap) return false;
    const pos = adatok.find((a) => a.sofor === j.sofor)?.eloPozicio ?? null;
    return !pos || jelRegi(pos, most);
  }).map((j) => j.sofor);
  return {
    fuvar: fuvarok.length,
    kesz: fuvarok.filter(fuvarKesz).length,
    folyamatban,
    csuszik: fuvarok.filter((f) => f.csuszo && !fuvarKesz(f)).length,
    nyitottGond: fuvarok.reduce((n, f) => n + f.gondok.filter((g) => g.nyitott).length, 0),
    gpsNelkul,
    km: adatok.reduce((n, a) => n + (a.napiKm ?? 0), 0),
  };
}

/** A "Következő" mező szövege a Hol van most sávban. */
export function kovetkezoSzoveg(kovetkezo: MegalloBejegyzes | null, eloEta: JarmuIdovonalEredmeny["eloEta"], rakodasUtan = false): string {
  if (!kovetkezo) return "nincs több megálló ma";
  const mi = kovetkezo.tipus === "felrako" ? "Felrakás" : "Lerakás";
  const ido = eloEta && !eloEta.bizonytalan ? `, kb. ${formatIdo(eloEta.erkezes)}` : ", érkezés nem becsülhető";
  return `${rakodasUtan ? "rakodás után " : ""}${mi} ${kovetkezo.cim}${ido}`;
}

/** A nem tervezett állások egy sorban: "Nyírbátor 08:52–09:05 (13 perc) · …". */
export function allasokSzoveg(allasok: JarmuIdovonalEredmeny["nemTervezettAllasok"]): string | null {
  if (allasok.length === 0) return null;
  return allasok.map((a) => `${a.cim ?? "ismeretlen hely"} ${formatIdo(a.kezdet)}–${formatIdo(a.veg)} (${a.percek} perc)`).join(" · ");
}
