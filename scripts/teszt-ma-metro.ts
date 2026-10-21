import { aktualisEsKovetkezo, dijSzoveg, flottaFogyasztas, fogyasztasElteres, kocsiAzElejen, metroElemek } from "@/lib/fuvarozas2/ma-metro-alap";
import type { TukorSor } from "@/lib/fuvarozas2/ma-tukor";

let hiba = 0;
const eq = (nev: string, kapott: unknown, vart: unknown) => {
  const ok = JSON.stringify(kapott) === JSON.stringify(vart);
  if (!ok) { hiba++; console.log(`✗ ${nev}\n  kapott: ${JSON.stringify(kapott)}\n  várt:   ${JSON.stringify(vart)}`); } else console.log(`✓ ${nev}`);
};
const m = (fuvarId: string, felLe: "felrako" | "lerako", varos: string, allapot: "kesz" | "most" | "kovetkezo" | "hatra", teny: string | null = null): TukorSor => ({
  tipus: "megallo", fuvarId, felLe, varos, terv: null, teny, elteres: null, allapot, kiemelt: null, allas: null, ceg: null, kontaktNev: null, telefon: null,
});
const f = (fuvarId: string, hivatkozas: string | null): TukorSor => ({ tipus: "fuvar", fuvarId, partner: "P" + fuvarId, hivatkozas, jelleg: "ber" });

// Gergő 10.21.: Tata→Tompaládony kész, Osli felrakva, Debrecen felé úton.
const gergo: TukorSor[] = [
  f("a", "329"), m("a", "felrako", "Tata", "kesz", "06:10"), m("a", "lerako", "Tompaládony", "kesz", "08:05"),
  f("b", "330"), m("b", "felrako", "Osli", "kesz", "11:05"), m("b", "lerako", "Debrecen", "kovetkezo", "ETA 04:51"),
];
const el = metroElemek(gergo);
eq("elemek: 4 megálló + 3 szakasz", el.map((e) => e.tipus), ["megallo", "szakasz", "megallo", "szakasz", "megallo", "szakasz", "megallo"]);
eq("Tata→Tompaládony rakott, kész", el[1], { tipus: "szakasz", rakott: true, kesz: true, kocsiItt: false });
eq("Tompaládony→Osli üres", (el[3] as { rakott: boolean }).rakott, false);
eq("Osli→Debrecen: a kocsi itt", el[5], { tipus: "szakasz", rakott: true, kesz: false, kocsiItt: true });
eq("jel a fuvar első megállóján", el.filter((e) => e.tipus === "megallo").map((e) => (e as { jel: string | null }).jel), ["#329", null, "#330", null]);
const ak = aktualisEsKovetkezo(gergo, ["c"]);
eq("aktuális = #330", ak.aktualis?.fuvarId, "b");
eq("aktuális állapot", ak.aktualis?.allapot, "rakottan úton");
eq("aktuális fel/le", [ak.aktualis?.fel, ak.aktualis?.le], [{ varos: "Osli", ido: "11:05", kesz: true }, { varos: "Debrecen", ido: "ETA 04:51", kesz: false }]);
eq("következő = holnapi első", [ak.kovetkezo?.fuvarId, ak.kovetkezo?.holnap], ["c", true]);
eq("nincs holnapi → null", aktualisEsKovetkezo(gergo, []).kovetkezo, null);

// Két mai nyitott fuvar: a következő a mai második.
const ketto: TukorSor[] = [f("a", null), m("a", "felrako", "A", "most"), m("a", "lerako", "B", "hatra"), f("b", null), m("b", "felrako", "C", "hatra"), m("b", "lerako", "D", "hatra")];
const ak2 = aktualisEsKovetkezo(ketto, ["x"]);
eq("most a felrakón", ak2.aktualis?.allapot, "felrakón");
eq("következő a mai második", [ak2.kovetkezo?.fuvarId, ak2.kovetkezo?.holnap], ["b", false]);
eq("most-nál nincs kocsi a szakaszon", metroElemek(ketto).some((e) => e.tipus === "szakasz" && e.kocsiItt), false);

// Minden kész.
const kesz: TukorSor[] = [f("a", null), m("a", "felrako", "A", "kesz"), m("a", "lerako", "B", "kesz")];
const ak3 = aktualisEsKovetkezo(kesz, []);
eq("ma kész", [ak3.aktualis, ak3.maKesz], [null, true]);
eq("üres nap", aktualisEsKovetkezo([], ["h"]).maKesz, false);

// Még el sem indult.
const indul: TukorSor[] = [f("a", null), m("a", "felrako", "A", "kovetkezo"), m("a", "lerako", "B", "hatra")];
eq("a kocsi a vonal elején", kocsiAzElejen(metroElemek(indul)), true);
eq("felrakásra megy", aktualisEsKovetkezo(indul, []).aktualis?.allapot, "felrakásra megy");

// Állás a vonalon.
const allas: TukorSor[] = [f("a", null), m("a", "felrako", "A", "kesz"), { tipus: "allas", allas: { percek: 60, cim: null, tol: "11:31", ig: "12:31", folyamatban: true, rogzites: null } }, m("a", "lerako", "B", "kovetkezo")];
eq("állás elem", metroElemek(allas)[1], { tipus: "allas", szoveg: "áll 11:31 óta" });

eq("díj Ft", dijSzoveg("190000", "HUF"), "190 000 Ft");
eq("díj EUR", dijSzoveg(1250, "eur"), "1 250 €");
eq("díj nincs", dijSzoveg(null, "HUF"), null);
eq("díj 0", dijSzoveg("0", null), null);
eq("flotta 10.21.", flottaFogyasztas([{ canL100: 23.9, canKm: 1571 }, { canL100: 29.8, canKm: 1775 }]), 27);
eq("flotta kevés km", flottaFogyasztas([{ canL100: 30, canKm: 50 }]), null);
eq("flotta null l100 kimarad", flottaFogyasztas([{ canL100: null, canKm: 900 }, { canL100: 25, canKm: 400 }]), 25);
eq("eltérés +10 %", fogyasztasElteres(29.8, 27), 10);
eq("eltérés kicsi → null", fogyasztasElteres(27.5, 27), null);
eq("eltérés −11 %", fogyasztasElteres(23.9, 27), -11);

if (hiba) { console.log(`\n${hiba} hiba`); process.exit(1); }
console.log("\nma-metro: minden rendben");
