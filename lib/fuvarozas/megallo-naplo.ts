"use server";

// GPS-alapú érintés-napló: megőrzi, mikor ért a kamion ténylegesen egy fuvar
// fel-/lerakó állomására, és mikor indult tovább onnan.
//
// Miért kell eltárolni, ha a GPS-idővonalból amúgy is kiszámolható? Mert az
// Ecofleet trip-előzménye nem marad meg örökre, a számlázás viszont napokkal
// — a papír beérkezésétől függően akár hetekkel — a lerakás után történik
// (lásd db/migrations/001_fuvarozas2_sema.sql, fuvar_megallok). (2026-10-06) A "mióta várunk a papírra"
// kérdéshez tehát egy tartós, a GPS-lekérdezéstől független tényleges
// lerakás-időpont kell.
//
// A tábla a sofőr kézi megerősítésével közös (fuvar_megallok): ott a
// sofor_kesz_at/sofor_kesz_by oszlopok az emberi jelölést tartják, itt a
// gps_erkezes/gps_tavozas a gépi megfigyelést. A kettő szándékosan külön áll,
// nem írják felül egymást — a sofőr megerősítése mindig erősebb bizonyíték,
// a GPS pedig akkor is ad adatot, ha a sofőr nem jelölt semmit.

import { requireEditPermission } from "@/lib/auth/require-permission";
import { withTransaction } from "@/lib/db";
import { gpsErintesTx } from "@/lib/megbizasok/megallo";

export type GpsErintes = {
  fuvarId: string;
  /** A megálló sorszáma a fuvar állomás-sorrendjében — lásd TervezettMegallo.index. */
  index: number;
  erkezes: Date;
  /** Null, amíg a jármű ott áll. */
  tavozas: Date | null;
};

/**
 * Az észlelt érintések felírása — a legutóbbi felismerés FELÜLÍRJA a
 * korábbit. Az első változat "monoton" volt (least érkezés / greatest
 * távozás), abból a feltevésből, hogy egy megállónak egy látogatása van;
 * élesben viszont két külön látogatást mosott egybe (a #128 pápai lerakója
 * a #126 09-15-i pápai felrakásának érkezését és a saját 09-16-i távozását
 * kapta), és a hibás korai érkezést utána semmi nem tudta kijavítani.
 * Mostantól kizárólag az 5 perces figyelő ír ide (3 napos trip-ablakkal,
 * lásd teljesites-figyeles.ts), a GPS lap csak olvas — így nincs szűkebb
 * ablakú, rosszabb újraszámolás, ami felülírhatná. A sofőr kézi jelölését
 * (kesz/kesz_at/kesz_by) nem érinti.
 *
 * Megfigyelés-naplózás, nem felhasználói művelet — de mivel "use server"
 * fájlban van, kívülről is hívható akció: a jogosultság-ellenőrzés ezért kell
 * (audit 2026-10-04). Az ütemező rendszerjogon (futtatRendszerkent) átmegy.
 */
export async function rogzitGpsErinteseket(erintesek: GpsErintes[]): Promise<void> {
  await requireEditPermission("fuvarozas");
  if (erintesek.length === 0) return;
  // A korábbi tömbös upsert helyett az új és a régi sorok együtt, egy tranzakcióban íródnak.
  await withTransaction(async (tx) => {
    for (const e of erintesek) await gpsErintesTx(tx, e.fuvarId, e.index, e.erkezes, e.tavozas);
  });
}
