// Az Ecofleet tiszta számításainak tesztje (docs/ecofleet-telemetria-terv.md 2–3. pont):
// tachó-állapot a getLastData-sorból, CAN-napi összesítés a getRawData-sorokból,
// percSzoveg, tachoFriss és a webhook-kulcs.
// Futtatás: npx tsx scripts/teszt-telemetria.ts

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tachoAllapotLastDatabol, tachoFriss, percSzoveg, canNapNyersbol, type TachoAllapot } from "@/lib/ecofleet/szamitas";
import { webhookKulcs } from "@/lib/jarmu-telemetria/webhook";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
function kozel(nev: string, kapott: number | null | undefined, vart: number, tures = 0.05) {
  all(`${nev} — várt ${vart} ±${tures}, kapott ${kapott}`, typeof kapott === "number" && Math.abs(kapott - vart) <= tures);
}

const gyoker = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (nev: string) => JSON.parse(readFileSync(path.join(gyoker, "scripts/fixtures/ecofleet", nev), "utf8"));
const lastData: Record<string, unknown>[] = fixture("getLastData.json").response;
const rawNMZ: Record<string, unknown>[] = fixture("getRawData-NMZ.json").response;
const rawAOPU: Record<string, unknown>[] = fixture("getRawData-AOPU.json").response;
const rawHiba: Record<string, unknown>[] = fixture("getRawData-szamlalo-hiba.json").response;
const masol = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ── 1. tachoAllapotLastDatabol ─────────────────────────────────────────────
const nmz = tachoAllapotLastDatabol(lastData[0]);
{
  all("NMZ: van tachó-állapot", nmz !== null);
  eq("NMZ: objectId szövegként", nmz?.objectId, "369485");
  eq("NMZ: állapot", nmz?.allapot, "Pihenő");
  eq("NMZ: napi hátralévő vezetés (36000 mp)", nmz?.napiVezetesHatraPerc, 600);
  eq("NMZ: heti hátralévő (95097 mp → Math.round)", nmz?.hetiVezetesHatraPerc, 1585);
  eq("NMZ: heti vezetés (106503 mp → Math.round)", nmz?.hetiVezetesPerc, 1775);
  eq("NMZ: műszakból hátra", nmz?.muszakHatraPerc, 900);
  eq("NMZ: munkaidőből hátra", nmz?.munkaidoHatraPerc, 600);
  eq("NMZ: következő napi pihenő", nmz?.kovetkezoNapiPihenoPerc, 540);
  eq("NMZ: csökkentett pihenők", nmz?.csokkentettPihenok, 2);
  eq("NMZ: hosszabbított vezetések", nmz?.hosszabbitottVezetesek, 1);
  eq("NMZ: állapot kezdete (+0000)", nmz?.allapotKezdete?.toISOString(), "2026-10-15T13:07:47.000Z");
  eq("NMZ: adat időpontja (+0200)", nmz?.adatIdopont?.toISOString(), "2026-10-16T08:22:57.000Z");
}
const aopu = tachoAllapotLastDatabol(lastData[1]);
{
  all("AOPU: van tachó-állapot", aopu !== null);
  eq("AOPU: objectId", aopu?.objectId, "1144376");
  eq("AOPU: állapot", aopu?.allapot, "Vezetés");
  eq("AOPU: napi hátralévő (9600 mp)", aopu?.napiVezetesHatraPerc, 160);
  eq("AOPU: heti hátralévő (140400 mp)", aopu?.hetiVezetesHatraPerc, 2340);
  eq("AOPU: heti vezetés (61200 mp)", aopu?.hetiVezetesPerc, 1020);
  eq("AOPU: csökkentett pihenők", aopu?.csokkentettPihenok, 1);
  eq("AOPU: hosszabbított vezetések (0 marad 0)", aopu?.hosszabbitottVezetesek, 0);
}
{
  eq("tcoData: null → null", tachoAllapotLastDatabol(lastData[2]), null);
  eq("nincs tcoData mező → null", tachoAllapotLastDatabol({ objectId: 1, timestamp: "2026-10-16 10:00:00+0200" }), null);
  eq("nem objektum → null", tachoAllapotLastDatabol(null), null);
  eq("szöveg → null", tachoAllapotLastDatabol("x"), null);

  const hianyos = masol(lastData[0]) as { tcoData: Record<string, unknown> };
  delete hianyos.tcoData.drivetimeLeftDay;
  hianyos.tcoData.drivetimeLeftWeek = null;
  delete hianyos.tcoData.countOfReducedDailyRests;
  delete hianyos.tcoData.currentState;
  delete hianyos.tcoData.stateBeginTime;
  const h = tachoAllapotLastDatabol(hianyos);
  all("hiányos tcoData: mégis állapot", h !== null);
  eq("hiányzó drivetimeLeftDay → null (nem 0)", h?.napiVezetesHatraPerc, null);
  eq("null drivetimeLeftWeek → null (nem 0)", h?.hetiVezetesHatraPerc, null);
  eq("hiányzó countOfReducedDailyRests → null (nem 0)", h?.csokkentettPihenok, null);
  eq("hiányzó currentState → null", h?.allapot, null);
  eq("hiányzó stateBeginTime → null", h?.allapotKezdete, null);
  eq("a megmaradt mező értéke marad", h?.hetiVezetesPerc, 1775);
}

// ── 2. tachoFriss ──────────────────────────────────────────────────────────
{
  const t = nmz as TachoAllapot;
  const alap = new Date("2026-10-16T08:22:57Z").getTime();
  eq("10 perces adat friss", tachoFriss(t, new Date(alap + 10 * 60000)), true);
  eq("20 perces adat nem friss", tachoFriss(t, new Date(alap + 20 * 60000)), false);
  eq("20 perces adat maxKorPerc=30-cal friss", tachoFriss(t, new Date(alap + 20 * 60000), 30), true);
  eq("adatIdopont null → nem friss", tachoFriss({ ...t, adatIdopont: null }, new Date(alap)), false);
}

// ── 3. percSzoveg ──────────────────────────────────────────────────────────
{
  eq("160 perc", percSzoveg(160), "2 ó 40 p");
  eq("45 perc", percSzoveg(45), "45 p");
  eq("0 perc", percSzoveg(0), "0 p");
  eq("negatív", percSzoveg(-5), "0 p");
  eq("60 perc", percSzoveg(60), "1 ó 0 p");
  eq("600 perc", percSzoveg(600), "10 ó 0 p");
  eq("tört perc kerekítve (89.6)", percSzoveg(89.6), "1 ó 30 p");
}

// ── 4. canNapNyersbol ──────────────────────────────────────────────────────
{
  const c = canNapNyersbol(rawNMZ);
  kozel("NMZ: literCan", c.literCan, 218.4);
  kozel("NMZ: kmCan", c.kmCan, 744);
  kozel("NMZ: l/100", c.l100, 29.35);
  eq("NMZ: pontosan 1 tankolás", c.tankolasok.length, 1);
  eq("NMZ: tankolás időpontja = a 7. indexű minta", c.tankolasok[0]?.idopont, rawNMZ[7].timestamp);
  eq("NMZ: tankolás előtte/utána/hozzáadott",
    [c.tankolasok[0]?.literElotte, c.tankolasok[0]?.literUtana, c.tankolasok[0]?.hozzaadott], [371, 971, 600]);
  eq("NMZ: szervizig = utolsó érték", c.szervizHatraKm, rawNMZ[rawNMZ.length - 1].CANServiceDistance);
  eq("NMZ: szerviz megbízható", c.szervizMegbizhato, true);
  eq("NMZ: tengelyterhelés (utolsó)", c.tengelyTerhelesKg, { "1": 7787 });
  eq("NMZ: mintaDb", c.mintaDb, 14);
}
{
  // Sorrend-függetlenség: fordított sorrendben is ugyanaz (a minták időrendbe kerülnek).
  const c = canNapNyersbol([...rawNMZ].reverse());
  eq("NMZ fordítva: 1 tankolás, ugyanott", [c.tankolasok.length, c.tankolasok[0]?.idopont, c.tankolasok[0]?.hozzaadott], [1, rawNMZ[7].timestamp, 600]);
  eq("NMZ fordítva: szervizig az időrendben utolsó", c.szervizHatraKm, rawNMZ[rawNMZ.length - 1].CANServiceDistance);
  eq("NMZ fordítva: tengely az időrendben utolsó", c.tengelyTerhelesKg, { "1": 7787 });
}
{
  const c = canNapNyersbol(rawAOPU);
  eq("AOPU: szerviz NEM megbízható (mind −5)", c.szervizMegbizhato, false);
  eq("AOPU: szervizig <= 0 → 0", c.szervizHatraKm, 0);
  eq("AOPU: nincs tengely", c.tengelyTerhelesKg, null);
  eq("AOPU: nincs tankolás", c.tankolasok, []);
  kozel("AOPU: literCan", c.literCan, 236.6);
  kozel("AOPU: kmCan", c.kmCan, 806);
  eq("AOPU: mintaDb", c.mintaDb, 14);
}
{
  const c = canNapNyersbol(rawHiba);
  eq("számláló-hiba: literCan null", c.literCan, null);
  eq("számláló-hiba: l100 null", c.l100, null);
  kozel("számláló-hiba: kmCan ettől még megvan", c.kmCan, 310);
  eq("számláló-hiba: mintaDb", c.mintaDb, 6);
}
{
  const c = canNapNyersbol([]);
  eq("üres: minden null, mintaDb 0", c, {
    literCan: null, kmCan: null, l100: null, tankolasok: [], szervizHatraKm: null,
    szervizMegbizhato: false, tengelyTerhelesKg: null, mintaDb: 0,
  });
}
{
  // Rövid nap: kmCan < 20 → l100 null.
  const rovid = masol(rawNMZ.slice(0, 2)) as Record<string, unknown>[];
  rovid[1].CANDistance = Number(rovid[0].CANDistance) + 10;
  const c = canNapNyersbol(rovid);
  kozel("rövid nap: kmCan 10", c.kmCan, 10);
  eq("rövid nap: l100 null (km < 20)", c.l100, null);
}
{
  // Előre-ugrás > 500 l a napon → literCan null.
  const ugras = masol(rawNMZ.slice(0, 3)) as Record<string, unknown>[];
  ugras[2].CANFuelUsed = Number(ugras[0].CANFuelUsed) + 700;
  eq("számláló-ugrás > 500 l → literCan null", canNapNyersbol(ugras).literCan, null);
}
{
  // Kis üzemanyagszint-ingadozás (< 50 l) nem tankolás.
  const ingas = masol(rawNMZ.slice(0, 3)) as Record<string, unknown>[];
  ingas[1].Fuel = Number(ingas[0].Fuel) + 30;
  eq("+30 l ingadozás nem tankolás", canNapNyersbol(ingas).tankolasok, []);
}
{
  // Hiányzó CAN-mezők → null, nem 0.
  const csupasz = rawNMZ.map((s) => ({ timestamp: s.timestamp, Latitude: s.Latitude, Longitude: s.Longitude }));
  const c = canNapNyersbol(csupasz);
  eq("CAN-mezők nélkül: literCan/kmCan/l100/szerviz null", [c.literCan, c.kmCan, c.l100, c.szervizHatraKm, c.tengelyTerhelesKg], [null, null, null, null, null]);
  eq("CAN-mezők nélkül: mintaDb a sorok száma", c.mintaDb, 14);
}

// ── 5. webhookKulcs ────────────────────────────────────────────────────────
{
  const sha = (s: string) => "sha256:" + createHash("sha256").update(s, "utf8").digest("hex");
  eq("id mező (szám) → szövegként", webhookKulcs({ id: 123 }, '{"id":123}'), "123");
  eq("id mező (szöveg)", webhookKulcs({ id: "ev-1" }, '{"id":"ev-1"}'), "ev-1");
  eq("eventId mező", webhookKulcs({ eventId: "abc" }, '{"eventId":"abc"}'), "abc");
  eq("id elsőbbsége az eventId előtt", webhookKulcs({ id: "x", eventId: "y" }, "{}"), "x");
  eq("üres id → hash", webhookKulcs({ id: "" }, '{"id":""}'), sha('{"id":""}'));
  eq("nincs azonosító → sha256 a nyers body-ból", webhookKulcs({ a: 1 }, '{"a":1}'), sha('{"a":1}'));
  eq("nem objektum payload → hash", webhookKulcs(null, "nyers"), sha("nyers"));
  eq("ugyanaz a body → ugyanaz a kulcs", webhookKulcs({}, "abc"), webhookKulcs({}, "abc"));
  all("más body → más kulcs", webhookKulcs({}, "abc") !== webhookKulcs({}, "abd"));
}

console.log(`\nTelemetria teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
