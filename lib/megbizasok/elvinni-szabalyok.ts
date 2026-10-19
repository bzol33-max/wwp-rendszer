type ElvinniJelolo = {
  jelleg: string;
  idopont_nyitott?: boolean;
  elokeszites?: boolean;
  torolt?: boolean;
};

export function elvinniOszlop(s: ElvinniJelolo) {
  return s.jelleg === "sajat" && s.elokeszites === true && s.idopont_nyitott === true && !s.torolt;
}

export function beerkElokeszitesOszlopba(s: ElvinniJelolo & { szakasz: string }) {
  if (s.idopont_nyitott) return false;
  return s.szakasz === "beerkezett" || s.szakasz === "elokeszites";
}

/**
 * Saját fuvar napja: se a legkorábbi nap, se a mai (budapesti) nap előtt.
 * Múltbeli napra tett saját fuvart a régi követő trigger azonnal teljesítettnek
 * vette (029, 2026-10-10) — ezért a múlt nap tilos.
 */
export function utemezhetoNap(nap: string, legkorabban: string | null, ma: string) {
  return nap >= ma && (!legkorabban || nap >= legkorabban);
}

export function hetKezdeteElvinni(legkorabban: string | null, ma: string) {
  const kezdoNap = legkorabban && legkorabban > ma ? legkorabban : ma;
  const datum = new Date(`${kezdoNap}T12:00:00Z`);
  const eltolodas = (datum.getUTCDay() + 6) % 7;
  datum.setUTCDate(datum.getUTCDate() - eltolodas);
  return datum.toISOString().slice(0, 10);
}

export function tavolsagElvinniKm(
  a: { lat: number; lon: number } | null,
  b: { lat: number; lon: number } | null
): number | null {
  if (!a || !b) return null;
  const fok = Math.PI / 180;
  const dLat = (b.lat - a.lat) * fok;
  const dLon = (b.lon - a.lon) * fok;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * fok) * Math.cos(b.lat * fok) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(x)) * 1.3);
}

export function elvinniCellaKm({
  foglalt,
  utolsoLerakoPont,
  allohelyPont,
  felrakoPont,
}: {
  foglalt: boolean;
  utolsoLerakoPont: { lat: number; lon: number } | null;
  allohelyPont: { lat: number; lon: number } | null;
  felrakoPont: { lat: number; lon: number } | null;
}) {
  const kiindulopont = foglalt ? utolsoLerakoPont : allohelyPont;
  return tavolsagElvinniKm(kiindulopont, felrakoPont);
}

export type ElvinniSurgosseg = "rendben" | "sarga" | "piros";

/** Munkanapok (h–p) száma ma után a határidőig, a határidő napját is beleértve; múltbeli határidőnél negatív. */
export function munkanapHatridoig(legkesobb: string, ma: string): number {
  if (legkesobb < ma) return -1;
  let n = 0;
  const d = new Date(`${ma}T12:00:00Z`);
  while (d.toISOString().slice(0, 10) < legkesobb) {
    d.setUTCDate(d.getUTCDate() + 1);
    const hn = d.getUTCDay();
    if (hn !== 0 && hn !== 6) n++;
  }
  return n;
}

/**
 * Rugalmas saját fuvar sürgőssége (2026-10-19): a határidő előtti 3 munkanapon
 * sárga, az utolsó munkanapon (és lejárat után) piros — ekkor a tervező már
 * kerülővel is a legjobb kocsira ajánlja. Határidő nélkül: rendben.
 */
export function elvinniSurgosseg(legkesobb: string | null, ma: string): ElvinniSurgosseg {
  if (!legkesobb) return "rendben";
  const n = munkanapHatridoig(legkesobb, ma);
  if (n <= 1) return "piros";
  if (n <= 3) return "sarga";
  return "rendben";
}
