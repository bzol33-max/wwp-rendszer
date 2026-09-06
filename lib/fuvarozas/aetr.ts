// EU AETR vezetési-/pihenőidő szabályok egyszerűsített ellenőrzése a napi
// idővonal (lib/fuvarozas/idovonal.ts) VEZETÉS/ÁLLÁS szakaszaiból.
//
// FONTOS EGYSZERŰSÍTÉS: a teljes AETR-szabálykészlet (heti 2x 10 órás
// vezetési nap, heti 3x csökkentett 9 órás pihenő, osztott 15+30 perces
// szünet, kompenzációs pihenők stb.) pontos betartás-igazolásához hetekre
// visszamenő, folyamatos trip-előzmény kellene minden sofőrre. Ez a modul a
// kapott (jellemzően napi, ill. az idővonal-lekéréshez tartozó) trip-listán
// vizsgálja a legfontosabb, leggyakrabban sérülő szabályokat, és ahol a
// teljes körű ellenőrzéshez több adat kellene, azt a figyelmeztetés
// szövegében jelzi ("ellenőrizd kézzel is").
//
// NEM "use server" fájl — tiszta, szinkron függvények.

import type { IdovonalSzakasz } from "./idovonal";

export type AetrSulyossag = "hiba" | "figyelmeztetes" | "info";

export type AetrFigyelmezetes = {
  sulyossag: AetrSulyossag;
  uzenet: string;
  idopont: Date;
};

const NEGY_ES_FEL_ORA_SEC = 4.5 * 3600;
const ROVID_SZUNET_MIN_SEC = 15 * 60;
const TELJES_SZUNET_MIN_SEC = 45 * 60;
const NAPI_VEZETES_NORMAL_SEC = 9 * 3600;
const NAPI_VEZETES_HOSSZABBITOTT_SEC = 10 * 3600;
const NAPI_PIHENO_CSOKKENTETT_SEC = 9 * 3600;
const NAPI_PIHENO_NORMAL_SEC = 11 * 3600;

/**
 * Egy nap (egy jármű/sofőr) idővonalát ellenőrzi az AETR legfontosabb
 * szabályai szerint. A `szakaszok`-nak időrendben kell lennie (ahogy az
 * `epitsIdovonal` visszaadja).
 */
export function ellenorizAetr(szakaszok: IdovonalSzakasz[]): AetrFigyelmezetes[] {
  const figyelmezetesek: AetrFigyelmezetes[] = [];

  let folyamatosVezetesSec = 0;
  let osszesVezetesSec = 0;
  let vanOsztottRovidSzunetJelolt = false;
  let legutolsoAllasVege: Date | null = null;
  let leghosszabbAllasSec = 0;

  for (const sz of szakaszok) {
    if (sz.tipus === "vezetes") {
      folyamatosVezetesSec += sz.idotartamSec;
      osszesVezetesSec += sz.idotartamSec;

      if (folyamatosVezetesSec > NEGY_ES_FEL_ORA_SEC) {
        figyelmezetesek.push({
          sulyossag: "hiba",
          uzenet: `Folyamatos vezetés meghaladta a 4,5 órát megszakítás nélkül (${(folyamatosVezetesSec / 3600).toFixed(1)} óra) — kötelező legalább 45 perces (vagy 15+30 perc osztott) szünet lett volna szükséges.`,
          idopont: sz.veg,
        });
        // Ne áraszd el ismétlődő hibával ugyanarra a nyúlt vezetésre — nullázzuk, hogy csak egyszer jelezze szakaszonként.
        folyamatosVezetesSec = 0;
        vanOsztottRovidSzunetJelolt = false;
      }
    } else if (sz.tipus === "allas") {
      legutolsoAllasVege = sz.veg;
      leghosszabbAllasSec = Math.max(leghosszabbAllasSec, sz.idotartamSec);

      if (sz.idotartamSec >= TELJES_SZUNET_MIN_SEC) {
        folyamatosVezetesSec = 0;
        vanOsztottRovidSzunetJelolt = false;
      } else if (sz.idotartamSec >= ROVID_SZUNET_MIN_SEC) {
        // Osztott szünet első fele (15 perc) — csak akkor számít bele a
        // pihenésbe, ha ezt egy legalább 30 perces rész követi, ezt itt
        // nem tudjuk előre, ezért csak jelöljük, de nem nullázzuk a
        // folyamatos vezetést.
        vanOsztottRovidSzunetJelolt = true;
      } else {
        void vanOsztottRovidSzunetJelolt;
      }
    }
  }

  if (osszesVezetesSec > NAPI_VEZETES_HOSSZABBITOTT_SEC) {
    figyelmezetesek.push({
      sulyossag: "hiba",
      uzenet: `A napi vezetési idő meghaladta a 10 órát is (${(osszesVezetesSec / 3600).toFixed(1)} óra) — ez még a hosszabbított napi vezetési idővel sem engedélyezett.`,
      idopont: szakaszok[szakaszok.length - 1]?.tipus === "vezetes" ? (szakaszok[szakaszok.length - 1] as { veg: Date }).veg : new Date(),
    });
  } else if (osszesVezetesSec > NAPI_VEZETES_NORMAL_SEC) {
    figyelmezetesek.push({
      sulyossag: "figyelmeztetes",
      uzenet: `A napi vezetési idő meghaladta a 9 órát (${(osszesVezetesSec / 3600).toFixed(1)} óra) — ez csak hosszabbított vezetési napként engedélyezett, hetente legfeljebb kétszer. Ellenőrizd, hogy ezen a héten még nem volt-e két ilyen nap.`,
      idopont: new Date(),
    });
  }

  if (leghosszabbAllasSec > 0 && leghosszabbAllasSec < NAPI_PIHENO_CSOKKENTETT_SEC && osszesVezetesSec > 0) {
    figyelmezetesek.push({
      sulyossag: "figyelmeztetes",
      uzenet: `A nap legrövidebb pihenő szakasza mindössze ${(leghosszabbAllasSec / 3600).toFixed(1)} óra volt — a napi pihenőnek legalább 9 órának (csökkentett, hetente max 3x) vagy 11 órának (normál) kell lennie. Ha ez nem az éjszakai pihenő volt, ellenőrizd a következő nap adatait is.`,
      idopont: legutolsoAllasVege ?? new Date(),
    });
  } else if (leghosszabbAllasSec >= NAPI_PIHENO_CSOKKENTETT_SEC && leghosszabbAllasSec < NAPI_PIHENO_NORMAL_SEC) {
    figyelmezetesek.push({
      sulyossag: "info",
      uzenet: `A nap leghosszabb állása ${(leghosszabbAllasSec / 3600).toFixed(1)} óra — ez csak csökkentett napi pihenőként számít (hetente legfeljebb 3x engedélyezett).`,
      idopont: legutolsoAllasVege ?? new Date(),
    });
  }

  return figyelmezetesek;
}

/** Heti (Mon-Sun) összesített vezetési idő ellenőrzése — több nap idővonalának összegéből. */
export function ellenorizHetiVezetes(napiVezetesSecList: number[]): AetrFigyelmezetes[] {
  const HETI_MAX_SEC = 56 * 3600;
  const ket_HETI_MAX_SEC = 90 * 3600;
  const figyelmezetesek: AetrFigyelmezetes[] = [];
  const heti = napiVezetesSecList.reduce((a, b) => a + b, 0);
  if (heti > HETI_MAX_SEC) {
    figyelmezetesek.push({
      sulyossag: "hiba",
      uzenet: `A heti összes vezetési idő meghaladta az 56 órát (${(heti / 3600).toFixed(1)} óra).`,
      idopont: new Date(),
    });
  }
  if (heti > ket_HETI_MAX_SEC) {
    figyelmezetesek.push({
      sulyossag: "hiba",
      uzenet: `A két hetes összes vezetési idő meghaladta a 90 órát.`,
      idopont: new Date(),
    });
  }
  return figyelmezetesek;
}
