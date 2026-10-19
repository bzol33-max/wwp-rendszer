// A napi sorrend közelség-alapú láncolásához a települések koordinátái
// (varos-pont-tar.ts). A betöltők (Ma oldal, sofőr-app idővonala, Tervezés
// hét, elvinni-hét) a napiSorrend hívása ELŐTT ezt várják meg. Település-
// szintű geokódolás a meglévő, gyorsítótárazott HU-GO keresővel; címenként
// egyszer, legfeljebb 3 mp várakozással — ha nem jön meg, a sorrend a régi
// szabály szerint áll, a lap nem lassul tovább.

import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { megalloTelepules, varosPontTarba, varosPontTarbol } from "@/lib/fuvarozas2/varos-pont-tar";

function telepulesek(cim: string | null | undefined): string[] {
  if (!cim) return [];
  return bontsMegallokra(cim).map((m) => megalloTelepules(m)).filter((v) => v && v.trim().length >= 2);
}

export async function melegitVarosPontokat(cimek: (string | null | undefined)[]): Promise<void> {
  const kell = [...new Set(cimek.flatMap(telepulesek))].filter((v) => varosPontTarbol(v) === undefined).slice(0, 60);
  if (kell.length === 0) return;
  const ido = new Promise<void>((r) => setTimeout(r, 3000));
  const munka = Promise.all(
    kell.map(async (v) => {
      const g = await geokodolCachelve(v).catch(() => null);
      // Hibánál (null) nem írunk a tárba: a következő betöltés újrapróbálja.
      if (g) varosPontTarba(v, { lat: g.lat, lon: g.lon });
    })
  ).then(() => undefined);
  await Promise.race([munka, ido]);
}
