// Az 1. hullám B része (docs/fuvarozas-1-hullam-terv.md): a kocsi-kihasználtság
// tiszta számítása (kihasznaltsag), kézzel számolt esetekkel.
// Futtatás: npx tsx scripts/teszt-1hullam-kihasznaltsag.ts
//
// Képletek (terv B): km-költség = (rakott + üres km) × (l/100 / 100 × Ft/l + útdíj Ft/km);
// fedezet = bérbevétel − km-költség − napi fix × munkanap. Ft egészre, % egy tizedesre.
// 0 munkanap → a napi értékek és a fizetős-nap arány null; 0 km → üres km % null.

import { kihasznaltsag, type KocsiIdoszak } from "@/lib/fuvarozas2/kihasznaltsag-alap";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
/**
 * A fizetős-nap arányt a terv nem rögzíti törtként vagy százalékként — mindkettőt
 * elfogadjuk: tört (0–1, ±0,001) vagy % egy tizedesre kerekítve.
 */
function arany(nev: string, kapott: number | null, fizetos: number, munkanap: number) {
  const t = fizetos / munkanap;
  const szazalek = Math.round(t * 1000) / 10;
  all(`${nev} — várt ${t.toFixed(4)} vagy ${szazalek}, kapott ${kapott}`,
    typeof kapott === "number" && (Math.abs(kapott - t) <= 0.001 || kapott === szazalek));
}

const alap: KocsiIdoszak = {
  munkanapok: 5, berBevetelFt: 420_000, rakottKm: 800, uresKm: 300,
  fizetosNapok: 4, sajatNapok: 1,
  fogyasztasL100: 28, uzemanyagFtL: 617, utdijFtKm: 120, napiFixFt: 50_000,
};

// ── 1. Átlagos hét ─────────────────────────────────────────────────────────
// Ft/km = 0,28 × 617 + 120 = 172,76 + 120 = 292,76
// km-költség = 1100 × 292,76 = 322 036
// fedezet = 420 000 − 322 036 − 5 × 50 000 = −152 036
// bevétel/nap = 84 000; fedezet/nap = −30 407,2 → −30 407; üres km % = 300/1100 = 27,27 → 27,3
{
  const k = kihasznaltsag(alap);
  eq("hét: kmKoltsegFt", k.kmKoltsegFt, 322_036);
  eq("hét: fedezetFt", k.fedezetFt, -152_036);
  eq("hét: bevetelPerNap", k.bevetelPerNap, 84_000);
  eq("hét: fedezetPerNap (−30 407,2 → −30 407)", k.fedezetPerNap, -30_407);
  eq("hét: uresKmSzazalek (27,27 → 27,3)", k.uresKmSzazalek, 27.3);
  arany("hét: fizetosNapArany 4/5", k.fizetosNapArany, 4, 5);
  eq("hét: pontosan a 6 mező", Object.keys(k).sort(), ["bevetelPerNap", "fedezetFt", "fedezetPerNap", "fizetosNapArany", "kmKoltsegFt", "uresKmSzazalek"]);
  eq("a bemenetet nem módosítja", alap.munkanapok === 5 && alap.berBevetelFt === 420_000, true);
}

// ── 2. Pozitív fedezet ─────────────────────────────────────────────────────
// Ft/km = 0,30 × 600 + 100 = 280; km-költség = 500 × 280 = 140 000
// fedezet = 600 000 − 140 000 − 2 × 40 000 = 380 000; /nap 190 000; bevétel/nap 300 000; üres 0 %
{
  const k = kihasznaltsag({ ...alap, munkanapok: 2, berBevetelFt: 600_000, rakottKm: 500, uresKm: 0, fizetosNapok: 2, sajatNapok: 0,
    fogyasztasL100: 30, uzemanyagFtL: 600, utdijFtKm: 100, napiFixFt: 40_000 });
  eq("pozitív: kmKoltsegFt", k.kmKoltsegFt, 140_000);
  eq("pozitív: fedezetFt", k.fedezetFt, 380_000);
  eq("pozitív: fedezetPerNap", k.fedezetPerNap, 190_000);
  eq("pozitív: bevetelPerNap", k.bevetelPerNap, 300_000);
  eq("pozitív: uresKmSzazalek 0 üres km → 0 (nem null)", k.uresKmSzazalek, 0);
  arany("pozitív: fizetosNapArany 2/2", k.fizetosNapArany, 2, 2);
}

// ── 3. Negatív fedezet bevétel nélkül ──────────────────────────────────────
// 1 munkanap, 0 Ft, 200 üres km: km-költség = 200 × 292,76 = 58 552; fedezet = −58 552 − 50 000 = −108 552
{
  const k = kihasznaltsag({ ...alap, munkanapok: 1, berBevetelFt: 0, rakottKm: 0, uresKm: 200, fizetosNapok: 0, sajatNapok: 1 });
  eq("negatív: kmKoltsegFt", k.kmKoltsegFt, 58_552);
  eq("negatív: fedezetFt", k.fedezetFt, -108_552);
  eq("negatív: fedezetPerNap", k.fedezetPerNap, -108_552);
  eq("negatív: bevetelPerNap 0", k.bevetelPerNap, 0);
  eq("negatív: csak üres km → 100 %", k.uresKmSzazalek, 100);
  arany("negatív: fizetosNapArany 0/1", k.fizetosNapArany, 0, 1);
  all("negatív: fedezetPerNap < 0 (piros jelzés alapja)", (k.fedezetPerNap ?? 0) < 0);
}

// ── 4. Kerekítés ───────────────────────────────────────────────────────────
// 3 munkanap, 100 000 Ft, 333 rakott km, napi fix 0:
// km-költség = 333 × 292,76 = 97 489,08 → 97 489; fedezet = 2 510,92 → 2 511
// bevétel/nap = 33 333,33 → 33 333; fedezet/nap = 836,97 (vagy 2511/3 = 837) → 837
{
  const k = kihasznaltsag({ ...alap, munkanapok: 3, berBevetelFt: 100_000, rakottKm: 333, uresKm: 0, fizetosNapok: 2, sajatNapok: 1, napiFixFt: 0 });
  eq("kerekítés: kmKoltsegFt Ft egészre", k.kmKoltsegFt, 97_489);
  eq("kerekítés: fedezetFt Ft egészre", k.fedezetFt, 2_511);
  eq("kerekítés: bevetelPerNap Ft egészre", k.bevetelPerNap, 33_333);
  eq("kerekítés: fedezetPerNap Ft egészre", k.fedezetPerNap, 837);
  all("kerekítés: a Ft-értékek egészek",
    [k.kmKoltsegFt, k.fedezetFt, k.bevetelPerNap, k.fedezetPerNap].every((x) => typeof x === "number" && Number.isInteger(x)));
  arany("kerekítés: fizetosNapArany 2/3", k.fizetosNapArany, 2, 3);
}
{
  // üres km % = 100 / 300 = 33,33 → 33,3; 2/3 → 66,67 → 66,7
  eq("kerekítés: üres km % 1/3 → 33,3", kihasznaltsag({ ...alap, rakottKm: 200, uresKm: 100 }).uresKmSzazalek, 33.3);
  eq("kerekítés: üres km % 2/3 → 66,7", kihasznaltsag({ ...alap, rakottKm: 100, uresKm: 200 }).uresKmSzazalek, 66.7);
  // 1/8 = 12,5 → pontosan egy tizedes
  eq("kerekítés: üres km % 1/8 → 12,5", kihasznaltsag({ ...alap, rakottKm: 700, uresKm: 100 }).uresKmSzazalek, 12.5);
}

// ── 5. 0 munkanap ──────────────────────────────────────────────────────────
// A km-költség és a fedezet ekkor is számol (a napi fix × 0 = 0):
// 100 km × 292,76 = 29 276; fedezet = 50 000 − 29 276 = 20 724
{
  const k = kihasznaltsag({ ...alap, munkanapok: 0, berBevetelFt: 50_000, rakottKm: 100, uresKm: 0, fizetosNapok: 0, sajatNapok: 0 });
  eq("0 munkanap: bevetelPerNap null", k.bevetelPerNap, null);
  eq("0 munkanap: fedezetPerNap null", k.fedezetPerNap, null);
  eq("0 munkanap: fizetosNapArany null", k.fizetosNapArany, null);
  eq("0 munkanap: kmKoltsegFt mégis számol", k.kmKoltsegFt, 29_276);
  eq("0 munkanap: fedezetFt (napi fix nélkül)", k.fedezetFt, 20_724);
  eq("0 munkanap: uresKmSzazalek (van km) → 0", k.uresKmSzazalek, 0);
}
{
  const k = kihasznaltsag({ ...alap, munkanapok: 0, berBevetelFt: 0, rakottKm: 0, uresKm: 0, fizetosNapok: 0, sajatNapok: 0 });
  eq("üres időszak: minden null / 0", k, { bevetelPerNap: null, fedezetPerNap: null, uresKmSzazalek: null, fizetosNapArany: null, kmKoltsegFt: 0, fedezetFt: 0 });
}

// ── 6. 0 km ────────────────────────────────────────────────────────────────
// 5 munkanap, 420 000 Ft, 0 km: km-költség 0, fedezet = 420 000 − 250 000 = 170 000, /nap 34 000
{
  const k = kihasznaltsag({ ...alap, rakottKm: 0, uresKm: 0 });
  eq("0 km: uresKmSzazalek null", k.uresKmSzazalek, null);
  eq("0 km: kmKoltsegFt 0", k.kmKoltsegFt, 0);
  eq("0 km: fedezetFt", k.fedezetFt, 170_000);
  eq("0 km: fedezetPerNap", k.fedezetPerNap, 34_000);
  eq("0 km: bevetelPerNap", k.bevetelPerNap, 84_000);
}

console.log(`\n1. hullám — kihasználtság teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
