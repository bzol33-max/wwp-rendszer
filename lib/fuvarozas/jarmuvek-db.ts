import "server-only";
import { query } from "@/lib/db";
import {
  SAJAT_JARMUVEK,
  jarmuListaBeallitasa,
  jarmuvekSorokbol,
  type JarmuTorzsSor,
  type SajatJarmu,
} from "@/lib/fuvarozas/vehicles";

// A saját járművek a fuvar_jarmuvek táblából (törzsadat, 2026-10-10), kb. 60
// másodperces gyorsítótárral. Ugyanazt az alakot adja, mint a régi
// SAJAT_JARMUVEK konstans, így egy 3./4. jármű pusztán adatként mindenhol
// megjelenik. Ha a DB nem érhető el, a konstans a tartalék — a hívó sosem
// kap hibát.
//
// Az eredményt a vehicles.ts `jarmuLista()` mögé is regisztráljuk, hogy a
// lista-paraméter nélkül hívott kereső segédek (findJarmuInSzoveg,
// resolveJarmu …) is a DB szerinti járműveket lássák.
//
// AZONOSSÁG: sok hívó `resolveJarmu(x) === jarmu` összevetést használ. Ha
// frissítéskor a tartalom nem változott, a RÉGI tömböt (és objektumokat)
// tartjuk meg, hogy egy futó kérés közbeni frissítés ne bontsa meg ezt.

const ERVENYES_MS = 60_000;
const HIBA_UTAN_MS = 15_000;

let cache: { lista: SajatJarmu[]; ujjlenyomat: string; lejar: number } | null = null;
let folyamatban: Promise<SajatJarmu[]> | null = null;

// A 031-es migráció utáni teljes lekérdezés (pótkocsi a fuvar_potkocsik-ból,
// becenév) — és a régi séma szerinti tartalék, ha az oszlopok még nincsenek meg.
const TELJES = `
  select j.id::text, j.kod, j.cimke, j.vontato_rendszam,
         coalesce(p.rendszam, j.potkocsi_rendszam) as potkocsi_rendszam,
         j.irasvaltozatok, j.szin, j.ecofleet_object_id, j.sofor_id::text,
         a.name as sofor_nev, j.sofor_becenev
    from fuvar_jarmuvek j
    left join fuvar_potkocsik p on p.id = j.potkocsi_id
    left join alkalmazottak a on a.id = j.sofor_id
   where j.aktiv
   order by j.id`;
const REGI = `
  select j.id::text, j.kod, j.cimke, j.vontato_rendszam, j.potkocsi_rendszam,
         j.irasvaltozatok, j.szin, j.ecofleet_object_id, j.sofor_id::text,
         a.name as sofor_nev, null::text as sofor_becenev
    from fuvar_jarmuvek j
    left join alkalmazottak a on a.id = j.sofor_id
   where j.aktiv
   order by j.id`;

async function betolt(): Promise<SajatJarmu[]> {
  let sorok: JarmuTorzsSor[] | null = null;
  try {
    sorok = await query<JarmuTorzsSor>(TELJES);
  } catch {
    try {
      sorok = await query<JarmuTorzsSor>(REGI);
    } catch (err) {
      console.warn("[jarmuvek] fuvar_jarmuvek nem olvasható, a beépített listával megyünk:", err instanceof Error ? err.message : err);
    }
  }
  if (!sorok || sorok.length === 0) {
    // Átmeneti hibánál az utolsó jó lista marad (a regisztrált lista és a
    // visszaadott lista így mindig ugyanaz — lásd AZONOSSÁG fent).
    if (sorok === null && cache && cache.ujjlenyomat !== "tartalek") {
      cache = { ...cache, lejar: Date.now() + HIBA_UTAN_MS };
      return cache.lista;
    }
    cache = { lista: SAJAT_JARMUVEK, ujjlenyomat: "tartalek", lejar: Date.now() + HIBA_UTAN_MS };
    jarmuListaBeallitasa(SAJAT_JARMUVEK);
    return SAJAT_JARMUVEK;
  }
  const lista = jarmuvekSorokbol(sorok);
  const ujjlenyomat = JSON.stringify(lista);
  if (cache && cache.ujjlenyomat === ujjlenyomat) {
    cache = { ...cache, lejar: Date.now() + ERVENYES_MS };
    return cache.lista;
  }
  cache = { lista, ujjlenyomat, lejar: Date.now() + ERVENYES_MS };
  jarmuListaBeallitasa(lista);
  return lista;
}

/** A saját (aktív) járművek a DB-ből, ~60 s gyorsítótárral; hiba esetén a beépített lista. */
export async function getJarmuvek(): Promise<SajatJarmu[]> {
  if (cache && cache.lejar > Date.now()) return cache.lista;
  if (!folyamatban) folyamatban = betolt().finally(() => { folyamatban = null; });
  return folyamatban;
}

/** Módosítás után (Járművek oldal) azonnal friss lista. */
export function jarmuCacheTorles(): void {
  if (cache) cache = { ...cache, lejar: 0 };
}
