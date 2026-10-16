// Ecofleet (FleetComplete / "seeme") JSON-kliens — docs/ecofleet-telemetria-terv.md 1. pont.
//
// URL: https://app.ecofleet.com/seeme/Api/<Útvonal>?json&key=<KULCS>&<paraméterek>
// Válasz: { status: 0, meta: {}, response: [...] }; hiba: status != 0 + errormessage.
//
// BIZTONSÁG: a kulcs a query-ben megy, ezért az URL maga is titok. Semmilyen
// innen kijutó hibaüzenetbe (és stackbe) nem kerülhet sem a kulcs, sem az URL,
// sem a `key=` szöveg — az eredeti hibák szövege csak `maszkoltUzenet()`-en át
// kerülhet be, `cause` soha.
//
// NEM "server-only" import: a scripts/teszt-ecofleet-kliens.ts tsx alól tölti be.
// Kliens-komponensből ettől még nem szabad importálni (a kulcs env-ből jön).

export const ECOFLEET_BASE = "https://app.ecofleet.com/seeme/Api";
const ALAP_TIMEOUT_MS = 20_000;
const UJRAPROBA_SZUNET_MS = 1_000;

export class EcofleetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcofleetError";
  }
}

/** A kulcs minden előfordulását `***`-ra cseréli (ha a kulcs nincs beállítva, a szöveg változatlan). */
export function maszkol(szoveg: string): string {
  const kulcs = process.env.ECOFLEET_API_KEY;
  if (!kulcs) return szoveg;
  return szoveg.split(kulcs).join("***");
}

/**
 * Hibaüzenetbe szánt szöveg: maszkolva, az URL-ek és bármilyen `key=…`
 * paraméter kivágva (akkor is, ha a kulcs időközben megváltozott az env-ben).
 */
export function maszkoltUzenet(szoveg: string): string {
  return maszkol(szoveg)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/key=[^&\s]*/gi, "")
    .slice(0, 300);
}

function hibaSzovege(e: unknown): string {
  if (e instanceof Error) return e.name === "TimeoutError" || e.name === "AbortError" ? "időtúllépés" : e.message;
  return String(e);
}

// ── Teszt-horgok (éles kód nem hívja) ─────────────────────────────────────
let tesztFetch: typeof fetch | null = null;

/** A `fetchImpl` nélküli hívások (és a getLastDataCachelve) ezt a fetch-et használják; null → globális fetch. */
export function _tesztFetchBeallit(fn: typeof fetch | null): void {
  tesztFetch = fn;
}

/** Kiüríti a getLastData-gyorsítótárat és a függőben lévő ígéretet. */
export function _tesztCacheUrit(): void {
  lastDataCache = null;
  lastDataFolyamatban = null;
}

// ── Alap hívás ────────────────────────────────────────────────────────────

type Boritek = { status?: unknown; errormessage?: unknown; response?: unknown };

class UjraprobalhatoHiba extends Error {}

async function egyHivas<T>(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new UjraprobalhatoHiba(`Ecofleet hálózati hiba: ${maszkoltUzenet(hibaSzovege(e))}`);
  }

  if (res.status >= 500) {
    void res.body?.cancel().catch(() => {}); // nem várjuk meg: tee-zett (clone-olt) streamnél sosem oldódna fel
    throw new UjraprobalhatoHiba(`Ecofleet szerverhiba (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    void res.body?.cancel().catch(() => {}); // nem várjuk meg: tee-zett (clone-olt) streamnél sosem oldódna fel
    throw new EcofleetError(`Ecofleet hiba (HTTP ${res.status}).`);
  }

  let szoveg: string;
  try {
    szoveg = await res.text();
  } catch (e) {
    throw new UjraprobalhatoHiba(`Ecofleet válasz olvasása sikertelen: ${maszkoltUzenet(hibaSzovege(e))}`);
  }

  let boritek: Boritek;
  try {
    boritek = JSON.parse(szoveg) as Boritek;
  } catch {
    throw new EcofleetError(`Az Ecofleet válasza nem JSON (HTTP ${res.status}).`);
  }
  if (!boritek || typeof boritek !== "object") {
    throw new EcofleetError("Az Ecofleet válasza nem értelmezhető.");
  }
  if (String(boritek.status) !== "0") {
    const uzenet = typeof boritek.errormessage === "string" && boritek.errormessage.trim()
      ? maszkoltUzenet(boritek.errormessage.trim())
      : `státusz: ${maszkoltUzenet(String(boritek.status ?? "?"))}`;
    throw new EcofleetError(`Ecofleet hiba: ${uzenet}`);
  }
  return boritek.response as T;
}

/**
 * Egy Ecofleet JSON API-hívás; a `response` mezőt adja vissza.
 * Hálózati hiba / HTTP 5xx → egy újrapróbálás 1 s után; 4xx és `status != 0` → azonnal hiba.
 * Minden hiba `EcofleetError`, maszkolt üzenettel.
 */
export async function ecofleetJson<T>(
  utvonal: string,
  params: Record<string, string> = {},
  opciok: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<T> {
  const kulcs = process.env.ECOFLEET_API_KEY;
  if (!kulcs) {
    throw new EcofleetError("Nincs beállítva az ECOFLEET_API_KEY környezeti változó.");
  }
  const fetchFn = opciok.fetchImpl ?? tesztFetch ?? globalThis.fetch;
  const timeoutMs = opciok.timeoutMs ?? ALAP_TIMEOUT_MS;

  const kereses = new URLSearchParams();
  kereses.set("key", kulcs);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") kereses.set(k, v);
  }
  const url = `${ECOFLEET_BASE}/${utvonal.replace(/^\/+/, "")}?json&${kereses.toString()}`;

  for (let kiserlet = 1; ; kiserlet++) {
    try {
      return await egyHivas<T>(fetchFn, url, timeoutMs);
    } catch (e) {
      if (e instanceof UjraprobalhatoHiba) {
        if (kiserlet < 2) {
          await new Promise((r) => setTimeout(r, UJRAPROBA_SZUNET_MS));
          continue;
        }
        throw new EcofleetError(e.message);
      }
      if (e instanceof EcofleetError) throw e;
      throw new EcofleetError(`Ecofleet hiba: ${maszkoltUzenet(hibaSzovege(e))}`);
    }
  }
}

// ── getLastData közös gyorsítótár ─────────────────────────────────────────

/** Egy `Vehicles/getLastData` sor (JSON) — csak a nálunk használt mezők típusozva. */
export type EcofleetLastData = {
  objectId: number | string;
  timestamp?: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  direction?: number | null;
  enginestate?: number | null;
  fuel?: number | null;
  CANDistance?: number | null;
  driverName?: string | null;
  tcoData?: Record<string, unknown> | null;
  [mezo: string]: unknown;
};

type LastDataEredmeny = { sorok: EcofleetLastData[]; lekerveAt: Date };

let lastDataCache: LastDataEredmeny | null = null;
let lastDataFolyamatban: Promise<LastDataEredmeny> | null = null;

/**
 * Az egész flotta `Vehicles/getLastData`-ja, folyamaton belül `maxKorMs`-ig
 * gyorsítótárazva. Az egyidejű hívók ugyanazt az ígéretet kapják; hiba nem
 * kerül gyorsítótárba.
 */
export function getLastDataCachelve(maxKorMs = 30_000): Promise<LastDataEredmeny> {
  if (lastDataCache && Date.now() - lastDataCache.lekerveAt.getTime() <= maxKorMs) {
    return Promise.resolve(lastDataCache);
  }
  if (lastDataFolyamatban) return lastDataFolyamatban;

  const igeret = (async () => {
    const response = await ecofleetJson<unknown>("Vehicles/getLastData");
    if (!Array.isArray(response)) {
      throw new EcofleetError("Az Ecofleet getLastData válasza nem lista.");
    }
    const eredmeny: LastDataEredmeny = {
      sorok: response.filter((s): s is EcofleetLastData => !!s && typeof s === "object"),
      lekerveAt: new Date(),
    };
    lastDataCache = eredmeny;
    return eredmeny;
  })();
  lastDataFolyamatban = igeret;
  const takarit = () => {
    if (lastDataFolyamatban === igeret) lastDataFolyamatban = null;
  };
  igeret.then(takarit, takarit);
  return igeret;
}
