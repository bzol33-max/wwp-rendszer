// Mező-szintű változásnapló (fuvar_valtozas, 032-es migráció) — tiszta rész.
// A megbízás-szerkesztés ezekből a mezőkből naplóz (a menet sorrendjét és
// költségét ezek befolyásolják): kocsi, felrakás/lerakás napja, felrakó,
// lerakó, fuvardíj.

import type { Querier } from "@/lib/db";

/** A naplózott megbízás-mezők: a szerkesztő kulcsa → az oszlop neve. */
export const NAPLOZOTT_MEZOK = {
  jarmu: "jarmu",
  datum: "datum",
  lerakasDatum: "lerakas_datum",
  felrako: "felrako",
  lerako: "lerako",
  fuvardij: "fuvardij",
} as const;

export type ValtozasSor = { mezo: string; regi: string | null; uj: string | null };

const szoveg = (x: unknown) => {
  const s = x == null ? "" : String(x).trim();
  return s === "" ? null : s;
};

/** A változott naplózott mezők (régi → új), a nem naplózottakat kihagyva. */
export function naplozandoValtozasok(regi: Record<string, unknown>, uj: Record<string, unknown>): ValtozasSor[] {
  const ki: ValtozasSor[] = [];
  for (const [kulcs, oszlop] of Object.entries(NAPLOZOTT_MEZOK)) {
    const r = szoveg(regi[kulcs]);
    const u = szoveg(uj[kulcs]);
    if (r !== u) ki.push({ mezo: oszlop, regi: r, uj: u });
  }
  return ki;
}

/** A sorok írása (a hívó tranzakciójában). */
export async function irValtozasokat(tx: Querier, tabla: string, sorId: string, sorok: ValtozasSor[], ki: string | null, ok: string | null = null): Promise<void> {
  for (const s of sorok) {
    await tx(
      `insert into fuvar_valtozas (tabla, sor_id, mezo, regi, uj, ki, ok) values ($1, $2, $3, $4, $5, $6, $7)`,
      [tabla, sorId, s.mezo, s.regi, s.uj, ki, ok]
    );
  }
}
