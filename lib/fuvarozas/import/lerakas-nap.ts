// A lerakás napjának eldöntése az importnál.
//
// 2026-10-06: az Endo-Star Kft. .xls megbízásain (#300/#301, Nyírjákó →
// Ravazd) csak a "Rakodás" dátuma állt, a lerakónál pedig annyi, hogy
// "Fogadási időpont: Hétfő-Péntek 6.00-15.30". A nyelvi modell a régi
// utasítás szerint ("lerakasDatum CSAK ha eltér, egyébként null") nullt
// adott, és az import csendben aznapi lerakásnak vette — a Ma oldalon
// mindkét autó aznapra került, holnapra semmi, az ETA értelmetlen lett.
//
// Ezért KÜLÖN kezeljük a "meg van adva, és aznap" és a "nincs megadva"
// esetet. Ha nincs megadva: javaslatot teszünk (egyszerű, determinisztikus
// szabály), de a sor ellenőrzésre megy, ember hagyja jóvá.
//
// NEM "use server" fájl — tiszta függvények, tesztből is hívható
// (scripts/teszt-lerakas-nap.ts).

import { kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";

/** Efölött (becsült közúti km) a lerakás jellemzően másnap van. */
export const MASNAPI_TAVOLSAG_KM = 250;
/** Ha a felrakás időablaka ennél (óra) később ér véget, a lerakás másnapra csúszik. */
export const MASNAPI_FELRAKAS_ORA = 12;

export const LERAKAS_NAP_HIANYZIK = "Lerakás napja nincs a megbízáson";

export type LerakasNapBemenet = {
  /** ISO nap (ÉÉÉÉ-HH-NN). */
  felrakasDatum: string;
  /** Amit a kiolvasás a lerakás napjának adott (lehet a felrakással azonos). */
  lerakasDatum: string | null;
  /** Igaz, ha a megbízás KIFEJEZETTEN megadja a lerakás napját (dátummal vagy "aznap"-pal). */
  megadva: boolean;
  /** Becsült közúti távolság felrakó → lerakó, ha ismert. */
  tavKm: number | null;
  /** A (legutolsó) felrakó időablakának szövege, pl. "14:00-15:00". */
  felrakasIdo: string | null;
};

export type LerakasNapDontes = {
  /** Mentendő lerakás_datum — null, ha a felrakás napján van (a közös konvenció szerint). */
  lerakasDatum: string | null;
  /** Ha nem null: ember nézze át (ellenőrzésre vár), ez a kifogás szövege. */
  kifogas: string | null;
};

/**
 * Az időablak-szöveg legkésőbbi órája tizedes órában ("14:00-15:30" → 15.5,
 * "15.00-ig" → 15, "8-20" → 20). Ha nincs benne értelmezhető idő, null.
 */
export function idoablakVege(ido: string | null | undefined): number | null {
  if (!ido) return null;
  const orak: number[] = [];
  // ÓÓ:PP / ÓÓ.PP ("14:00", "15.30").
  for (const m of ido.matchAll(/(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/g)) {
    if (Number(m[1]) <= 24 && Number(m[2]) <= 59) orak.push(Number(m[1]) + Number(m[2]) / 60);
  }
  // Ha nincs perces alak: puszta óra tartományban vagy "-ig"/"óra" mellett ("8-20", "15-ig", "15 órás").
  if (orak.length === 0) {
    for (const m of ido.matchAll(/(?<![\d.:])(\d{1,2})(?![\d.:])(?=\s*(?:-|–|ig|ór|h\b))|(?<=(?:-|–)\s*)(\d{1,2})(?![\d.:])/giu)) {
      const ora = Number(m[1] ?? m[2]);
      if (ora <= 24) orak.push(ora);
    }
  }
  return orak.length > 0 ? Math.max(...orak) : null;
}

function honapNap(iso: string): string {
  const [, h, n] = iso.split("-");
  return `${Number(h)}. ${Number(n)}.`;
}

/**
 * Eldönti a mentendő lerakási napot. Ha a megbízás megadja, azt használja
 * (és nincs kifogás); ha nem, javasol egyet:
 *  - becsült távolság > MASNAPI_TAVOLSAG_KM, VAGY
 *  - a felrakás időablaka MASNAPI_FELRAKAS_ORA után ér véget
 *  → következő munkanap; egyébként a felrakás napja. Mindkét esetben kifogás.
 */
export function dontsLerakasNapot(b: LerakasNapBemenet): LerakasNapDontes {
  if (b.megadva) {
    const nap = b.lerakasDatum && b.lerakasDatum !== b.felrakasDatum ? b.lerakasDatum : null;
    return { lerakasDatum: nap, kifogas: null };
  }

  const okok: string[] = [];
  if (b.tavKm != null && b.tavKm > MASNAPI_TAVOLSAG_KM) okok.push(`~${b.tavKm} km az út`);
  const vege = idoablakVege(b.felrakasIdo);
  if (vege != null && vege > MASNAPI_FELRAKAS_ORA) okok.push(`a felrakás ${b.felrakasIdo} között van`);

  if (okok.length > 0) {
    const javasolt = kovetkezoMunkanapISO(b.felrakasDatum);
    return {
      lerakasDatum: javasolt,
      kifogas: `${LERAKAS_NAP_HIANYZIK} — javasolt: ${honapNap(javasolt)} (következő munkanap, mert ${okok.join(" és ")}). Ellenőrizd!`,
    };
  }
  const indok = b.tavKm == null && vege == null ? "távolság és felrakási idő nem ismert" : "rövid út, korai felrakás";
  return {
    lerakasDatum: null,
    kifogas: `${LERAKAS_NAP_HIANYZIK} — a felrakás napjára (${honapNap(b.felrakasDatum)}) tettük (${indok}). Ellenőrizd!`,
  };
}
