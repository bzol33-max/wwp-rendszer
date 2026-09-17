"use server";

import { EcofleetError, getUtvonalJelentes, rendszamKulcs, type EcofleetUtSor } from "./ecofleet";
import { SAJAT_JARMUVEK } from "./vehicles";
import { budapestNapISO } from "./idozona";
import { cachelve } from "./idovonal-cache";
import { getGazolajAr } from "./actions";

// Üzemanyag-fogyasztás járművenként az Ecofleet Útvonal jelentéséből
// (lib/fuvarozas/ecofleet.ts getUtvonalJelentes). A GPS lap a kiválasztott
// napra, valamint az azzal záruló 7 és 14 napos időszakra mutatja a
// megtett km-t, a fogyasztott litert, az átlagot és a gázolajárral
// (NAV ár - flotta-kedvezmény, lásd getGazolajAr) számolt költséget.
//
// A nyomkövető nem minden járműnél olvassa az üzemanyag-adatot: ha a
// jelentés minden útjánál 0 liter áll, azt "nincs mérés"-ként jelezzük,
// nem 0 literes fogyasztásként.

const FOGYASZTAS_NAPOK = 14;
const FOGYASZTAS_CACHE_MS = 10 * 60 * 1000;

export type FogyasztasOsszeg = {
  km: number;
  liter: number;
  utak: number;
};

export type JarmuFogyasztas = {
  sofor: string;
  /** false, ha az időszak egyetlen útján sincs üzemanyag-adat (a nyomkövető nem méri). */
  merve: boolean;
  /** A kiválasztott nap. */
  nap: FogyasztasOsszeg;
  /** A kiválasztott nappal záruló 7 nap. */
  hetNap: FogyasztasOsszeg;
  /** A kiválasztott nappal záruló 14 nap. */
  tizennegyNap: FogyasztasOsszeg;
};

export type FogyasztasEredmeny = {
  jarmuvek: JarmuFogyasztas[];
  /** Ft/liter, amivel a költség számolandó (NAV ár - kedvezmény). */
  gazolajAr: number;
  gazolajCimke: string;
  hiba: string | null;
};

function napIsoEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function osszegez(sorok: EcofleetUtSor[], kezdetNapISO: string, vegNapISO: string): FogyasztasOsszeg {
  const ossz = { km: 0, liter: 0, utak: 0 };
  for (const s of sorok) {
    const nap = s.indulas.slice(0, 10);
    if (nap < kezdetNapISO || nap > vegNapISO) continue;
    ossz.km += s.tavKm;
    ossz.liter += s.uzemanyagL;
    ossz.utak++;
  }
  return ossz;
}

async function szamitsFogyasztast(napISO: string): Promise<FogyasztasEredmeny> {
  const gazolaj = await getGazolajAr();
  const jarmuvek = SAJAT_JARMUVEK.filter((j) => j.ecofleetObjectId !== null);
  const kezdet = napIsoEltolva(napISO, -(FOGYASZTAS_NAPOK - 1));
  const sorok = await getUtvonalJelentes(
    jarmuvek.map((j) => j.ecofleetObjectId as string),
    kezdet,
    napISO
  );
  return {
    jarmuvek: jarmuvek.map((j) => {
      const kulcsok = new Set(j.rendszamok.map(rendszamKulcs));
      const sajat = sorok.filter((s) => kulcsok.has(s.rendszamKulcs));
      return {
        sofor: j.sofor,
        merve: sajat.some((s) => s.uzemanyagL > 0),
        nap: osszegez(sajat, napISO, napISO),
        hetNap: osszegez(sajat, napIsoEltolva(napISO, -6), napISO),
        tizennegyNap: osszegez(sajat, kezdet, napISO),
      };
    }),
    gazolajAr: gazolaj.ar,
    gazolajCimke: gazolaj.cimke,
    hiba: null,
  };
}

/**
 * Járművenkénti fogyasztás a megadott (alapból a mai) budapesti napra és az
 * azzal záruló 7/14 napra. Hibát nem dob: a felület a `hiba` szövegét mutatja.
 * A sikertelen lekérés nem kerül a gyorsítótárba (lásd cachelve).
 */
export async function getFogyasztas(nap?: string): Promise<FogyasztasEredmeny> {
  const napISO = nap ?? budapestNapISO();
  try {
    return await cachelve(`fogyasztas:${napISO}`, FOGYASZTAS_CACHE_MS, () => szamitsFogyasztast(napISO));
  } catch (err) {
    if (!(err instanceof EcofleetError)) console.error("[fogyasztas] váratlan hiba:", err);
    const gazolaj = await getGazolajAr();
    return {
      jarmuvek: [],
      gazolajAr: gazolaj.ar,
      gazolajCimke: gazolaj.cimke,
      hiba: err instanceof EcofleetError ? err.message : "Nem sikerült lekérni az Ecofleet útvonal-jelentést.",
    };
  }
}
