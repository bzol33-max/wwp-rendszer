// Rakott és üres km egy kocsi fuvarláncából — a Kimutatás és a Tervezés közös
// szabálya (scripts/teszt-ures-km.ts).
//
// Budaházi Zoltán, 2026-10-04: „lerakótól felrakóig üres km, ilyen egyszerű.”
//   • rakott: a fuvar felrakójától (a megállókon át) az utolsó lerakójáig —
//     a bérfuvarnál a HU-GO-s rakott_km, ha már ki van számolva (rakott-km.ts);
//   • üres: az előző fuvar utolsó lerakójától ennek az első felrakójáig; a lánc
//     elején a kocsi előző lerakójától, ha nincs, a telephelytől.
// A sorrend a menet sorrendje (napi-sorrend.ts). A km a lánc fuvarjának
// lerakás-napjára kerül. Ahol nincs HU-GO km, ott légvonal × 1,3 — becslés.

import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { napiSorrend } from "@/lib/fuvarozas2/napi-sorrend";

export type LancFuvar = {
  id: string;
  jelleg: "ber" | "sajat";
  felrakasNap: string | null;
  lerakasNap: string | null;
  felrako: string | null;
  lerako: string | null;
  /** A HU-GO-s rakott km (csak bérfuvarnál számoljuk), ha van. */
  rakottKm: number | null;
};

export type LancKm = { id: string; jelleg: "ber" | "sajat"; nap: string; rakott: number; ures: number };

/** Két cím közti közúti km, vagy null, ha valamelyik nem helyezhető el. */
export type Tavolsag = (honnan: string, hova: string) => Promise<number | null>;

function megallok(f: Pick<LancFuvar, "felrako" | "lerako">): { fel: string[]; le: string[] } {
  return { fel: bontsMegallokra(f.felrako), le: bontsMegallokra(f.lerako) };
}

/**
 * A lánc km-e fuvaronként. `fuvarok` egy kocsi fuvarjai (bármilyen sorrendben),
 * `kezdoHely` ahol a kocsi a lánc előtt állt (előző lerakó vagy telephely).
 */
export async function lancKm(fuvarok: LancFuvar[], kezdoHely: string | null, tav: Tavolsag): Promise<LancKm[]> {
  // Egy lerakás-napon belül a legközelebbi felrakó jön (Gergő 09.29.: Nyíregyháza
  // után a téglási RBT, nem a szigetszentmiklósi Fabrika — az id-sorrend két
  // fölösleges, ~250 és ~400 km-es üres szakaszt adott). Egyezésnél a
  // napi-sorrend dönt.
  const rendezett = napiSorrend(fuvarok, (x) => x);
  const ki: LancKm[] = [];
  let hol = kezdoHely;
  while (rendezett.length > 0) {
    const nap = rendezett[0].lerakasNap ?? rendezett[0].felrakasNap ?? "";
    let legjobb = 0;
    if (hol) {
      let legjobbKm = Infinity;
      for (let i = 0; i < rendezett.length && (rendezett[i].lerakasNap ?? rendezett[i].felrakasNap ?? "") === nap; i++) {
        const elso = megallok(rendezett[i]).fel[0];
        const km = elso ? (await tav(hol, elso)) ?? Infinity : Infinity;
        if (km < legjobbKm) { legjobbKm = km; legjobb = i; }
      }
    }
    const [f] = rendezett.splice(legjobb, 1);
    const { fel, le } = megallok(f);
    const pontok = [...fel, ...le];
    let ures = 0;
    if (hol && fel[0]) ures = (await tav(hol, fel[0])) ?? 0;
    let rakott = f.rakottKm ?? 0;
    if (f.rakottKm == null) {
      for (let i = 1; i < pontok.length; i++) rakott += (await tav(pontok[i - 1], pontok[i])) ?? 0;
    }
    ki.push({ id: f.id, jelleg: f.jelleg, nap: f.lerakasNap ?? f.felrakasNap ?? "", rakott, ures });
    if (le.length > 0) hol = le[le.length - 1];
  }
  return ki;
}

const KOZUTI_SZORZO = 1.3;

/** Légvonal × 1,3 a geokód-gyorsítótárból (helyszín-szótár előbb) — becslés. */
export function becsultTavolsag(): Tavolsag {
  const cache = new Map<string, number | null>();
  return async (a, b) => {
    const kulcs = `${a}→${b}`;
    if (cache.has(kulcs)) return cache.get(kulcs)!;
    const [p, q] = await Promise.all([geokodolCachelve(a).catch(() => null), geokodolCachelve(b).catch(() => null)]);
    let km: number | null = null;
    if (p && q) {
      const R = 6371;
      const dLat = ((q.lat - p.lat) * Math.PI) / 180;
      const dLon = ((q.lon - p.lon) * Math.PI) / 180;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos((p.lat * Math.PI) / 180) * Math.cos((q.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      km = Math.round(2 * R * Math.asin(Math.sqrt(x)) * KOZUTI_SZORZO);
    }
    cache.set(kulcs, km);
    return km;
  };
}
