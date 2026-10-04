// Rakott és üres km a fuvarláncból (Kimutatás, Tervezés).
// Futtatás: npx tsx scripts/teszt-ures-km.mts
//
// Valós minta: Gergő (AOPU-427) 2026-10-05..06 — Szakoly → Tata → Tata →
// Tompaládony → Sárvár → Székesfehérvár → Debrecen.

import { lancKm, type LancFuvar, type Tavolsag } from "@/lib/fuvarozas2/ures-km";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Kerek, kitalált távolságok településpárokra — a szabályt teszteljük, nem a térképet.
const TAV: Record<string, number> = {
  "Szakoly|Tata": 310, "Tata|Tata": 0, "Tata|Tompaládony": 125, "Tompaládony|Sárvár": 15,
  "Sárvár|Székesfehérvár": 140, "Székesfehérvár|Debrecen": 300,
  "Nyíregyháza|Téglás": 30, "Nyíregyháza|Szigetszentmiklós": 250, "Budapest|Szigetszentmiklós": 20,
  "Téglás|Budapest": 220, "Szigetszentmiklós|Tompaládony": 220, "Tompaládony|Téglás": 400,
};
const varos = (c: string) => ["Szakoly", "Tata", "Tompaládony", "Sárvár", "Székesfehérvár", "Debrecen", "Nyíregyháza", "Téglás", "Szigetszentmiklós", "Budapest"].find((v) => c.includes(v)) ?? c;
const tav: Tavolsag = async (a, b) => (varos(a) === varos(b) ? 0 : TAV[`${varos(a)}|${varos(b)}`] ?? null);

const losung: LancFuvar = { id: "293", jelleg: "ber", felrakasNap: "2026-10-05", lerakasNap: "2026-10-06", felrako: "HU-9600 Sárvár, Ikervári út 42. + H-8000 Székesfehérvár, Holland fasor 4.", lerako: "HU-4031 Debrecen", rakottKm: null };
const palFerr: LancFuvar = { id: "294", jelleg: "sajat", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Szakoly, Rákóczi utca 26", lerako: "2890 Tata, Agráripari telep", rakottKm: null };
const fabrika: LancFuvar = { id: "295", jelleg: "sajat", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "2890 Tata, Agráripari telep", lerako: "9662 Tompaládony, 0117/8 hrsz.", rakottKm: null };

const l = await lancKm([losung, palFerr, fabrika], "Szakoly, Rákóczi utca 26", tav);
eq("sorrend: menet szerint", l.map((x) => x.id), ["294", "295", "293"]);
eq("Szakolyból indul: a Pál-Ferr-Box előtt nincs üres", l[0].ures, 0);
eq("Tata lerakó → Tata felrakó: 0 üres", l[1].ures, 0);
eq("Tompaládony → Sárvár: 15 km üres", l[2].ures, 15);
eq("rakott a megállókon át: Sárvár → Fehérvár → Debrecen", l[2].rakott, 440);
eq("a km a lerakás napjára kerül", l[2].nap, "2026-10-06");
const huGo = await lancKm([{ ...losung, rakottKm: 452 }], "Tompaládony", tav);
eq("bérfuvarnál a HU-GO-s rakott km az irányadó", huGo[0].rakott, 452);
const telep = await lancKm([fabrika], "Szakoly", tav);
eq("előző lerakó nélkül a telephelyről üres", telep[0].ures, 310);

// Gergő 09.29.: Nyíregyházáról a közeli Téglás jön, nem a korábban rögzített Szigetszentmiklós.
const nap29 = (id: string, fel: string, le: string): LancFuvar => ({ id, jelleg: "ber", felrakasNap: "2026-09-29", lerakasNap: "2026-09-29", felrako: fel, lerako: le, rakottKm: null });
const l29 = await lancKm([nap29("275", "Szigetszentmiklós", "Tompaládony"), nap29("284", "Téglás", "Budapest X"), ], "Nyíregyháza", tav);
eq("egy napon belül a legközelebbi felrakó jön", l29.map((x) => x.id), ["284", "275"]);
eq("így az üres km 30 + 20, nem 250 + 400", l29.reduce((a, x) => a + x.ures, 0), 50);

console.log(`üres km: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
