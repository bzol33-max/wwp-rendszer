// Ma oldal · N1 kocsikártya: figyelmeztető szalag és tachó-csík (docs/ma-n1-terv.md).
// Futtatás: npx tsx scripts/teszt-ma-kartya.ts

import { kocsiJelzesek, tachoCsik, type JelzesBemenet } from "@/lib/fuvarozas2/ma-kartya-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const A: JelzesBemenet = {
  elteresek: [], vanMaiFuvar: true, vanHolnapiFuvar: true, holnapFolytatodik: false,
  tavolletMa: null, tavolletHolnap: null, egeszNaposMa: false, egeszNaposHolnap: false, maPihenonap: false, holnapCimke: "Holnap",
};
const J = (b: Partial<JelzesBemenet>) => kocsiJelzesek({ ...A, ...b });

eq("minden rendben → nincs szalag", J({}), []);
eq("eltérés badge · hely", J({ elteresek: [{ szin: "amber", badge: "késés 35 p", hely: "Debrecen lerakó" }] }), [{ szin: "amber", szoveg: "késés 35 p · Debrecen lerakó" }]);
eq("hely nélkül csak badge", J({ elteresek: [{ szin: "red", badge: "csúszik", hely: null }] }), [{ szin: "red", szoveg: "csúszik" }]);
eq("ma nincs fuvar", J({ vanMaiFuvar: false }), [{ szin: "amber", szoveg: "Ma nincs fuvar — keress" }]);
eq("pihenőnapon nincs „ma nincs fuvar”", J({ vanMaiFuvar: false, maPihenonap: true }), []);
eq("egész napos bejegyzés ma → nincs „ma nincs fuvar”", J({ vanMaiFuvar: false, egeszNaposMa: true }), []);
eq("holnapra nincs fuvar", J({ vanHolnapiFuvar: false }), [{ szin: "amber", szoveg: "Holnapra még nincs fuvar" }]);
eq("hétfőre nincs fuvar (pénteken)", J({ vanHolnapiFuvar: false, holnapCimke: "Hétfő" }), [{ szin: "amber", szoveg: "Hétfőre még nincs fuvar" }]);
eq("folytatódó fuvar → holnap nem üres", J({ vanHolnapiFuvar: false, holnapFolytatodik: true }), []);
eq("egész napos holnap → nem üres", J({ vanHolnapiFuvar: false, egeszNaposHolnap: true }), []);
eq("holnap szabadság, nincs fuvar", J({ vanHolnapiFuvar: false, tavolletHolnap: "szabadsag" }), [{ szin: "amber", szoveg: "Holnap szabadság (Jelenlét) — ne tervezz" }]);
eq("holnap szabadság, de van fuvar → piros", J({ tavolletHolnap: "szabadsag" }), [{ szin: "red", szoveg: "Holnap szabadság (Jelenlét) — de van fuvar" }]);
eq("holnap beteg + folytatódó → piros", J({ vanHolnapiFuvar: false, holnapFolytatodik: true, tavolletHolnap: "beteg" }), [{ szin: "red", szoveg: "Holnap betegszabadság (Jelenlét) — de van fuvar" }]);
eq("ma szabadság, nincs fuvar", J({ vanMaiFuvar: false, tavolletMa: "szabadsag" }), [{ szin: "amber", szoveg: "Ma szabadság (Jelenlét)" }]);
eq("ma beteg, de van fuvar", J({ tavolletMa: "beteg" }), [{ szin: "red", szoveg: "Ma betegszabadság (Jelenlét) — de van mai fuvar" }]);
const sor = J({ vanMaiFuvar: false, elteresek: [{ szin: "amber", badge: "várakozik 20 p", hely: "Sárvár felrakó" }, { szin: "red", badge: "késés 1:10 ó", hely: "Bp lerakó" }] });
eq("piros elöl, a többi sorrendje marad", sor.map((x) => x.szoveg), ["késés 1:10 ó · Bp lerakó", "várakozik 20 p · Sárvár felrakó", "Ma nincs fuvar — keress"]);

eq("tachó 5:40 → 63%", tachoCsik(340), 63);
eq("tachó null", tachoCsik(null), null);
eq("tachó túl nagy → 100", tachoCsik(700), 100);
eq("tachó negatív → 0", tachoCsik(-5), 0);
eq("tachó NaN", tachoCsik(Number.NaN), null);

console.log(`teszt-ma-kartya: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
