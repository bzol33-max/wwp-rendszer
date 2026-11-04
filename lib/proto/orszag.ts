// Magyarország körvonala (Natural Earth alapú, egyszerűsítve), 640 × 393-as síkra vetítve.

export const ORSZAG_UTVONAL = "M255 370L246 370L218 393L147 381L138 366L113 361L99 333L78 323L71 308L40 287L20 253L22 240L0 237L18 217L38 218L29 190L36 180L32 161L45 160L57 143L50 131L30 126L42 114L57 117L61 124L89 120L94 84L106 76L158 115L241 113L258 105L250 93L258 73L317 68L322 52L332 48L359 62L401 37L418 6L444 0L476 9L503 0L519 11L535 33L581 24L591 46L603 46L614 66L635 68L640 86L617 111L598 108L582 118L573 136L557 148L556 166L548 170L536 202L523 215L527 219L510 245L511 258L492 272L488 294L469 324L445 319L426 340L413 333L391 342L377 335L326 334L300 359L282 354L255 370Z";

const NYUGAT = 16.1118;
const ESZAK = 48.5767;
const KOSZ = Math.cos((47.2 * Math.PI) / 180);
const SKALA = 640 / ((22.8948 - NYUGAT) * KOSZ);

/** Az egyszerűsített határ pár km-t téved, ezért a közvetlen határszél (kb. 7 km) még bentnek számít. */
const HATAR_TURES = 10;

const PONTOK: [number, number][] = ORSZAG_UTVONAL.slice(1, -1).split("L").map((p) => {
  const [x, y] = p.split(" ").map(Number);
  return [x, y];
});

export function vetit(lat: number, lon: number): { x: number; y: number } {
  return { x: (lon - NYUGAT) * KOSZ * SKALA, y: (ESZAK - lat) * SKALA };
}

function szakaszTav(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax, dy = by - ay;
  const h = dx * dx + dy * dy;
  const t = h ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / h)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function orszagbanVan({ x, y }: { x: number; y: number }): boolean {
  let bent = false;
  for (let i = 0, j = PONTOK.length - 1; i < PONTOK.length; j = i++) {
    const a = PONTOK[i], b = PONTOK[j];
    if (szakaszTav(x, y, a, b) <= HATAR_TURES) return true;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) bent = !bent;
  }
  return bent;
}
