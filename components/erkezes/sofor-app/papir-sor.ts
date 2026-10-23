// A sofőr papír-fotóinak feltöltési sora a telefonon (sofőr app, 2026-10-21).
//
// Budaházi Zoltán: a sofőr pihenőkor / este fotózza a papírt — sokszor
// parkolóban, gyenge térerőn. A „Beküldöm” ezért előbb a telefon IndexedDB-
// jébe teszi az oldalakat (már kicsinyítve), és onnan tölti fel egyenként;
// ami nem ment fel, ott marad, és a következő alkalommal (az app megnyitása,
// a hálózat visszatérése, percenkénti próba) magától felmegy. Egy oldal sem
// vész el csendben: a sor hossza a kezdőlapon látszik.
//
// Ha a böngésző nem ad IndexedDB-t (privát mód), az oldalak azonnal, a régi
// módon mennek fel (feltoltOldalakat).

import { kicsinyitFotot } from "@/lib/fuvarozas/fuvarlevel-feltoltes";

const DB_NEV = "sofor-papir-sor";
const TAR = "oldalak";

type SorTetel = { id: string; fuvarId: string; blob: Blob; letrehozva: number; probak: number };

function megnyit(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === "undefined") return ok(null);
      const k = indexedDB.open(DB_NEV, 1);
      k.onupgradeneeded = () => {
        if (!k.result.objectStoreNames.contains(TAR)) k.result.createObjectStore(TAR, { keyPath: "id" });
      };
      k.onsuccess = () => ok(k.result);
      k.onerror = () => ok(null);
      k.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

function keres<T>(db: IDBDatabase, mod: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((ok, hiba) => {
    const tx = db.transaction(TAR, mod);
    const r = fn(tx.objectStore(TAR));
    tx.oncomplete = () => ok(r.result);
    tx.onerror = () => hiba(tx.error);
    tx.onabort = () => hiba(tx.error);
  });
}

async function mind(db: IDBDatabase): Promise<SorTetel[]> {
  const t = await keres<SorTetel[]>(db, "readonly", (s) => s.getAll() as IDBRequest<SorTetel[]>);
  return [...t].sort((a, b) => a.letrehozva - b.letrehozva);
}

/** Fuvaronként hány oldal vár még feltöltésre. */
export async function sorAllapot(): Promise<Record<string, number>> {
  const db = await megnyit();
  if (!db) return {};
  try {
    const out: Record<string, number> = {};
    for (const t of await mind(db)) out[t.fuvarId] = (out[t.fuvarId] ?? 0) + 1;
    return out;
  } catch {
    return {};
  } finally {
    db.close();
  }
}

/**
 * Egy oldal feltöltése a STABIL végpontra (app/api/fuvarozas/fuvarlevel-
 * feltoltes), nem szerver-akcióval: az akció azonosítója élesítésenként
 * változik, és a napokig sorban álló oldal utána nem menne fel. A `kulcs`
 * idempotens: ha a válasz útközben elveszett, az újrapróba nem duplikál.
 */
async function feltoltEgyet(fuvarId: string, blob: Blob, kulcs: string): Promise<string | null> {
  const form = new FormData();
  form.append("fuvarId", fuvarId);
  form.append("kulcs", kulcs);
  form.append("foto", blob, blob.type === "image/png" ? "fuvarlevel.png" : "fuvarlevel.jpg");
  const v = await fetch("/api/fuvarozas/fuvarlevel-feltoltes", { method: "POST", body: form, credentials: "same-origin" });
  const e = (await v.json().catch(() => null)) as { figyelmeztetes?: string | null; hiba?: string } | null;
  if (!v.ok) throw new Error(e?.hiba ?? `Feltöltési hiba (${v.status})`);
  return e?.figyelmeztetes ?? null;
}

function ujKulcs(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export type SorEredmeny = { sikeres: number; varakozik: number; figyelmeztetes: string | null };

let fut: Promise<SorEredmeny> | null = null;

/**
 * A sor feltöltése sorrendben. Párhuzamos hívás nem indít második kört (a
 * futót adja vissza). Az első hibánál megáll — rossz térerőn fölösleges a
 * többivel próbálkozni —, a maradék a sorban vár.
 */
export function sorFeldolgoz(haladas?: (kesz: number, osszes: number) => void): Promise<SorEredmeny> {
  if (fut) return fut;
  fut = (async () => {
    const db = await megnyit();
    if (!db) return { sikeres: 0, varakozik: 0, figyelmeztetes: null };
    let sikeres = 0;
    let figyelmeztetes: string | null = null;
    try {
      const tetelek = await mind(db);
      haladas?.(0, tetelek.length);
      for (const t of tetelek) {
        try {
          const f = await feltoltEgyet(t.fuvarId, t.blob, t.id);
          if (f) figyelmeztetes = f;
          await keres(db, "readwrite", (s) => s.delete(t.id));
          sikeres++;
          haladas?.(sikeres, tetelek.length);
        } catch {
          await keres(db, "readwrite", (s) => s.put({ ...t, probak: t.probak + 1 })).catch(() => undefined);
          break;
        }
      }
      const maradt = (await mind(db)).length;
      return { sikeres, varakozik: maradt, figyelmeztetes };
    } finally {
      db.close();
    }
  })().finally(() => {
    fut = null;
  });
  return fut;
}

/**
 * Az oldalak a sorba (kicsinyítve), majd azonnal feltöltés. Ha nincs
 * IndexedDB, közvetlen feltöltés — ilyenkor a sikertelen oldal elvész, ezt a
 * visszatérési érték `varakozik` helyett a `hibas` mezője jelzi.
 */
export async function bekuld(
  fuvarId: string,
  oldalak: Blob[],
  haladas?: (kesz: number, osszes: number) => void
): Promise<SorEredmeny & { hibas: number }> {
  const kicsik: Blob[] = [];
  for (const b of oldalak) {
    const fajl = b instanceof File ? b : new File([b], "fuvarlevel.jpg", { type: b.type || "image/jpeg" });
    kicsik.push(await kicsinyitFotot(fajl));
  }
  const db = await megnyit();
  if (!db) {
    let sikeres = 0, hibas = 0;
    let figyelmeztetes: string | null = null;
    for (const b of kicsik) {
      try {
        const f = await feltoltEgyet(fuvarId, b, ujKulcs());
        if (f) figyelmeztetes = f;
        sikeres++;
      } catch {
        hibas++;
      }
      haladas?.(sikeres + hibas, kicsik.length);
    }
    return { sikeres, varakozik: 0, hibas, figyelmeztetes };
  }
  try {
    const most = Date.now();
    for (let i = 0; i < kicsik.length; i++) {
      const tetel: SorTetel = { id: ujKulcs(), fuvarId, blob: kicsik[i], letrehozva: most + i, probak: 0 };
      await keres(db, "readwrite", (s) => s.put(tetel));
    }
  } finally {
    db.close();
  }
  const e = await sorFeldolgoz(haladas);
  return { ...e, hibas: 0 };
}
