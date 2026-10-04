// Egy kocsi fuvarjainak sorrendje (Ma oldal, Tervezés).
// Futtatás: npx tsx scripts/teszt-napi-sorrend.ts
//
// Valós minta: Gergő (AOPU-427) 2026-10-05 — a Lösung-fuvar (#293) korábban
// lett rögzítve, mint a két saját fuvar, mégis az a nap utolsó fuvarja.

import { napiSorrend, type SorrendAdat } from "@/lib/fuvarozas2/napi-sorrend";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const ids = (l: SorrendAdat[]) => napiSorrend(l, (x) => x).map((x) => x.id);

const losung: SorrendAdat = { id: "293", felrakasNap: "2026-10-05", lerakasNap: "2026-10-06", felrako: "HU-9600 Sárvár, Ikervári út 42.", lerako: "HU-4031 Debrecen" };
const palFerr: SorrendAdat = { id: "294", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Szakoly, Rákóczi utca 26", lerako: "Tata" };
const fabrika: SorrendAdat = { id: "295", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "2890 Tata, Agráripari telep", lerako: "9662 Tompaládony, 0117/8 hrsz." };

eq("Gergő 10.05.: a több napos bérfuvar a végére", ids([losung, palFerr, fabrika]), ["294", "295", "293"]);
eq("láncolás: Tata-lerakó a Tata-felrakó elé, fordított id-nál is", ids([{ ...fabrika, id: "1" }, { ...palFerr, id: "2" }]), ["2", "1"]);
eq("lánc nélkül az id dönt", ids([{ ...losung, id: "5", lerakasNap: "2026-10-05" }, { ...palFerr, id: "3", lerako: "Győr" }]), ["3", "5"]);
eq("körbeérő lánc nem akad meg", ids([
  { id: "1", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Tata", lerako: "Győr" },
  { id: "2", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Győr", lerako: "Tata" },
]).length, 2);
eq("korábbi lerakás-nap mindig előrébb", ids([losung, { ...palFerr, felrakasNap: "2026-10-04", lerakasNap: "2026-10-04" }]), ["294", "293"]);

console.log(`napi sorrend: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
