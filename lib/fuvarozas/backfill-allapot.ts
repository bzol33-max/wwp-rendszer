// Régi fül → új `allapot` leképezés (Fuvarozás 2, E6). Az EGYETLEN forrás
// arra, hogy egy mai `fuvar_megbizasok` sor a régi jelölőiből milyen új
// állapotot kap — a claude/fuvarozas-atallas-ellenorzes.md 11.2 táblája.
//
// Tiszta modul (nincs DB): a scripts/fuvarozas2-backfill.ts ezzel ír, és
// ugyanezzel ELLENŐRIZ (--check): minden soron a régi getFuvarHelye() és
// az eltárolt `allapot` ezen a táblán át egyezik → 0 eltérés az E6 kapu.

import { getFuvarHelye, type FuvarHely, type FuvarHelyBemenet } from "@/lib/fuvarozas/fuvar-hely";
import type { Allapot } from "@/lib/fuvarozas/allapot";

export type BackfillBemenet = FuvarHelyBemenet & {
  ellenorzott: boolean;
  /** Van-e a sorhoz 'fuvarlevel' típusú dokumentum (sofőr-fotó). */
  fotoVan: boolean;
  papirok_beerkeztek_at: string | Date | null;
  statusz: string;
};

export type BackfillEredmeny = {
  allapot: Allapot;
  /** A régi fül, amiből jött — a naplóba és az ellenőrzéshez. */
  regiHely: FuvarHely;
  /** Miért pont ez — a `megbizas_esemeny.reszletek`-be. */
  indok: string;
};

/**
 * 11.2 tábla. `ma` = budapesti nap (YYYY-MM-DD), `most` = a postázási ablakhoz.
 * A törölt sor (`statusz='torolt'`) is kap állapotot — a törlést a
 * `torolt_at` hordozza (S9), az állapot "amilyen lenne, ha nem törölték volna".
 */
export function regiHelyUjAllapot(sor: BackfillBemenet, ma: string, most: Date = new Date()): BackfillEredmeny {
  const regiHely = getFuvarHelye(sor, ma, most);
  const szamlas = (sor.szamla_szam ?? "") !== "";
  const felrakasNap = sor.datum_iso;
  const jelleg: "ber" | "sajat" = sor.tipus === "sajat" ? "ber" : "sajat";

  switch (regiHely) {
    case "ber_folyamatban":
    case "sajat_folyamatban": {
      if (!sor.ellenorzott) return { allapot: "ellenorzesre_var", regiHely, indok: "ellenorzott=false" };
      if (felrakasNap > ma) return { allapot: "tervezett", regiHely, indok: "felrakás a jövőben" };
      return { allapot: "folyamatban", regiHely, indok: "felrakás ma/múlt, nincs teljesítés" };
    }
    case "szamla_posta": {
      // Csak jelleg='ber' kerülhet ide (a régi szabály szerint tipus='sajat').
      if (szamlas && sor.postazva) {
        return { allapot: "postazva", regiHely, indok: "számla + postázva (5 perces ablakon belül)" };
      }
      if (szamlas) return { allapot: "szamlazva", regiHely, indok: "van számlaszám, nincs postázva" };
      if (sor.fotoVan) return { allapot: "szamlazhato", regiHely, indok: "fuvarlevél-fotó megvan" };
      return { allapot: "teljesitve", regiHely, indok: "munka kész, fotó nincs" };
    }
    case "archiv": {
      return {
        allapot: "lezart",
        regiHely,
        indok: jelleg === "sajat" ? "saját fuvar, munka kész (12. él, migráció)" : "számla + postázva, ablak lejárt",
      };
    }
  }
}

/** Az elszámolás-sorhoz és a 'teljesitve' eseményhez: mikor hagyta el az utolsó lerakót (S6, becsült). */
export function becsultElhagyvaAt(sor: {
  teljesitve_at: string | Date | null;
  lerakas_datum_iso: string | null;
  datum_iso: string;
  created_at: string | Date;
}): { at: Date; becsult: boolean } {
  if (sor.teljesitve_at) return { at: new Date(sor.teljesitve_at), becsult: false };
  const nap = sor.lerakas_datum_iso ?? sor.datum_iso;
  // 18:00 Europe/Budapest — nyáron +02:00, télen +01:00; a migráció becsült
  // értékéhez a +02:00/+01:00 különbség nem számít (a papír-határidő napban mérve).
  const d = new Date(`${nap}T18:00:00+02:00`);
  return Number.isNaN(d.getTime()) ? { at: new Date(sor.created_at), becsult: true } : { at: d, becsult: true };
}
