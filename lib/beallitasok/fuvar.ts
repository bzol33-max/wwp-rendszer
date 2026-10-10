import "server-only";
import { query } from "@/lib/db";
import { alapFuvarBeallitasok, fuvarBeallitasokSorokbol, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar-alap";

export type { FuvarBeallitasok, FuvarBeallitasKulcs } from "@/lib/beallitasok/fuvar-alap";
export { FUVAR_BEALLITAS_ALAP } from "@/lib/beallitasok/fuvar-alap";

// A fuvar_beallitas tábla (030-as migráció) aktuális értékei, rövid
// memóriabeli gyorsítótárral. BIZTONSÁGOS TARTALÉK: ha a tábla még nincs
// meg (a migráció nem futott), egy sor hiányzik, vagy az adatbázis hibázik,
// az alapértékekkel (lib/beallitasok/fuvar-alap.ts) megy tovább — ez a
// függvény SOHA nem dob.

const ERVENYES_MS = 60_000;
/** Hiba után ennyi ideig a tartalékkal megyünk, hogy ne kérdezzük minden hívásnál újra a hibás DB-t. */
const HIBA_UTAN_MS = 15_000;

let cache: { ertek: FuvarBeallitasok; lejar: number } | null = null;
let folyamatban: Promise<FuvarBeallitasok> | null = null;
let hibaNaplozva = false;

async function betolt(): Promise<FuvarBeallitasok> {
  try {
    const sorok = await query<{ kulcs: string; ertek: unknown }>(
      `select distinct on (kulcs) kulcs, ertek
         from fuvar_beallitas
        where ervenyes_tol <= now()
        order by kulcs, ervenyes_tol desc, id desc`
    );
    const ertek = fuvarBeallitasokSorokbol(sorok);
    cache = { ertek, lejar: Date.now() + ERVENYES_MS };
    hibaNaplozva = false;
    return ertek;
  } catch (err) {
    if (!hibaNaplozva) {
      hibaNaplozva = true;
      console.warn("[beallitasok] fuvar_beallitas nem olvasható, alapértékekkel számolunk:", err instanceof Error ? err.message : err);
    }
    const ertek = alapFuvarBeallitasok();
    cache = { ertek, lejar: Date.now() + HIBA_UTAN_MS };
    return ertek;
  }
}

/** Az aktuális fuvarozási beállítások (kb. 1 perces gyorsítótárral, tartalékkal). */
export async function getFuvarBeallitasok(): Promise<FuvarBeallitasok> {
  if (cache && cache.lejar > Date.now()) return { ...cache.ertek };
  if (!folyamatban) folyamatban = betolt().finally(() => { folyamatban = null; });
  return { ...(await folyamatban) };
}

/** Módosítás után (pl. egy beállító felületről) azonnal friss értékek. */
export function fuvarBeallitasCacheTorles(): void {
  cache = null;
}
