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

type AetrAllapot = {
  folyamatosVezetesSec: number;
  osszesVezetesSec: number;
  /** 15-44 perces szünetekből eddig összegyűlt idő egy még nyitott 45 perces (osztott) szünethez. */
  osztottSzunetResztvevoSec: number;
  leghosszabbAllasSec: number;
  legutolsoAllasVege: Date | null;
};

function ujAllapot(): AetrAllapot {
  return {
    folyamatosVezetesSec: 0,
    osszesVezetesSec: 0,
    osztottSzunetResztvevoSec: 0,
    leghosszabbAllasSec: 0,
    legutolsoAllasVege: null,
  };
}

/**
 * Egyszer végigmegy a szakaszokon, karbantartva a folyamatos vezetési idő
 * számlálóját — ez a közös mag, amit az ellenorizAetr() (visszamenőleges
 * hibajelzés) ÉS a szamitsAetrKoltsegvetes() (előretekintő, "meddig mehet
 * még" becslés) is ugyanúgy használ, hogy a szünet-felismerés logikája ne
 * duplikálódjon/térjen el a kétféle célra.
 *
 * A 15+30 perces OSZTOTT szünet helyesen kezelve: egy 15-44 perces szünet
 * önmagában NEM nullázza a folyamatos vezetést, de "osztottSzunetResztvevoSec"-be
 * beleszámít — ha ez (egy vagy több rövidebb szünetből) eléri a 45 percet,
 * az a pillanat már a teljes megszakításnak számít, és nullázza a folyamatos
 * vezetést, ugyanúgy, mintha egyben tartott ≥45 perces szünet lett volna.
 * (Korábbi hiba: ez a felismerés meg volt írva, de sosem lett ténylegesen
 * felhasználva — egy szabályos osztott szünet után is fals "hiba"
 * figyelmeztetést adott a rendszer.)
 *
 * `onFolyamatosVezetesTullepes` — ha meg van adva, minden alkalommal
 * meghívódik, amikor a folyamatos vezetés ténylegesen túllépi a 4,5 órát
 * (mielőtt a számláló nullázódna) — ezt használja az ellenorizAetr() a
 * "hiba" figyelmeztetés generálásához.
 */
function vegigmegySzakaszokon(
  szakaszok: IdovonalSzakasz[],
  onFolyamatosVezetesTullepes?: (idopont: Date, folyamatosVezetesSec: number) => void
): AetrAllapot {
  const allapot = ujAllapot();

  for (const sz of szakaszok) {
    if (sz.tipus === "vezetes") {
      allapot.folyamatosVezetesSec += sz.idotartamSec;
      allapot.osszesVezetesSec += sz.idotartamSec;

      if (allapot.folyamatosVezetesSec > NEGY_ES_FEL_ORA_SEC) {
        onFolyamatosVezetesTullepes?.(sz.veg, allapot.folyamatosVezetesSec);
        // Ne áraszd el ismétlődő hibával ugyanarra a nyúlt vezetésre — nullázzuk, hogy csak egyszer jelezze szakaszonként.
        allapot.folyamatosVezetesSec = 0;
        allapot.osztottSzunetResztvevoSec = 0;
      }
    } else if (sz.tipus === "allas") {
      allapot.legutolsoAllasVege = sz.veg;
      allapot.leghosszabbAllasSec = Math.max(allapot.leghosszabbAllasSec, sz.idotartamSec);

      if (sz.idotartamSec >= TELJES_SZUNET_MIN_SEC) {
        allapot.folyamatosVezetesSec = 0;
        allapot.osztottSzunetResztvevoSec = 0;
      } else if (sz.idotartamSec >= ROVID_SZUNET_MIN_SEC) {
        allapot.osztottSzunetResztvevoSec += sz.idotartamSec;
        if (allapot.osztottSzunetResztvevoSec >= TELJES_SZUNET_MIN_SEC) {
          allapot.folyamatosVezetesSec = 0;
          allapot.osztottSzunetResztvevoSec = 0;
        }
      }
      // 15 percnél rövidebb megállás egyáltalán nem számít bele a pihenésbe.
    }
  }

  return allapot;
}

/**
 * Egy nap (egy jármű/sofőr) idővonalát ellenőrzi az AETR legfontosabb
 * szabályai szerint. A `szakaszok`-nak időrendben kell lennie (ahogy az
 * `epitsIdovonal` visszaadja).
 */
export function ellenorizAetr(szakaszok: IdovonalSzakasz[]): AetrFigyelmezetes[] {
  const figyelmezetesek: AetrFigyelmezetes[] = [];

  const vegallapot = vegigmegySzakaszokon(szakaszok, (idopont, folyamatosVezetesSec) => {
    figyelmezetesek.push({
      sulyossag: "hiba",
      uzenet: `Folyamatos vezetés meghaladta a 4,5 órát megszakítás nélkül (${(folyamatosVezetesSec / 3600).toFixed(1)} óra) — kötelező legalább 45 perces (vagy 15+30 perc osztott) szünet lett volna szükséges.`,
      idopont,
    });
  });
  const { osszesVezetesSec, leghosszabbAllasSec, legutolsoAllasVege } = vegallapot;

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

export type AetrKoltsegvetes = {
  /** Folyamatos vezetés az utolsó minősített (≥45 perces, vagy összeadva azzá álló) szünet óta. */
  folyamatosVezetesSecEddig: number;
  /** Teljes mai vezetési idő eddig. */
  napiVezetesSecEddig: number;
  /** A mára alkalmazható napi vezetési keret — 10 óra, ha a héten még nem fogyott el mindkét hosszabbított nap, egyébként 9 óra. */
  napiVezetesKeretSec: number;
  /** Legkésőbb ekkor kötelező megállni (a 4,5 órás folyamatos vezetési korlát miatt) — null, ha a jármű épp nem vezet. */
  kotelezoMegallasIdo: Date | null;
  /** Legkésőbb ekkor kell befejezni a mai vezetést (napi keret miatt) — null, ha a jármű épp nem vezet. */
  napiVezetesVegeIdo: Date | null;
};

/**
 * Előretekintő becslés: a jelenlegi pillanatban (`most`) meddig mehet még a
 * jármű, mielőtt kötelező szünetet kellene tartania, illetve mikor ér véget
 * a mai megengedett vezetési ideje — FELTÉVE, hogy onnantól folyamatosan
 * vezet. Csak akkor ad konkrét jövőbeli időpontot, ha a szakaszok utolsó
 * eleme egy éppen folyamatban lévő ("elő", élő GPS-ből meghosszabbított)
 * vezetés-szakasz — álláskor a korlát nem "ketyeg", nincs mit kivetíteni.
 */
export function szamitsAetrKoltsegvetes(
  szakaszok: IdovonalSzakasz[],
  most: Date,
  kiterjesztettNapokEHeten: number
): AetrKoltsegvetes {
  const { folyamatosVezetesSec, osszesVezetesSec } = vegigmegySzakaszokon(szakaszok);
  const napiVezetesKeretSec =
    kiterjesztettNapokEHeten < 2 ? NAPI_VEZETES_HOSSZABBITOTT_SEC : NAPI_VEZETES_NORMAL_SEC;

  const utolso = szakaszok[szakaszok.length - 1];
  const eppenVezet = utolso?.tipus === "vezetes" && utolso.elo === true;

  if (!eppenVezet) {
    return {
      folyamatosVezetesSecEddig: folyamatosVezetesSec,
      napiVezetesSecEddig: osszesVezetesSec,
      napiVezetesKeretSec,
      kotelezoMegallasIdo: null,
      napiVezetesVegeIdo: null,
    };
  }

  const megallasigHatraSec = Math.max(0, NEGY_ES_FEL_ORA_SEC - folyamatosVezetesSec);
  const napVegeigHatraSec = Math.max(0, napiVezetesKeretSec - osszesVezetesSec);

  return {
    folyamatosVezetesSecEddig: folyamatosVezetesSec,
    napiVezetesSecEddig: osszesVezetesSec,
    napiVezetesKeretSec,
    kotelezoMegallasIdo: new Date(most.getTime() + megallasigHatraSec * 1000),
    napiVezetesVegeIdo: new Date(most.getTime() + napVegeigHatraSec * 1000),
  };
}
