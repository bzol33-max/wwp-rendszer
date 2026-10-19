// Település → koordináta, folyamaton belüli tár a napi sorrend közelség-
// alapú láncolásához (napi-sorrend.ts). Szándékosan tiszta, szinkron modul:
// a napiSorrend szinkron és tesztből is hívják; a tárat a szerveroldali
// betöltők töltik fel előre (varos-pont.ts → melegitVarosPontokat). Üres tár
// mellett a sorrend a régi, pontos városegyezéses láncolásra esik vissza.

import { varosNev } from "@/lib/fuvarozas/varos";

export type VarosPont = { lat: number; lon: number };

/**
 * Egy megálló címének települése a tár kulcsához. A varosNev a telepnevet
 * tartalmazó címnél („Dunakeszi, Solinwest Telep, Tőzegtavi út 9.”) a teljes
 * szöveget adja vissza — ilyenkor az első vessző előtti rész a település
 * (2026-10-19: emiatt maradt el Gergő 10.20-i közelségi sorrendje).
 */
export function megalloTelepules(cim: string): string {
  const v = (varosNev(cim) || cim).trim();
  return v.includes(",") ? v.split(",")[0].trim() : v;
}

const tar = new Map<string, VarosPont | null>();

export function varosPontKulcs(varos: string): string {
  return varos.trim().toLowerCase();
}

export function varosPontTarbol(varos: string): VarosPont | null | undefined {
  return tar.get(varosPontKulcs(varos));
}

export function varosPontTarba(varos: string, pont: VarosPont | null): void {
  tar.set(varosPontKulcs(varos), pont);
}

/** Légvonalbeli távolság km-ben (haversine). */
export function legvonalKm(a: VarosPont, b: VarosPont): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
