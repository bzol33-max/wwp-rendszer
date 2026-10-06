// Egy GPS-állás (vagy összevont látogatás) érintésnek számít-e egy tervezett
// megállónál — a döntés és az ELUTASÍTÁS OKA egy tiszta függvényben
// (scripts/teszt-varos-erintes.ts). (2026-10-06)
//
// Miért külön: élesben két érintés csendben elveszett, mert a cím csak
// település szintű volt —
//   • #293 lerakója "HU-4031 Debrecen" (utca nélkül): a kocsi 12:01–12:39
//     a Nyomdász u. 5-ben állt, a geokódolt pont a városközép, több km-re;
//   • #300 felrakója "4541 Nyírjákó, Fermentáló üzem Nyírjákó külterület":
//     Micó 11:06–13:12 a falu határában állt, a kör nem érte el.
// Ilyen címnél a település bármely pontján töltött HOSSZÚ (≥ 20 perces)
// állás is érintés — "város szintű egyezés" jelöléssel, mert nem bizonyos,
// hogy épp EZ volt a rakodás. És ha egy jelöltet elvetünk, az oka (messze:
// X km / az ablakon kívül / túl rövid) a figyelő naplójába kerül, hogy a
// következő "miért nem ismerte fel" kérdésre a Railway-naplóból válaszolni
// lehessen (lib/fuvarozas/teljesites-figyeles.ts).
//
// Tiszta modul: nincs DB, nincs hálózat — az idovonal.ts és a teszt is
// importálja.

import { cimKulcs, type CimPontossag } from "./varos";

/**
 * Ennél rövidebb állás nem számít fel-/lerakásnak — pusztán áthaladás
 * (lámpa, körforgalom, sorompó, egy cím melletti elhajtás).
 */
export const ERINTES_MIN_IDOTARTAM_SEC = 10 * 60;

/**
 * Ha az állás ennél közelebb (km) van a címhez, a rövid időtartam sem zárja
 * ki (a kapu előtt egy percre megállni is érintés). Ennél távolabb viszont
 * a 10 perces minimum kell — korábban a helyalapú "rakodás" kategória
 * bármilyen rövid állást átengedett a 2 km-es körön belül, így egy piros
 * lámpa vagy körforgalom a cím 1,9 km-es körzetében érkezésnek számított.
 */
export const KOZVETLEN_KOZELSEG_KM = 0.3;

/** Város szintű egyezéshez ennyi állás kell (a településen belüli piros lámpa, tankolás, rövid megállás kizárására). */
export const VAROS_SZINTU_MIN_SEC = 20 * 60;

/** Város szintű címnél ennyi km-en belül a településen belülinek vesszük az állást, a település nevétől függetlenül. */
export const VAROS_SZINTU_SUGAR_KM = 6;

/**
 * Ha az állás Ecofleet-címében ott a település neve, ennyi km-ig fogadjuk el
 * (Debrecen-méretű városnál a városközép és egy ipari park 6 km-nél is
 * messzebb lehet, a cím viszont egyértelműen ugyanaz a település).
 */
export const VAROS_NEVVEL_SUGAR_KM = 15;

/** Város szintű egyezés csak az ablak kezdetétől számított ennyi órán belül kezdődött állással (a megálló "napja"). */
export const VAROS_SZINTU_ABLAK_ORA = 24;

/** Igaz, ha az állás (Ecofleet) címében önálló szóként szerepel a település neve — ékezet- és kisbetű-független. */
export function telepulesEgyezik(varos: string | null | undefined, allasCim: string | null | undefined): boolean {
  const v = cimKulcs(varos ?? "");
  const c = cimKulcs(allasCim ?? "");
  if (v.length < 3 || !c) return false;
  return ` ${c} `.includes(` ${v} `);
}

export type ErintesMegalloAdat = {
  pontossag: CimPontossag;
  /** A megálló városneve (TervezettMegallo.cim). */
  varos: string;
  /** A cím felismerési köre (idovonal.ts cimSugarKm). */
  sugarKm: number;
  ablakKezdet: Date | null;
  fuvarLezarva?: Date | null;
};

export type ErintesJelolt = {
  /** A legkisebb távolság (km) a geokódolt címtől. */
  tavKm: number;
  idotartamSec: number;
  kezdet: Date;
  veg: Date;
  /** Az állás Ecofleet-címe, ha ismert. */
  allasCim: string | null;
};

export type ElutasitasOk = "messze" | "ablak_elott" | "ablak_utan" | "lezaras_utan" | "rovid";

export type ErintesDontes =
  | { elfogadva: true; szint: "cim" | "varos" }
  | { elfogadva: false; ok: ElutasitasOk; reszlet: string };

const perc = (sec: number) => Math.round(sec / 60);

/**
 * Városszintű körben van-e az állás (a döntés helyfüggő része, időtartam és
 * ablak nélkül) — az idovonal.ts látogatás-képzése ezzel szedi össze a
 * jelölteket a cím felismerési körén túl.
 */
export function varosKorben(m: Pick<ErintesMegalloAdat, "pontossag" | "varos">, tavKm: number, allasCim: string | null): boolean {
  if (m.pontossag !== "csak_varos") return false;
  return tavKm < VAROS_SZINTU_SUGAR_KM || (tavKm < VAROS_NEVVEL_SUGAR_KM && telepulesEgyezik(m.varos, allasCim));
}

/**
 * A döntés egy jelöltről. Sorrend: időablak, lezárás, majd a hely — a cím
 * körén belül a régi szabály (≥ 10 perc, vagy 300 m-en belül bármennyi),
 * azon kívül csak város szintű címnél, a településen, ≥ 20 perc, a megálló
 * ablakának kezdetétől 24 órán belül.
 */
export function erintesDontes(m: ErintesMegalloAdat, j: ErintesJelolt): ErintesDontes {
  const tav = `${j.tavKm.toFixed(1)} km`;
  if (m.ablakKezdet && j.veg.getTime() < m.ablakKezdet.getTime()) {
    return { elfogadva: false, ok: "ablak_elott", reszlet: `az ablak előtt véget ért (${tav})` };
  }
  if (m.fuvarLezarva && j.kezdet.getTime() > m.fuvarLezarva.getTime()) {
    return { elfogadva: false, ok: "lezaras_utan", reszlet: `a fuvar lezárása után kezdődött (${tav})` };
  }
  if (j.tavKm < m.sugarKm) {
    if (j.idotartamSec < ERINTES_MIN_IDOTARTAM_SEC && j.tavKm >= KOZVETLEN_KOZELSEG_KM) {
      return { elfogadva: false, ok: "rovid", reszlet: `túl rövid: ${perc(j.idotartamSec)} perc < ${perc(ERINTES_MIN_IDOTARTAM_SEC)} (${tav})` };
    }
    return { elfogadva: true, szint: "cim" };
  }
  if (!varosKorben(m, j.tavKm, j.allasCim)) {
    const hatar = m.pontossag === "csak_varos" ? `${VAROS_SZINTU_SUGAR_KM} km, a település nevével ${VAROS_NEVVEL_SUGAR_KM} km` : `${m.sugarKm} km`;
    return { elfogadva: false, ok: "messze", reszlet: `messze: ${tav} (kör ${hatar})` };
  }
  if (m.ablakKezdet && j.kezdet.getTime() > m.ablakKezdet.getTime() + VAROS_SZINTU_ABLAK_ORA * 3600_000) {
    return { elfogadva: false, ok: "ablak_utan", reszlet: `város szintű jelölt, de ${VAROS_SZINTU_ABLAK_ORA} óránál később az ablak kezdete után (${tav})` };
  }
  if (j.idotartamSec < VAROS_SZINTU_MIN_SEC) {
    return { elfogadva: false, ok: "rovid", reszlet: `város szintű jelölt, de túl rövid: ${perc(j.idotartamSec)} perc < ${perc(VAROS_SZINTU_MIN_SEC)} (${tav})` };
  }
  return { elfogadva: true, szint: "varos" };
}
