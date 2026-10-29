// Fuvarozás · Ma + hét egy lapon (redesign 5, U2c terv) — tiszta segédek, DB és
// I/O nélkül. A kocsi-oszlop fejlécének állapot-pirulája, a „bajban van” jelölés
// és az iroda-sor szűrése a MEGLÉVŐ Ma-vászon adatából; új adatot nem talál ki.
// Teszt: scripts/teszt-ma-het.ts.

import type { Elteres, MaKocsi } from "@/lib/fuvarozas2/ma-vaszon";
import { TAVOLLET_NEV } from "@/lib/fuvarozas2/bejegyzes-alap";

/** Ennyi perc napi vezetési idő alatt a kocsi „kevés tachóval” van (az oszlop piros keretet kap). */
export const KEVES_TACHO_PERC = 60;

/** Az iroda-sor címkéje csak nem nulla számlálóval jelenik meg („0”, „—”, „0 Ft” kimarad). */
export const nemNulla = (ertek: string): boolean => /[1-9]/.test(ertek);

export type PirulaSzin = "kek" | "piros" | "narancs" | "szurke";
export type Pirula = { szoveg: string; szin: PirulaSzin; felkialto: boolean };

const percSzoveg = (badge: string): string | null => badge.match(/(\d+)\s*p/)?.[1] ?? null;

/** A kocsi eltérései (a Ma-vászon `elteresek` listájából, a kocsi kódja szerint). */
export function kocsiElteresei(elteresek: Elteres[], kod: string | null): Elteres[] {
  return kod ? elteresek.filter((e) => e.kocsiKod === kod) : [];
}

/** GPS-gond: nincs jel vagy elavult — ilyenkor (és csak ilyenkor) kerül ki a GPS-sor. */
export function gpsGond(k: Pick<MaKocsi, "allapot">): string | null {
  const a = k.allapot;
  if (!a || a.szin !== "amber") return null;
  return /GPS|nincs/i.test(a.szoveg) ? a.szoveg : null;
}

/** Állapot-pirula: Úton kék · Várakozik/Késik piros + „!” · Áll narancs · Távollét szürke. */
export function allapotPirula(k: Pick<MaKocsi, "allapot" | "tavolletMa">, elteresek: Elteres[]): Pirula | null {
  if (k.tavolletMa) return { szoveg: TAVOLLET_NEV[k.tavolletMa], szin: "szurke", felkialto: false };
  const vár = elteresek.find((e) => /^várakozik/i.test(e.badge));
  if (vár) {
    const p = percSzoveg(vár.badge);
    return { szoveg: p ? `Várakozik ${p} perce` : "Várakozik", szin: "piros", felkialto: true };
  }
  const kesik = elteresek.find((e) => /^késés|^késik/i.test(e.badge));
  if (kesik) {
    const p = percSzoveg(kesik.badge);
    return { szoveg: p ? `Késik ${p} percet` : "Késik", szin: "piros", felkialto: true };
  }
  const a = k.allapot;
  if (!a || gpsGond(k)) return null;
  if (a.szin === "mint") return { szoveg: "Úton", szin: "kek", felkialto: false };
  if (/^áll/i.test(a.szoveg)) return { szoveg: "Áll", szin: "narancs", felkialto: false };
  return null;
}

/** Bajban van-e a kocsi: várakozik/késik (piros eltérés) vagy kevés a napi tachó. */
export function kocsiBajban(k: Pick<MaKocsi, "tachoNapiHatraPerc">, elteresek: Elteres[]): boolean {
  if (elteresek.some((e) => e.szin === "red")) return true;
  return k.tachoNapiHatraPerc != null && k.tachoNapiHatraPerc < KEVES_TACHO_PERC;
}

/** „2:40” — percből óra:perc. */
export function oraPerc(perc: number): string {
  const p = Math.max(0, Math.round(perc));
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, "0")}`;
}

/** Ezer forintra tagolt Ft („727 000 Ft”). */
export const ftSzoveg = (x: number): string => `${Math.round(x).toLocaleString("hu-HU")} Ft`;

/** „Kedd · okt. 27.” — a napok szakaszcíme a kocsi-oszlopban. */
const NAP_HOSSZU = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];
const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
export function napSzakaszCim(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${NAP_HOSSZU[d.getUTCDay()]} · ${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}.`;
}
export const napNevHosszu = (iso: string): string => NAP_HOSSZU[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** A fejléc „{nap}, {dátum} · {idő}” sora. */
export function fejlecIdo(ma: string, ido: string): string {
  const d = new Date(`${ma}T12:00:00Z`);
  return `${NAP_HOSSZU[d.getUTCDay()].toLowerCase()}, ${d.getUTCFullYear()}. ${HONAP_ROVID[d.getUTCMonth()]} ${d.getUTCDate()}. · ${ido}`;
}
