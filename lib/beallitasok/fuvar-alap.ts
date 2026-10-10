// Fuvarozási beállítások — a kulcsok, a típus és az ALAPÉRTÉKEK. Tiszta
// modul (se "server-only", se adatbázis): a tesztek és a tiszta számoló
// függvények is importálhatják. Az aktuális értéket a szerveren a
// lib/beallitasok/fuvar.ts getFuvarBeallitasok() adja (fuvar_beallitas
// tábla, 030-as migráció); ha a tábla vagy egy sor hiányzik, ezek az
// alapértékek érvényesek — ugyanazok, amiket a migráció beír.
//
// Tulajdonosi döntések (2026-10-10): alap fogyasztás 28 l/100 km, a mért
// Ecofleet-érték csak 300 mért km fölött írja felül.

export const FUVAR_BEALLITAS_ALAP = {
  /** l/100 km — ha nincs (elég) mért adat, ezzel számolunk. */
  fogyasztas_alap_l_100km: 28,
  /** Ennyi mért km FÖLÖTT írja felül a mért (Ecofleet) fogyasztás az alapot. */
  meres_min_km: 300,
  /** Sofőr + kocsi együttes napi költsége, Ft/nap/kocsi. */
  napi_koltseg_ft: 50_000,
  /** Saját fuvar „bérben mennyibe került volna”: rakott km × ez, Ft/km. */
  sajat_fuvar_km_dij_ft: 550,
  /** A flotta tankolási kedvezménye a NAV-árhoz képest, Ft/l. */
  tankolasi_kedvezmeny_ft_l: 50,
  /** NAV gázolajár-tartalék, ha az oldal nem érhető el, Ft/l (kedvezmény nélkül). */
  gazolaj_ar_tartalek_ft: 667,
  /** Ennél hosszabb üres indulásnál figyelmeztetés, km. */
  ures_indulas_figyelmeztetes_km: 30,
  /** Felrakásra tervezett idő, perc. */
  felrakas_rahagyas_perc: 30,
  /** Lerakásra tervezett idő, perc. */
  lerakas_rahagyas_perc: 45,
  /** Ennél régebbi GPS-jel „késik”, perc. */
  gps_kesei_perc: 10,
  /** Ennél régebbi GPS-jel „elavult”, perc. */
  gps_elavult_perc: 30,
  /** Saját fuvar súlya a bérfuvarhoz képest a tervezésben (1.0 = egyenrangú). */
  prioritas_sajat_vs_ber: 1.0,
  /** Napi vezetési keret, perc (9 óra). */
  sofor_napi_vezetes_max_perc: 540,
  /** Ennyi vezetés után kötelező szünet, perc (4,5 óra). */
  szunet_utan_perc: 270,
} as const;

export type FuvarBeallitasKulcs = keyof typeof FUVAR_BEALLITAS_ALAP;
export type FuvarBeallitasok = { -readonly [K in FuvarBeallitasKulcs]: number };

export const FUVAR_BEALLITAS_KULCSOK = Object.keys(FUVAR_BEALLITAS_ALAP) as FuvarBeallitasKulcs[];

/** Az alapértékek egy módosítható másolata. */
export function alapFuvarBeallitasok(): FuvarBeallitasok {
  return { ...FUVAR_BEALLITAS_ALAP };
}

/**
 * Az adatbázis-sorok (kulcsonként a legutolsó érvényes) összefésülése az
 * alapértékekkel. Ismeretlen kulcs, nem szám vagy negatív érték → az alapérték
 * marad (egy elrontott sor ne vigye nullára vagy NaN-ra a kalkulációt).
 * A JSON-érték lehet szám (28), számot tartalmazó szöveg ("28") vagy
 * {"ertek": 28} alakú objektum.
 */
export function fuvarBeallitasokSorokbol(sorok: { kulcs: string; ertek: unknown }[]): FuvarBeallitasok {
  const ki = alapFuvarBeallitasok();
  for (const s of sorok) {
    if (!(s.kulcs in FUVAR_BEALLITAS_ALAP)) continue;
    const nyers =
      s.ertek !== null && typeof s.ertek === "object" && "ertek" in (s.ertek as Record<string, unknown>)
        ? (s.ertek as Record<string, unknown>).ertek
        : s.ertek;
    const szam = typeof nyers === "number" ? nyers : typeof nyers === "string" && nyers.trim() !== "" ? Number(nyers) : NaN;
    if (Number.isFinite(szam) && szam >= 0) ki[s.kulcs as FuvarBeallitasKulcs] = szam;
  }
  return ki;
}
