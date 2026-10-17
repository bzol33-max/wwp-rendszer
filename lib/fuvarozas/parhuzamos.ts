// Kis, tiszta segédek a párhuzamos külső hívásokhoz (nincs I/O, tsx alatt is tesztelhető).
// Teszt: scripts/teszt-kulso-hivas.ts.

/**
 * Folyamatban lévő hívás megosztása: ha `kulcs`-ra már fut egy ígéret a `tar`-ban, azt
 * adja vissza; különben elindítja `fn`-t, eltárolja, és lezárultakor (siker VAGY hiba)
 * törli — hibát tehát nem jegyez meg, a következő hívás újra próbál.
 */
export function megosztva<T>(tar: Map<string, Promise<unknown>>, kulcs: string, fn: () => Promise<T>): Promise<T> {
  const futo = tar.get(kulcs);
  if (futo) return futo as Promise<T>;
  const p = (async () => fn())(); // a szinkron dobás is elutasítás legyen
  tar.set(kulcs, p);
  const torol = () => { if (tar.get(kulcs) === p) tar.delete(kulcs); };
  p.then(torol, torol);
  return p;
}

/** Korlátozott párhuzamosság: legfeljebb `egyszerre` feladat fut; az eredmény a bemenet sorrendjében. */
export async function korlatozottan<T>(feladatok: (() => Promise<T>)[], egyszerre: number): Promise<T[]> {
  const ki: T[] = new Array(feladatok.length);
  let i = 0;
  const n = Math.max(1, Math.min(egyszerre, feladatok.length));
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < feladatok.length) { const j = i++; ki[j] = await feladatok[j](); }
  }));
  return ki;
}
