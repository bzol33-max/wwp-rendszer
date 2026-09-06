import type { SzamlaAlkategoria, SzamlaKategoria } from "./szamla-constants";

// A tételek megnevezése alapján döntjük el, hogy a számla "Fuvar" (szállítási
// szolgáltatás) vagy "Raklap" (áru — EUR/egyutas raklap, Gitterbox stb.)
// kategóriába essen. A fuvar-tételek jellemzően "árufuvarozás", "fuvar",
// "szállítás" szót tartalmaznak (lásd valós példa: "Közuti Árufuvarozás
// Szombathely-Nyíregyháza").
const FUVAR_KULCSSZAVAK = /fuvar|szállítás|szallitas|fuvarozás|fuvarozas/i;

/** A "Raklap" kategórián belüli alkategória — a vevő neve alapján. */
const ALKATEGORIA_KULCSSZAVAK: Array<{ minta: RegExp; alkategoria: SzamlaAlkategoria }> = [
  { minta: /fabrika/i, alkategoria: "fabrika" },
  { minta: /keter/i, alkategoria: "keter" },
];

export function kategorizalSzamla(tetelekSzoveg: string): SzamlaKategoria {
  return FUVAR_KULCSSZAVAK.test(tetelekSzoveg) ? "fuvar" : "raklap";
}

export function alkategorizalRaklap(vevoNev: string): SzamlaAlkategoria {
  const talalat = ALKATEGORIA_KULCSSZAVAK.find((k) => k.minta.test(vevoNev));
  return talalat?.alkategoria ?? "egyeb";
}
