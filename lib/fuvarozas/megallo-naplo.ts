"use server";

// GPS-alapú érintés-napló: megőrzi, mikor ért a kamion ténylegesen egy fuvar
// fel-/lerakó állomására, és mikor indult tovább onnan.
//
// Miért kell eltárolni, ha a GPS-idővonalból amúgy is kiszámolható? Mert az
// Ecofleet trip-előzménye nem marad meg örökre, a számlázás viszont napokkal
// — a papír beérkezésétől függően akár hetekkel — a lerakás után történik
// (lásd db/schema.sql, fuvar_megallo_allapot). A "mióta várunk a papírra"
// kérdéshez tehát egy tartós, a GPS-lekérdezéstől független tényleges
// lerakás-időpont kell.
//
// A tábla a sofőr kézi megerősítésével közös (fuvar_megallo_allapot): ott a
// kesz/kesz_at/kesz_by oszlopok az emberi jelölést tartják, itt a
// gps_erkezes/gps_tavozas a gépi megfigyelést. A kettő szándékosan külön áll,
// nem írják felül egymást — a sofőr megerősítése mindig erősebb bizonyíték,
// a GPS pedig akkor is ad adatot, ha a sofőr nem jelölt semmit.

import { query } from "@/lib/db";

export type GpsErintes = {
  fuvarId: string;
  /** A megálló sorszáma a fuvar állomás-sorrendjében — lásd TervezettMegallo.index. */
  index: number;
  erkezes: Date;
  /** Null, amíg a jármű ott áll. */
  tavozas: Date | null;
};

/**
 * Az észlelt érintések felírása. Szándékosan MONOTON: az érkezés csak
 * korábbi, a távozás csak későbbi irányba mozdulhat (least/greatest), így egy
 * pontatlan GPS-minta vagy egy szűkebb ablakon futó újraszámolás nem írja
 * felül a már rögzített, helyes időpontot. A sofőr kézi jelölését
 * (kesz/kesz_at/kesz_by) nem érinti.
 *
 * Megfigyelés-naplózás, nem felhasználói művelet: nincs jogosultság-ellenőrzés,
 * mert kizárólag gépi adatot ír, felhasználói bemenet nélkül.
 */
export async function rogzitGpsErinteseket(erintesek: GpsErintes[]): Promise<void> {
  if (erintesek.length === 0) return;
  await query(
    `insert into fuvar_megallo_allapot (fuvar_id, megallo_index, gps_erkezes, gps_tavozas)
     select * from unnest($1::bigint[], $2::int[], $3::timestamptz[], $4::timestamptz[])
     on conflict (fuvar_id, megallo_index) do update set
       gps_erkezes = least(fuvar_megallo_allapot.gps_erkezes, excluded.gps_erkezes),
       gps_tavozas = greatest(fuvar_megallo_allapot.gps_tavozas, excluded.gps_tavozas)`,
    [
      erintesek.map((e) => e.fuvarId),
      erintesek.map((e) => e.index),
      erintesek.map((e) => e.erkezes.toISOString()),
      erintesek.map((e) => e.tavozas?.toISOString() ?? null),
    ]
  );
}
