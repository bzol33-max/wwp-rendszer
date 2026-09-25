// Számlázz.hu-s szállítólevél ↔ saját fuvar párosítás — a döntés, adatbázis
// nélkül (scripts/teszt-szallitolevel-parositas.ts).
//
// Budaházi Zoltán, 2026-09-25: a szállítólevelet előre állítják ki; a
// párosítás a vevő + a rendszám + a fuvar általa beállított dátuma szerint
// megy (a szállítólevél dátuma néhány nappal eltérhet). Csak egyértelmű
// (egy fuvar ↔ egy szállítólevél) találatot párosít.

import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";
import { partnerEgyezik } from "@/lib/fuvarozas/szamla-parositas";

export type SzlFuvar = {
  id: string;
  /** A fuvar általunk beállított napja (ISO). */
  datum: string;
  /** A kocsi első rendszáma („NMZ-492”) — kocsira adott fuvarnál a jarmu-ból, előkészítésben az elokeszites_jarmu-ból. */
  jarmuRendszam: string | null;
  /** Kinek (megrendelő / partner neve). */
  kinek: string | null;
  /** Hová (a lerakó szövege) — a vevő neve gyakran ebben áll („Fabrika, Tompaládony”). */
  hova: string | null;
};

export type SzlSzallitolevel = { bizonylatszam: string; kelt: string; vevo: string | null; rendszam: string | null };

export const MAX_NAP_ELTERES = 3;

function nap(iso: string): number {
  return Math.round(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 86400000);
}

function szavak(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !["kft", "zrt", "hungary", "magyarorszag", "telephely"].includes(w));
}

/** A szállítólevél vevője ez a fuvar címzettje-e: a cégnév, vagy a vevő első jellemző szava a „kinek”/„hová” szövegben. */
export function vevoEgyezik(vevo: string | null, f: Pick<SzlFuvar, "kinek" | "hova">): boolean {
  if (!vevo) return false;
  if (f.kinek && partnerEgyezik(vevo, [f.kinek])) return true;
  const elso = szavak(vevo)[0];
  if (!elso) return false;
  return [f.kinek, f.hova].some((t) => t && szavak(t).includes(elso));
}

/** A szállítólevél rendszáma ugyanarra a saját kocsira mutat-e, mint a fuvaré. */
export function rendszamEgyezik(rendszam: string | null, jarmuRendszam: string | null): boolean {
  if (!rendszam || !jarmuRendszam) return false;
  const a = findJarmuInSzoveg(rendszam);
  const b = findJarmuInSzoveg(jarmuRendszam);
  return !!a && a === b;
}

export function parositSzallitoleveleket(fuvarok: SzlFuvar[], szallitolevelek: SzlSzallitolevel[]): { fuvarId: string; bizonylatszam: string }[] {
  const parok: { fuvarId: string; bizonylatszam: string }[] = [];
  for (const sz of szallitolevelek) {
    for (const f of fuvarok) {
      if (
        Math.abs(nap(sz.kelt) - nap(f.datum)) <= MAX_NAP_ELTERES &&
        rendszamEgyezik(sz.rendszam, f.jarmuRendszam) &&
        vevoEgyezik(sz.vevo, f)
      ) parok.push({ fuvarId: f.id, bizonylatszam: sz.bizonylatszam });
    }
  }
  const fDb = new Map<string, number>();
  const sDb = new Map<string, number>();
  for (const p of parok) {
    fDb.set(p.fuvarId, (fDb.get(p.fuvarId) ?? 0) + 1);
    sDb.set(p.bizonylatszam, (sDb.get(p.bizonylatszam) ?? 0) + 1);
  }
  return parok.filter((p) => fDb.get(p.fuvarId) === 1 && sDb.get(p.bizonylatszam) === 1);
}
