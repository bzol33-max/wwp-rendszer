// Tervezés · A hét (az új terv 2. oldala, 2026-10-11) — tiszta számolás:
// kocsinként a hét fuvarjai, a köztük lévő üres utak („rések”), a szabad
// napok; egy beérkezett ajánlat mennyit tesz hozzá egy réshez; kiket érdemes
// hívni a saját múltból. Légvonal × 1,3 (KOZUTI_SZORZO) — becslés, a
// Kalkulátor számol pontosan (HU-GO). Teszt: scripts/teszt-tervezes-het.ts.

import { celar, legvonalKm, type Pont } from "@/lib/fuvarozas2/tervezo-alap";

export const RES_MIN_KM = 100;
export const ATLAG_KMH = 60;

export type HetiFuvar = {
  id: string;
  cim: string;
  felVaros: string;
  leVaros: string;
  fel: Pont | null;
  le: Pont | null;
  felNap: string;
  leNap: string;
  sajat: boolean;
};

export type Res = {
  kulcs: string;
  kocsi: string;
  sofor: string;
  nap: string;
  honnan: string;
  hova: string;
  a: Pont;
  b: Pont;
  km: number;
  ft: number;
  haza: boolean;
};

export type HetiKocsi = { kod: string; sofor: string; fuvarok: HetiFuvar[]; elozoVeg: { pont: Pont; varos: string } | null };

export type NapCella = { nap: string; fuvarok: HetiFuvar[]; resek: Res[]; szabad: boolean };

export function utKm(a: Pont, b: Pont): number {
  return Math.round(legvonalKm(a, b));
}

/** Kocsinként a hét rései (üres út ≥ 100 km) és napcellái. */
export function hetiReszek(k: HetiKocsi, napok: string[], telephely: { pont: Pont; varos: string }, kmKoltseg: number): { cellak: NapCella[]; resek: Res[] } {
  const elso = napok[0], utolso = napok[napok.length - 1];
  const heti = k.fuvarok.filter((f) => f.felNap <= utolso && f.leNap >= elso).sort((x, y) => x.felNap.localeCompare(y.felNap) || x.leNap.localeCompare(y.leNap));
  const resek: Res[] = [];
  // Ahol a kocsi áll; null, ha egy fuvar lerakójának nincs koordinátája (onnan nem becsülünk).
  let hol: { pont: Pont; varos: string } | null = k.elozoVeg ?? telephely;
  let holNap = elso;
  for (const f of heti) {
    if (f.fel && hol) {
      const km = utKm(hol.pont, f.fel);
      if (km >= RES_MIN_KM) {
        const nap = f.felNap < elso ? elso : f.felNap;
        resek.push({ kulcs: `${k.kod}:${resek.length}`, kocsi: k.kod, sofor: k.sofor, nap, honnan: hol.varos, hova: f.felVaros, a: hol.pont, b: f.fel, km, ft: Math.round(km * kmKoltseg), haza: false });
      }
    }
    hol = f.le ? { pont: f.le, varos: f.leVaros } : null;
    holNap = f.leNap;
  }
  if (heti.length && hol) {
    const km = utKm(hol.pont, telephely.pont);
    if (km >= RES_MIN_KM && holNap <= utolso) {
      resek.push({ kulcs: `${k.kod}:${resek.length}`, kocsi: k.kod, sofor: k.sofor, nap: holNap < elso ? elso : holNap, honnan: hol.varos, hova: telephely.varos, a: hol.pont, b: telephely.pont, km, ft: Math.round(km * kmKoltseg), haza: true });
    }
  }
  const cellak = napok.map((nap) => {
    const fuvarok = heti.filter((f) => f.felNap <= nap && f.leNap >= nap);
    const r = resek.filter((x) => x.nap === nap);
    return { nap, fuvarok, resek: r, szabad: fuvarok.length === 0 && r.length === 0 };
  });
  return { cellak, resek };
}

export type AjanlatHely = { varos: string; pont: Pont | null; nap: string | null };

export type Illeszkedes = {
  res: Res;
  plusKm: number;
  plusPerc: number;
  tobbletFt: number;
  rakottKm: number;
  minFt: number;
  kerjFt: number;
  draga: boolean;
};

const napKul = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/**
 * Egy ajánlat (felrakó F, lerakó L) beillesztése egy résbe (A → B):
 * +km = A→F + F→L + L→B − A→B. Csak ha a felrakás napja a rés napjától
 * legfeljebb 1 napra van (vagy ismeretlen), és a kerülő ≤ 250 km.
 */
export function illeszt(res: Res, fel: AjanlatHely, le: AjanlatHely, p: { kmKoltseg: number; oraFt: number; ftKmElozmeny: number | null }): Illeszkedes | null {
  if (!fel.pont || !le.pont) return null;
  if (fel.nap && Math.abs(napKul(res.nap, fel.nap)) > 1) return null;
  const rakottKm = utKm(fel.pont, le.pont);
  const plusKm = Math.max(0, utKm(res.a, fel.pont) + rakottKm + utKm(le.pont, res.b) - res.km);
  if (plusKm > 250) return null;
  const plusPerc = Math.round((plusKm / ATLAG_KMH) * 60) + 60; // + 1 óra fel- és lerakás
  const tobbletFt = Math.round(plusKm * p.kmKoltseg + (plusPerc / 60) * p.oraFt);
  const minFt = celar(tobbletFt);
  const elozmeny = p.ftKmElozmeny != null ? Math.ceil((p.ftKmElozmeny * rakottKm) / 5000) * 5000 : 0;
  const kerjFt = Math.max(minFt, elozmeny, Math.ceil((minFt * 1.15) / 5000) * 5000);
  return { res, plusKm, plusPerc, tobbletFt, rakottKm, minFt, kerjFt, draga: plusKm > 100 };
}

/** A legkisebb többletű rés egy ajánlathoz. */
export function legjobbRes(resek: Res[], fel: AjanlatHely, le: AjanlatHely, p: { kmKoltseg: number; oraFt: number; ftKmElozmeny: number | null }): Illeszkedes | null {
  let best: Illeszkedes | null = null;
  for (const r of resek) {
    const i = illeszt(r, fel, le, p);
    if (i && (!best || i.tobbletFt < best.tobbletFt)) best = i;
  }
  return best;
}

export type MultFuvar = { partner: string; fel: Pont | null; felVaros: string; leVaros: string; nap: string; dijFt: number | null };
export type HivandoPartner = { partner: string; db: number; utolsoUt: string; utolsoNap: string; utolsoDijFt: number | null; tavKm: number };

/** Kiket hívj: akik a rés kezdőpontjától ≤ 50 km-re rakattak fel nálunk, legalább kétszer. */
export function kiketHivj(res: Res, mult: MultFuvar[], maxKm = 50): HivandoPartner[] {
  const m = new Map<string, { sorok: MultFuvar[]; tav: number }>();
  for (const f of mult) {
    if (!f.fel) continue;
    const tav = utKm(res.a, f.fel);
    if (tav > maxKm) continue;
    const x = m.get(f.partner) ?? { sorok: [], tav };
    x.sorok.push(f);
    x.tav = Math.min(x.tav, tav);
    m.set(f.partner, x);
  }
  return [...m.entries()]
    .filter(([, x]) => x.sorok.length >= 2)
    .map(([partner, x]) => {
      const u = [...x.sorok].sort((a, b) => b.nap.localeCompare(a.nap))[0];
      return { partner, db: x.sorok.length, utolsoUt: `${u.felVaros} → ${u.leVaros}`, utolsoNap: u.nap, utolsoDijFt: u.dijFt, tavKm: x.tav };
    })
    .sort((a, b) => b.db - a.db || a.tavKm - b.tavKm)
    .slice(0, 6);
}

/** A tervezett hét: hétköznap az aktuális hét hétfőjétől, vasárnap a következő hétfőtől; hétfő–szombat. */
export function tervHetNapjai(ma: string): string[] {
  const d = new Date(`${ma}T12:00:00Z`);
  const nap = d.getUTCDay();
  const hetfoEltolas = nap === 0 ? 1 : -(nap - 1);
  d.setUTCDate(d.getUTCDate() + hetfoEltolas);
  const ki: string[] = [];
  for (let i = 0; i < 6; i++) {
    ki.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ki;
}
