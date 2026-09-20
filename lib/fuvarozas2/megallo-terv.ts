// A megálló-terv: a megbízás címeiből és időablakaiból milyen megállók
// keletkezzenek. Tiszta fájl (nincs DB, nincs "use server") — a
// scripts/teszt-modell-szinkron.ts ezt hívja, a modell-szinkron.ts ezt
// használja. Ugyanaz a bontás, mint amit a backfill és a sofor.ts vár.

import { bontsMegallokra } from "@/lib/fuvarozas/varos";

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
      tol: sor.felrakas_ablak_tol,
      ig: sor.felrakas_ablak_ig,
    })),
    ...bontsMegallokra(sor.lerako).map((cim) => ({
      tipus: "lerako" as const,
      cim,
      nap: sor.lerakas_datum_iso ?? sor.datum_iso,
      tol: sor.lerakas_ablak_tol,
      ig: sor.lerakas_ablak_ig,
    })),
  ];
}
