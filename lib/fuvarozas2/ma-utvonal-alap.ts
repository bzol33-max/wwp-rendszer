// A Ma oldal útvonal-rajzolásának tiszta része (lásd ma-utvonal.ts). Teszt: scripts/teszt-ma-utvonal.ts.

type LatLon = [number, number];

export type Szakasz = { a: LatLon; b: LatLon; hosszu: boolean };

/** Légvonal km (haversine). */
export function legvonalKm(a: LatLon, b: LatLon): number {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A nyomvonal szakaszai; csak a `minKm`-nél hosszabbakat érdemes úthálózatra illeszteni. */
export function szakaszokbol(nyomvonal: LatLon[], minKm = 3): Szakasz[] {
  const ki: Szakasz[] = [];
  for (let i = 1; i < nyomvonal.length; i++) {
    const a = nyomvonal[i - 1], b = nyomvonal[i];
    ki.push({ a, b, hosszu: legvonalKm(a, b) >= minKm });
  }
  return ki;
}

/**
 * Az illesztett nyomvonal: szakaszonként az úthálózati geometria (ha van),
 * különben az egyenes. A pontok sorrendje és a végpontok megmaradnak.
 */
export function illesztSzakaszokat(nyomvonal: LatLon[], geok: (LatLon[] | null)[]): LatLon[] {
  if (nyomvonal.length < 2) return nyomvonal;
  const ki: LatLon[] = [nyomvonal[0]];
  for (let i = 1; i < nyomvonal.length; i++) {
    const g = geok[i - 1];
    if (g && g.length >= 2) ki.push(...g);
    ki.push(nyomvonal[i]);
  }
  return ki;
}

/** A hátralévő út kiindulópontja ~2 km-es rácsra kerekítve (a cache ne ürüljön minden percben). */
export function kerekitettPont(lat: number, lon: number): LatLon {
  return [Math.round(lat * 50) / 50, Math.round(lon * 50) / 50];
}
