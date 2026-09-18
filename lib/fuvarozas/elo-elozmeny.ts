// A járművek élő GPS-megfigyeléseinek rövid, folyamat-szintű előzménye.
//
// Az Ecofleet csak a lezárt trip-eket adja vissza, és az utolsó lezárt
// trip utáni állás hosszát ("stoppedAfter") a következő trip lezárásáig
// nem tölti ki — a jelen pillanat előtti egy-két óra tehát a nyomvonalon
// üres. Ezt a lyukat a saját megfigyeléseinkből tömjük be: a 15 perces
// figyelő minden köre és minden GPS lap / Áttekintés betöltés felírja, hol
// volt a kocsi és mozgott-e; a kiegesziteloAllapottal (idovonal.ts) ebből
// tudja, mikor hagyta el a lezárt trip végpontját, és mióta áll a mostani
// helyén. Csak memóriában él (kiadáskor újraindul üresen), egy napra
// visszamenőleg — ennyi elég, mert az Ecofleet másnapra már lezárja a
// trip-eket.
//
// NEM "use server" fájl — tiszta modul, a szerveren fut, bárhonnan hívható.

import type { EloMegfigyeles } from "./idovonal";

const MEGORZES_MS = 24 * 60 * 60 * 1000;
/** Ennél sűrűbben nem jegyzünk fel új pontot ugyanarról a kocsiról (a 60 s-os oldal-gyorsítótár mellett is elég). */
const MIN_KOZ_MS = 60 * 1000;

const elozmeny = new Map<string, EloMegfigyeles[]>();

/** Egy jármű friss élő megfigyelésének felírása (az Ecofleet jel-idejével, nem a lekérdezés idejével). */
export function rogzitEloMegfigyelest(objectId: string, m: EloMegfigyeles): void {
  const lista = elozmeny.get(objectId) ?? [];
  const utolso = lista[lista.length - 1];
  if (utolso && m.idobelyeg.getTime() - utolso.idobelyeg.getTime() < MIN_KOZ_MS) return;
  const hatar = Date.now() - MEGORZES_MS;
  const friss = lista.filter((x) => x.idobelyeg.getTime() >= hatar);
  friss.push(m);
  elozmeny.set(objectId, friss);
}

/** Egy jármű megőrzött megfigyelései, időrendben. */
export function getEloElozmeny(objectId: string): EloMegfigyeles[] {
  return [...(elozmeny.get(objectId) ?? [])];
}
