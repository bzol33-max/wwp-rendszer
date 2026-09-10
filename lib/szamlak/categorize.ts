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

/** A "fizmod" (fizetési mód) mező alapján eldönti, hogy készpénzes számláról van-e szó. */
const KESZPENZ_KULCSSZO = /készpénz|keszpenz/i;

/**
 * Készpénzes számlánál a cég gyakorlatában a vevő a pult mellett, kiállításkor
 * azonnal kifizet — a Számlázz.hu ehhez nem küld külön fizetettségi
 * visszajelzést (lásd sztorno.ts / actions.ts "Fizetve" komment), ezért ezek
 * enélkül "nyitott"-ként kerülnének be, majd (mivel a fizetési határidő
 * jellemzően a kiállítás napja) már másnap tévesen "Lejárt"-ként, pirosan
 * jelennének meg — lásd lib/szamlak/poll.ts mentSzamla.
 */
export function keszpenzesE(fizmod: string | null): boolean {
  return !!fizmod && KESZPENZ_KULCSSZO.test(fizmod);
}
