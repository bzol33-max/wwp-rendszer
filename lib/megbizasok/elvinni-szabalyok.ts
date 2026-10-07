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

export function utemezhetoNap(nap: string, legkorabban: string | null) {
  return !legkorabban || nap >= legkorabban;
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
