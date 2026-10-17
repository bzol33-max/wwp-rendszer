// Külső hívások sorosítása, újrapróbálása és tartós gyorsítótárazása
// (az ellenőrzés T1 / T3 / T13 / T16 tételei).
//
// Három dolgot old meg, szolgáltatónként külön:
//   1. SOROSÍTÁS — egy szolgáltatóhoz egyszerre egy kérés megy ki, két kérés
//      közt kötelező minimális szünettel. A Nominatim használati feltétele
//      kifejezetten 1 kérés/másodperc; a HU-GO kalkulátornak nincs kiírt
//      korlátja, de kulcs nélküli, dokumentálatlan végpont — nem illik (és
//      nem is biztonságos) percenként ezrével hívni.
//   2. ÚJRAPRÓBÁLÁS — 429 és 5xx esetén exponenciálisan növekvő várakozással,
//      legfeljebb háromszor. Ami ezután is hibázik, az valódi hiba.
//   3. TARTÓS CACHE — az eredmény az adatbázisban (kulso_valasz_cache), tehát
//      a folyamatok és az instance-ok közt közös, és túléli az újraindítást.
//      A kulcs MINDEN paramétert tartalmaz, így két különböző kérés soha nem
//      oszthat egy soron.
//
// A cache csak akkor ír, ha a hívás sikeres volt: hibát sosem cache-elünk.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { megosztva } from "./parhuzamos";

/** Szolgáltatónkénti minimális szünet két kimenő kérés között (ms). */
const SZUNET_MS: Record<string, number> = {
  hugo: 300,
  nominatim: 1100,
};

const sorok = new Map<string, Promise<unknown>>();
const utolsoHivas = new Map<string, number>();

function varj(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// HÁTTÉR-SOR (2026-10-10): az óránkénti kör (menetterv, optimalizáló,
// kalkulációk) HU-GO hívásai külön, alacsonyabb prioritású sorba kerülnek
// ("hugo:hatter"), hogy a GPS-lap / Kalkulátor / geokódolás interaktív
// hívásai ne álljanak mögéjük. A háttér-hívás kivárja, amíg az interaktív sor
// kiürül (legfeljebb HATTER_ELENGEDES_MS-ig), és két háttér-hívás közt
// kétszeres szünetet tart. Jelölés: hatterHivasban(fn) — AsyncLocalStorage,
// így a hívási lánc mélyén (calculateToll) sem kell paramétert átadni.
const hatter = new AsyncLocalStorage<true>();
export const HATTER_UTOTAG = ":hatter";
/** Ennyit vár legfeljebb a háttér-hívás az interaktív sor kiürülésére (ms). */
const HATTER_ELENGEDES_MS = 15_000;
const fuggoInteraktiv = new Map<string, number>();

/** Az `fn`-ben indított külső hívások a háttér-sorba mennek (lásd fent). */
export function hatterHivasban<T>(fn: () => Promise<T>): Promise<T> {
  return hatter.run(true, fn);
}

/** Melyik sorba megy egy hívás: a szolgáltató sora, háttérben a ":hatter" párja. */
export function sorKulcs(szolgaltato: string): string {
  return hatter.getStore() ? `${szolgaltato}${HATTER_UTOTAG}` : szolgaltato;
}

/**
 * A `fn`-t úgy futtatja, hogy az adott szolgáltatóhoz (soronként) egyszerre
 * csak egy kérés legyen kint, és két kérés közt elteljen a kötelező szünet.
 * Háttérben (hatterHivasban) a külön háttér-sorba áll, és elengedi az
 * interaktív hívásokat maga előtt.
 */
export async function sorbaAllit<T>(szolgaltato: string, fn: () => Promise<T>): Promise<T> {
  const hatterben = !!hatter.getStore();
  const kulcs = sorKulcs(szolgaltato);
  const elozo = sorok.get(kulcs) ?? Promise.resolve();
  const szunet = (SZUNET_MS[szolgaltato] ?? 200) * (hatterben ? 2 : 1);
  if (!hatterben) fuggoInteraktiv.set(szolgaltato, (fuggoInteraktiv.get(szolgaltato) ?? 0) + 1);
  const futas = elozo.then(async () => {
    if (hatterben) {
      const kezd = Date.now();
      while ((fuggoInteraktiv.get(szolgaltato) ?? 0) > 0 && Date.now() - kezd < HATTER_ELENGEDES_MS) await varj(100);
    }
    const eltelt = Date.now() - (utolsoHivas.get(kulcs) ?? 0);
    if (eltelt < szunet) await varj(szunet - eltelt);
    try {
      return await fn();
    } finally {
      utolsoHivas.set(kulcs, Date.now());
      if (!hatterben) fuggoInteraktiv.set(szolgaltato, Math.max(0, (fuggoInteraktiv.get(szolgaltato) ?? 1) - 1));
    }
  });
  // A sor akkor is haladjon tovább, ha ez a hívás hibázott.
  sorok.set(kulcs, futas.then(() => undefined, () => undefined));
  return futas as Promise<T>;
}

export class UjrapobalhatoHiba extends Error {
  constructor(message: string, readonly statusz: number) {
    super(message);
  }
}

/** 429/5xx esetén újrapróbál, egyébként azonnal továbbadja a hibát. */
export async function ujraprobal<T>(fn: () => Promise<T>, probalkozas = 3): Promise<T> {
  let utolso: unknown;
  for (let i = 0; i < probalkozas; i++) {
    try {
      return await fn();
    } catch (err) {
      utolso = err;
      const ujra = err instanceof UjrapobalhatoHiba;
      if (!ujra || i === probalkozas - 1) throw err;
      await varj(500 * 2 ** i);
    }
  }
  throw utolso;
}

function kulcsHash(szolgaltato: string, kulcsResz: unknown): string {
  const h = createHash("sha1").update(JSON.stringify(kulcsResz)).digest("hex");
  return `${szolgaltato}:${h}`;
}

/**
 * Cache-elt külső hívás: ha van érvényes sor, azt adja vissza; ha nincs,
 * sorba állítva, újrapróbálással lekéri, és eltárolja `ttlPerc`-ig.
 *
 * Az adatbázis-hibák NEM buktatják el a hívást — a cache gyorsító, nem
 * feltétel: ha nem elérhető, a kérés ugyanúgy kimegy.
 */
export async function cachelveHiv<T>(
  szolgaltato: string,
  kulcsResz: unknown,
  ttlPerc: number,
  fn: () => Promise<T>
): Promise<T> {
  const kulcs = kulcsHash(szolgaltato, kulcsResz);
  // Az azonos (szolgáltató, kulcs) párhuzamos hívásai egy ígéreten osztoznak; lezárultakor törlődik.
  return megosztva(folyamatban, kulcs, () => cachelveHivEgyszer(szolgaltato, kulcs, ttlPerc, fn));
}

/** Folyamatban lévő cachelveHiv-hívások (a kulcs már tartalmazza a szolgáltatót). */
const folyamatban = new Map<string, Promise<unknown>>();

async function cachelveHivEgyszer<T>(szolgaltato: string, kulcs: string, ttlPerc: number, fn: () => Promise<T>): Promise<T> {
  try {
    const sor = await query<{ valasz: T }>(
      `update kulso_valasz_cache set talalat = talalat + 1
       where kulcs = $1 and lejar_at > now() returning valasz`,
      [kulcs]
    );
    if (sor.length > 0) return sor[0].valasz;
  } catch {
    // nincs tábla / nincs adatbázis — megyünk tovább a valódi híváshoz
  }
  const eredmeny = await sorbaAllit(szolgaltato, () => ujraprobal(fn));
  try {
    await query(
      `insert into kulso_valasz_cache (kulcs, szolgaltato, valasz, lejar_at)
       values ($1, $2, $3::jsonb, now() + ($4 || ' minutes')::interval)
       on conflict (kulcs) do update set valasz = excluded.valasz, lejar_at = excluded.lejar_at, letrehozva_at = now()`,
      [kulcs, szolgaltato, JSON.stringify(eredmeny), String(ttlPerc)]
    );
  } catch {
    // a cache-írás elmaradása nem hiba a hívó szempontjából
  }
  return eredmeny;
}

/** Kerekített koordináta a cache-kulcshoz: ~11 m felbontás, így a jelentéktelen GPS-remegés nem ront cache-t. */
export function kulcsKoordinata(lat: number, lon: number): [number, number] {
  return [Math.round(lat * 10000) / 10000, Math.round(lon * 10000) / 10000];
}
