import "server-only";
import { query } from "@/lib/db";
import { SAJAT_TELEPHELYEK, indulasiTelephely, type SajatTelephely } from "@/lib/fuvarozas/telephelyek";

// A saját telephelyek/parkolók a telephely_pont táblából (031-es migráció),
// kb. 1 perces gyorsítótárral. Ha a tábla még nincs meg, üres, vagy a DB
// hibázik, a lib/fuvarozas/telephelyek.ts konstans listája a tartalék — a
// hívó sosem kap hibát.

const ERVENYES_MS = 60_000;
let cache: { lista: SajatTelephely[]; lejar: number } | null = null;

export async function getSajatTelephelyek(): Promise<SajatTelephely[]> {
  if (cache && cache.lejar > Date.now()) return cache.lista;
  try {
    const sorok = await query<{ nev: string; cim: string; tipus: SajatTelephely["tipus"]; indulasi_pont: boolean; lat: number | null; lon: number | null }>(
      `select nev, cim, tipus, indulasi_pont, lat, lon
         from telephely_pont
        where aktiv
        order by indulasi_pont desc, sorrend, id`
    );
    const lista: SajatTelephely[] = sorok.length
      ? sorok.map((s) => ({ nev: s.nev, cim: s.cim, tipus: s.tipus, indulasiPont: s.indulasi_pont, lat: s.lat, lon: s.lon }))
      : SAJAT_TELEPHELYEK;
    cache = { lista, lejar: Date.now() + ERVENYES_MS };
    return lista;
  } catch {
    cache = { lista: SAJAT_TELEPHELYEK, lejar: Date.now() + 15_000 };
    return SAJAT_TELEPHELYEK;
  }
}

/** Az indulási pont (a kalkulátor/tervezés „telephelye”) — alapból Szakoly, Rákóczi utca 26. */
export async function getIndulasiTelephely(): Promise<SajatTelephely> {
  return indulasiTelephely(await getSajatTelephelyek());
}

/**
 * Egy jármű saját indulási pontja (fuvar_jarmuvek.alap_telephely_pont_id), ha
 * van; különben a közös indulási pont.
 */
export async function getJarmuIndulasiTelephely(jarmuKod: string | null | undefined): Promise<SajatTelephely> {
  if (jarmuKod) {
    try {
      const [sor] = await query<{ nev: string; cim: string; lat: number | null; lon: number | null }>(
        `select t.nev, t.cim, t.lat, t.lon
           from fuvar_jarmuvek j join telephely_pont t on t.id = j.alap_telephely_pont_id
          where j.kod = $1 and t.aktiv`,
        [jarmuKod]
      );
      if (sor) return { nev: sor.nev, cim: sor.cim, lat: sor.lat, lon: sor.lon };
    } catch {
      // a 031-es migráció előtt nincs ilyen oszlop — a közös pont marad
    }
  }
  return getIndulasiTelephely();
}

export function telephelyCacheTorles(): void {
  cache = null;
}
