// A járművek élő GPS-megfigyeléseinek rövid, folyamat-szintű előzménye.
//
// Az Ecofleet csak a lezárt trip-eket adja vissza, és az utolsó lezárt
// trip utáni állás hosszát ("stoppedAfter") a következő trip lezárásáig
// nem tölti ki — a jelen pillanat előtti egy-két óra tehát a nyomvonalon
// üres. Ezt a lyukat a saját megfigyeléseinkből tömjük be: a 15 perces
// figyelő minden köre és minden GPS lap / Áttekintés betöltés felírja, hol
// volt a kocsi és mozgott-e; a kiegesziteloAllapottal (idovonal.ts) ebből
// tudja, mikor hagyta el a lezárt trip végpontját, és mióta áll a mostani
// helyén. Egy napra visszamenőleg — ennyi elég, mert az Ecofleet másnapra
// már lezárja a trip-eket. A memória mellé a fuvar_elo_megfigyeles táblába
// is íródik, és a folyamat az első használatkor onnan tölti vissza: korábban
// minden kiadás üresen indította, és a kiadás utáni első fél órában a
// megállón álló kocsi „nincs érintés” maradt (Micó, Kunhegyes, 2026-09-30).
//
// NEM "use server" fájl — tiszta modul, a szerveren fut, bárhonnan hívható.

import { query } from "@/lib/db";
import type { EloMegfigyeles } from "./idovonal";

const MEGORZES_MS = 24 * 60 * 60 * 1000;
/** Ennél sűrűbben nem jegyzünk fel új pontot ugyanarról a kocsiról (a 60 s-os oldal-gyorsítótár mellett is elég). */
const MIN_KOZ_MS = 60 * 1000;

const elozmeny = new Map<string, EloMegfigyeles[]>();
let betoltes: Promise<void> | null = null;

/**
 * Az adatbázisból visszatölti az elmúlt nap megfigyeléseit (folyamatonként
 * egyszer), és törli a két napnál régebbieket. Hiba esetén csendben üres
 * marad — a felismerés akkor is fut, csak a korábbi megfigyelések nélkül.
 */
export function betoltEloElozmenyt(): Promise<void> {
  betoltes ??= (async () => {
    try {
      await query(`delete from fuvar_elo_megfigyeles where idobelyeg < now() - interval '2 days'`);
      const sorok = await query<{ object_id: string; idobelyeg: Date; lat: number; lon: number; mozog: boolean }>(
        `select object_id, idobelyeg, lat, lon, mozog from fuvar_elo_megfigyeles
         where idobelyeg >= now() - interval '1 day' order by object_id, idobelyeg`
      );
      for (const r of sorok) {
        const lista = elozmeny.get(r.object_id) ?? [];
        const idobelyeg = new Date(r.idobelyeg);
        if (!lista.some((x) => x.idobelyeg.getTime() === idobelyeg.getTime())) {
          lista.push({ idobelyeg, lat: Number(r.lat), lon: Number(r.lon), mozog: r.mozog });
        }
        elozmeny.set(r.object_id, lista.sort((a, b) => a.idobelyeg.getTime() - b.idobelyeg.getTime()));
      }
    } catch (err) {
      console.error("[elo-elozmeny] visszatöltés sikertelen:", err);
    }
  })();
  return betoltes;
}

/** Egy jármű friss élő megfigyelésének felírása (az Ecofleet jel-idejével, nem a lekérdezés idejével). */
export function rogzitEloMegfigyelest(objectId: string, m: EloMegfigyeles): void {
  const lista = elozmeny.get(objectId) ?? [];
  const utolso = lista[lista.length - 1];
  if (utolso && m.idobelyeg.getTime() - utolso.idobelyeg.getTime() < MIN_KOZ_MS) return;
  const hatar = Date.now() - MEGORZES_MS;
  const friss = lista.filter((x) => x.idobelyeg.getTime() >= hatar);
  friss.push(m);
  elozmeny.set(objectId, friss);
  query(
    `insert into fuvar_elo_megfigyeles (object_id, idobelyeg, lat, lon, mozog) values ($1, $2, $3, $4, $5)
     on conflict do nothing`,
    [objectId, m.idobelyeg.toISOString(), m.lat, m.lon, m.mozog]
  ).catch((err) => console.error("[elo-elozmeny] felírás sikertelen:", err));
}

/** Egy jármű megőrzött megfigyelései, időrendben. */
export function getEloElozmeny(objectId: string): EloMegfigyeles[] {
  return [...(elozmeny.get(objectId) ?? [])];
}
