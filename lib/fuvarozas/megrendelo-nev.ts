import "server-only";
import { query } from "@/lib/db";
import { ceglNevKanonikusan, normalizaltCegKulcs, sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";

// Külön modulban, mert a régi (lib/fuvarozas/megbizasok.ts) és az új
// (lib/fuvarozas2/megbizasok.ts) mentés is használja, egy "use server" fájl
// exportja pedig távolról hívható akció lenne.

/**
 * A Drive/Gmail-automatika minden megbízást a saját dokumentumának
 * szövegéből olvas ki újra, cégnyilvántartás nélkül — ezért ugyanaz a
 * partner megbízásonként eltérő írásmóddal (kis/nagybetű, kötőjel,
 * cégforma-toldalék, vagy a CEG_ALIAS_CSOPORTOK-ban rögzített, tartalmilag
 * eltérő névváltozat) kerülhet be. Ez a lépés az addFuvar/approveFuvar
 * mentés ELŐTT lefutva a DB-ben MÁR meglévő megrendelő-nevek közül
 * kiválasztja azt, amelyik ugyanarra a normalizált kulcsra esik (a
 * leggyakrabban előfordulót, ha korábbról több variáns is létezne), és azt
 * írja be — így maga a tárolt adat is egységesedik egyetlen írásmódra,
 * nem csak az Archív/Kapcsolatok fülek megjelenítési csoportosítása.
 * Teljesen új partnernél (nincs egyező kulcs) a whitespace-normalizált
 * nyers nevet adja vissza.
 */
export async function kanonikusMegrendeloNev(nyersNev: string | null | undefined): Promise<string | null> {
  const nev = nyersNev?.trim().replace(/\s+/g, " ");
  if (!nev) return null;
  // Szabály: a saját cégünk sosem megrendelő (mi vagyunk a megbízott). Az
  // import már szűri, de a kézi felvitel/jóváhagyás is ezen a ponton megy át,
  // így a mezőt itt is üresen hagyjuk, nem csak a következő indításkor javítjuk.
  if (sajatCegunkE(nev)) return null;
  const kulcs = normalizaltCegKulcs(ceglNevKanonikusan(nev));
  const meglevok = await query<{ megrendelo: string }>(
    `select megrendelo from fuvar_megbizasok
     where megrendelo is not null
     group by megrendelo
     order by count(*) desc`
  );
  for (const { megrendelo } of meglevok) {
    if (normalizaltCegKulcs(ceglNevKanonikusan(megrendelo)) === kulcs) {
      return megrendelo;
    }
  }
  return nev;
}
