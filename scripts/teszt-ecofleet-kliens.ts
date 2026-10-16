// Az Ecofleet JSON-kliens tesztje (docs/ecofleet-telemetria-terv.md 1. pont).
// Futtatás: npx tsx scripts/teszt-ecofleet-kliens.ts
//
// Hálózat NINCS: minden hívás befecskendezett fetch-csonkkal megy. Amit
// bizonyít: (1) az URL `?json&key=…` alakú és a `response` mező jön vissza;
// (2) `status != 0` → EcofleetError az errormessage-dzsel, újrapróbálás nélkül;
// (3) 5xx / hálózati hiba → pontosan EGY újrapróbálás; 4xx → nincs;
// (4) a kulcs és az URL soha nem kerül hibaüzenetbe; (5) a 30 s-os
// getLastData-gyorsítótár egyidejű hívókat egy lekérésre fog össze, és a
// hibát nem jegyzi meg.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ecofleetJson,
  getLastDataCachelve,
  maszkol,
  EcofleetError,
  _tesztFetchBeallit,
  _tesztCacheUrit,
} from "@/lib/ecofleet/kliens";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const KULCS = "TITOK123KULCS";
const gyoker = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (nev: string) => JSON.parse(readFileSync(path.join(gyoker, "scripts/fixtures/ecofleet", nev), "utf8"));
const LAST_DATA = fixture("getLastData.json");
const LAST_DATA_HIBA = fixture("getLastData-hiba.json");

type Hivas = { url: string; init?: RequestInit };
/** Fetch-csonk: a válaszokat sorban adja (függvény → meghívja, Error → dobja). */
function csonk(valaszok: Array<Response | Error | (() => Response | Promise<Response>)>, kesleltetesMs = 0) {
  const hivasok: Hivas[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    hivasok.push({ url, init });
    if (kesleltetesMs > 0) await new Promise((r) => setTimeout(r, kesleltetesMs));
    const v = valaszok[Math.min(hivasok.length - 1, valaszok.length - 1)];
    if (v instanceof Error) throw v;
    if (typeof v === "function") return v();
    return v.clone();
  }) as typeof fetch;
  return { fn, hivasok };
}
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/** A hibaüzenet nem szivárogtathat: se a kulcs, se `key=`, se az URL. */
function nemSzivarog(nev: string, e: unknown) {
  const uzenet = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  all(`${nev}: a hibaüzenetben nincs kulcs`, !uzenet.includes(KULCS));
  all(`${nev}: a hibaüzenetben nincs "key="`, !uzenet.includes("key="));
}

async function elkap(p: Promise<unknown>): Promise<unknown> {
  try { await p; return undefined; } catch (e) { return e ?? new Error("üres hiba"); }
}

async function main() {
  process.env.ECOFLEET_API_KEY = KULCS;

  // 1. Sikeres hívás: URL alak + response mező.
  {
    const { fn, hivasok } = csonk([json(LAST_DATA)]);
    const r = await ecofleetJson<unknown[]>("Vehicles/getLastData", { objectId: "369485" }, { fetchImpl: fn });
    eq("pontosan 1 hívás", hivasok.length, 1);
    const u = new URL(hivasok[0].url);
    eq("az útvonal az Ecofleet API alá kerül", u.origin + u.pathname, "https://app.ecofleet.com/seeme/Api/Vehicles/getLastData");
    all("az URL-ben van `json` paraméter", u.searchParams.has("json"));
    eq("az URL-ben a kulcs", u.searchParams.get("key"), KULCS);
    eq("a többi paraméter is bekerül", u.searchParams.get("objectId"), "369485");
    all("a fetch kap AbortSignal-t (időkorlát)", hivasok[0].init?.signal instanceof AbortSignal);
    eq("a `response` mezőt adja vissza", r, LAST_DATA.response);
  }

  // 2. status != 0 → EcofleetError az errormessage-dzsel, nincs újrapróbálás.
  {
    const { fn, hivasok } = csonk([json(LAST_DATA_HIBA), json(LAST_DATA)]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("status != 0 → EcofleetError", e instanceof EcofleetError);
    all("az üzenetben az errormessage", e instanceof Error && e.message.includes("Unknown API user"));
    eq("status != 0 → nincs újrapróbálás", hivasok.length, 1);
    nemSzivarog("status != 0", e);
  }

  // 3. HTTP 500, majd 200 → pontosan 2 hívás, siker.
  {
    const { fn, hivasok } = csonk([new Response("belső hiba", { status: 500 }), json(LAST_DATA)]);
    const t0 = Date.now();
    const r = await ecofleetJson<unknown[]>("Vehicles/getLastData", {}, { fetchImpl: fn });
    eq("500 után újrapróbál: 2 hívás", hivasok.length, 2);
    eq("500 után a második válasz jön vissza", Array.isArray(r) ? r.length : null, 3);
    all(`az újrapróbálás előtt ~1 s szünet (${Date.now() - t0} ms)`, Date.now() - t0 >= 900);
  }

  // 4. HTTP 500 kétszer → hiba, 2 hívás, nincs szivárgás.
  {
    const { fn, hivasok } = csonk([new Response("belső hiba", { status: 500 })]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("tartós 500 → EcofleetError", e instanceof EcofleetError);
    eq("tartós 500 → pontosan 2 hívás", hivasok.length, 2);
    nemSzivarog("tartós 500", e);
  }

  // 5. Hálózati hiba kétszer → dob, 2 hívás. A csonk hibája szándékosan
  //    tartalmazza a kulcsos URL-t (mint az undici néha) — ennek sem szabad kijutnia.
  {
    const { fn, hivasok } = csonk([new TypeError(`fetch failed: https://app.ecofleet.com/seeme/Api/Vehicles/getLastData?json&key=${KULCS}`)]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("hálózati hiba → dob", e !== undefined);
    all("hálózati hiba → EcofleetError", e instanceof EcofleetError);
    eq("hálózati hiba → pontosan 2 hívás", hivasok.length, 2);
    nemSzivarog("hálózati hiba", e);
  }

  // 6. Hálózati hiba egyszer, aztán siker → 2 hívás, siker.
  {
    const { fn, hivasok } = csonk([new TypeError("fetch failed"), json(LAST_DATA)]);
    const r = await ecofleetJson<unknown[]>("Vehicles/getLastData", {}, { fetchImpl: fn });
    eq("hálózati hiba után sikerül: 2 hívás", hivasok.length, 2);
    eq("hálózati hiba után a válasz jön", Array.isArray(r) ? r.length : null, 3);
  }

  // 7. HTTP 4xx → nincs újrapróbálás.
  {
    const { fn, hivasok } = csonk([new Response("nincs", { status: 404 }), json(LAST_DATA)]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("404 → EcofleetError", e instanceof EcofleetError);
    eq("404 → nincs újrapróbálás", hivasok.length, 1);
    nemSzivarog("404", e);
  }

  // 8. Nem JSON válasz 200-zal → EcofleetError, nincs szivárgás.
  {
    const { fn } = csonk([new Response("<html>login</html>", { status: 200 })]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("nem JSON → EcofleetError", e instanceof EcofleetError);
    nemSzivarog("nem JSON", e);
  }

  // 9. maszkol(): a kulcs minden előfordulása ***.
  {
    eq("maszkol: minden előfordulás", maszkol(`a ${KULCS} b ${KULCS}c`), "a *** b ***c");
    eq("maszkol: kulcs nélküli szöveg változatlan", maszkol("semmi titok"), "semmi titok");
    all("maszkol: URL-ben sem marad kulcs", !maszkol(`https://x/y?json&key=${KULCS}`).includes(KULCS));
  }

  // 10. Hiányzó ECOFLEET_API_KEY → EcofleetError, fetch nem hívódik.
  {
    delete process.env.ECOFLEET_API_KEY;
    const { fn, hivasok } = csonk([json(LAST_DATA)]);
    const e = await elkap(ecofleetJson("Vehicles/getLastData", {}, { fetchImpl: fn }));
    all("hiányzó kulcs → EcofleetError", e instanceof EcofleetError);
    all("hiányzó kulcs → az üzenet megnevezi a változót", e instanceof Error && e.message.includes("ECOFLEET_API_KEY"));
    eq("hiányzó kulcs → nincs hálózati hívás", hivasok.length, 0);
    process.env.ECOFLEET_API_KEY = KULCS;
  }

  // 11. getLastDataCachelve: in-flight dedup + gyorsítótár.
  {
    _tesztCacheUrit();
    const { fn, hivasok } = csonk([json(LAST_DATA)], 50);
    _tesztFetchBeallit(fn);
    const [a, b] = await Promise.all([getLastDataCachelve(), getLastDataCachelve()]);
    eq("két egyidejű hívás → 1 lekérés", hivasok.length, 1);
    eq("mindkét hívó ugyanazt kapja", a.lekerveAt.getTime(), b.lekerveAt.getTime());
    eq("a sorok a response tömb", a.sorok.length, 3);
    all("a lekérés a getLastData útvonalra megy", hivasok[0].url.includes("Vehicles/getLastData"));
    all("lekerveAt Date", a.lekerveAt instanceof Date);
    const c = await getLastDataCachelve();
    eq("friss gyorsítótár → nincs újabb lekérés", hivasok.length, 1);
    eq("a gyorsítótárból ugyanaz jön", c.lekerveAt.getTime(), a.lekerveAt.getTime());
    await new Promise((r) => setTimeout(r, 10));
    await getLastDataCachelve(1);
    eq("lejárt gyorsítótár (maxKorMs=1) → új lekérés", hivasok.length, 2);
  }

  // 12. getLastDataCachelve: a hiba NEM kerül gyorsítótárba (egyidejű hívók a hibát is közösen kapják).
  {
    _tesztCacheUrit();
    const hibas = csonk([json(LAST_DATA_HIBA)], 30);
    _tesztFetchBeallit(hibas.fn);
    const [e1, e2] = await Promise.all([elkap(getLastDataCachelve()), elkap(getLastDataCachelve())]);
    all("hibás lekérés → mindkét hívó hibát kap", e1 instanceof EcofleetError && e2 instanceof EcofleetError);
    eq("hibás lekérés egyidejűleg is csak 1 hívás", hibas.hivasok.length, 1);
    nemSzivarog("gyorsítótáras hiba", e1);
    const jo = csonk([json(LAST_DATA)]);
    _tesztFetchBeallit(jo.fn);
    const r = await elkap(getLastDataCachelve()).then((x) => x) ;
    all("hiba után a következő hívás újra lekér (nem a hibát kapja)", r === undefined);
    eq("hiba után 1 új lekérés", jo.hivasok.length, 1);
    _tesztFetchBeallit(null);
    _tesztCacheUrit();
  }
}

main().then(
  () => {
    console.log(`\nEcofleet-kliens teszt: ${ok} rendben, ${bad} hiba`);
    if (bad > 0) process.exit(1);
  },
  (e) => {
    console.error(e);
    console.log(`\nEcofleet-kliens teszt: ${ok} rendben, ${bad + 1} hiba`);
    process.exit(1);
  }
);
