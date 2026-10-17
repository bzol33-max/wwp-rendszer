// Ma oldal · N1 kocsikártya (docs/ma-n1-terv.md): a kártya tetején a
// figyelmeztető szalag sorai — tiszta logika, DB nélkül.

import { TAVOLLET_NEV, type TavolletTipus } from "@/lib/fuvarozas2/bejegyzes-alap";

export type KartyaJelzes = { szin: "red" | "amber"; szoveg: string };

export type JelzesBemenet = {
  /** A kocsi aktív (nem nyugtázott) eltérései: badge („késés 35 p”) + hely („Debrecen lerakó”). */
  elteresek: { szin: "red" | "amber"; badge: string; hely: string | null }[];
  vanMaiFuvar: boolean;
  vanHolnapiFuvar: boolean;
  /** A mai fuvar holnap is tart (holnap nem „üres”). */
  holnapFolytatodik: boolean;
  tavolletMa: TavolletTipus | null;
  tavolletHolnap: TavolletTipus | null;
  /** Egész napos bejegyzés (szerviz, műszaki …) — aznap nem hiányzik a fuvar. */
  egeszNaposMa: boolean;
  egeszNaposHolnap: boolean;
  /** Ma pihenőnap (vasárnap / ünnep) — nincs „ma nincs fuvar” jelzés. */
  maPihenonap: boolean;
  holnapCimke: string;
};

/** A szalag sorai súlyosság szerint (piros elöl), a sorrend egyébként a felsorolásé. */
export function kocsiJelzesek(b: JelzesBemenet): KartyaJelzes[] {
  const ki: KartyaJelzes[] = [];
  for (const e of b.elteresek) ki.push({ szin: e.szin, szoveg: e.hely ? `${e.badge} · ${e.hely}` : e.badge });

  const holnap = b.holnapCimke.toLowerCase();
  if (b.tavolletMa) {
    ki.push(b.vanMaiFuvar
      ? { szin: "red", szoveg: `Ma ${TAVOLLET_NEV[b.tavolletMa].toLowerCase()} (Jelenlét) — de van mai fuvar` }
      : { szin: "amber", szoveg: `Ma ${TAVOLLET_NEV[b.tavolletMa].toLowerCase()} (Jelenlét)` });
  } else if (!b.vanMaiFuvar && !b.egeszNaposMa && !b.maPihenonap) {
    ki.push({ szin: "amber", szoveg: "Ma nincs fuvar — keress" });
  }

  if (b.tavolletHolnap) {
    ki.push(b.vanHolnapiFuvar || b.holnapFolytatodik
      ? { szin: "red", szoveg: `${b.holnapCimke} ${TAVOLLET_NEV[b.tavolletHolnap].toLowerCase()} (Jelenlét) — de van fuvar` }
      : { szin: "amber", szoveg: `${b.holnapCimke} ${TAVOLLET_NEV[b.tavolletHolnap].toLowerCase()} (Jelenlét) — ne tervezz` });
  } else if (!b.vanHolnapiFuvar && !b.holnapFolytatodik && !b.egeszNaposHolnap) {
    ki.push({ szin: "amber", szoveg: `${holnap === "holnap" ? "Holnapra" : `${b.holnapCimke}re`} még nincs fuvar` });
  }

  return ki.map((j, i) => ({ j, i })).sort((x, y) => (x.j.szin === y.j.szin ? x.i - y.i : x.j.szin === "red" ? -1 : 1)).map((x) => x.j);
}

/** A tachó-csík kitöltése (0–100): a napi keretből hátralévő idő aránya. */
export function tachoCsik(hatraPerc: number | null | undefined, napiMaxPerc = 540): number | null {
  if (hatraPerc == null || !Number.isFinite(hatraPerc) || napiMaxPerc <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((hatraPerc / napiMaxPerc) * 100)));
}
