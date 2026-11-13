// A megálló-terv: a megbízás címeiből és időablakaiból milyen megállók
// keletkezzenek. Tiszta fájl (nincs DB, nincs "use server") — a
// scripts/teszt-modell-szinkron.ts ezt hívja, a modell-szinkron.ts ezt
// használja. Ugyanaz a bontás, mint amit a backfill és a sofor.ts vár.

import { bontsMegallokra } from "@/lib/fuvarozas/varos";
import { ervenyesAblak, helyiNap } from "@/lib/fuvarozas2/ablak-alap";

/**
 * A megálló ablaka a napjához: a „csak dátum” ablak (00:00–00:00) nem ablak,
 * és a más napra eső ablak sem (kézzel átírt nap után a régi ablak nem érvényes —
 * #373, 2026-11-13: a lerakás hétfőről péntekre került).
 */
function ablakNapra(nap: string | null, tol: string | null, ig: string | null): { tol: string | null; ig: string | null } {
  const a = ervenyesAblak(tol, ig);
  if (!nap) return a;
  const n = helyiNap(a.tol ?? a.ig);
  return n && n !== nap ? { tol: null, ig: null } : a;
}

export type MegalloTerv = {
  tipus: "felrako" | "lerako";
  cim: string;
  nap: string | null;
  tol: string | null;
  ig: string | null;
};

/**
 * A megbízás címeiből és időablakaiból a megálló-terv: előbb a felrakók,
 * utána a lerakók (ez a sofor.ts sorrendje). Tiszta függvény — ez a
 * scripts/teszt-modell-szinkron.ts tárgya.
 *
 * A lerakó napja a `lerakas_datum`, ha van; különben a fuvar napja. Az ablak
 * megbízás-szintű: minden felrakó a felrakási, minden lerakó a lerakási
 * ablakot kapja (több megállónál ennél pontosabbat a PDF-ek ma nem adnak).
 */
export function megalloTerv(sor: {
  felrako: string | null;
  lerako: string | null;
  datum_iso: string | null;
  lerakas_datum_iso: string | null;
  felrakas_ablak_tol: string | null;
  felrakas_ablak_ig: string | null;
  lerakas_ablak_tol: string | null;
  lerakas_ablak_ig: string | null;
}): MegalloTerv[] {
  return [
    ...bontsMegallokra(sor.felrako).map((cim) => ({
      tipus: "felrako" as const,
      cim,
      nap: sor.datum_iso,
      ...ablakNapra(sor.datum_iso, sor.felrakas_ablak_tol, sor.felrakas_ablak_ig),
    })),
    ...bontsMegallokra(sor.lerako).map((cim) => ({
      tipus: "lerako" as const,
      cim,
      nap: sor.lerakas_datum_iso ?? sor.datum_iso,
      ...ablakNapra(sor.lerakas_datum_iso ?? sor.datum_iso, sor.lerakas_ablak_tol, sor.lerakas_ablak_ig),
    })),
  ];
}
