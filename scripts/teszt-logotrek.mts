// A Logo Trek-értelmező regressziós tesztje.
//
// Futtatás:  npx tsx scripts/teszt-logotrek.mts
//
// MIÉRT VAN EZ ITT? 2026-10-27: a Dunaharaszti–Győr megbízáson a lerakónál
// csak a város állt („GYŐR”), a teljes cím a mi MEGBÍZOTT blokkunkban, ezért a
// nyelvi modell Szakolyt írt lerakónak. A pdfjs-elemek koordinátái a valódi
// megbízásról valók (kitalált nevekkel és összeggel — a repó nyilvános).

import { kivonLogoTrekMezoket } from "@/lib/fuvarozas/import/logotrek";
import { felismerPartner } from "@/lib/fuvarozas/import/partnerek";
import type { SzovegElem } from "@/lib/fuvarozas/import/pdf-elemek";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const e = (x: number, y: number, str: string, oldal = 1): SzovegElem => ({ oldal, x, y, str });

// A MEGBÍZOTT blokk (a mi címünk) és a FELADÓ blokk magasan áll, a rakodási sor alatta.
const elemek: SzovegElem[] = [
  e(110, 587, "4234 Szakoly, Rákóczi utca 26."),
  e(373, 587, "9999 Mintavaros, Proba utca 1."),
  e(27, 424, "KISZOLGÁLTATÓ:"),
  e(110, 424, "Pelda Gyar Kft."),
  e(300, 424, "ÁTVEVŐ:"),
  e(373, 424, "Száll.szerint"),
  e(27, 411, "ÁRUKISZOLG. HELYE:"),
  e(110, 412, "1111 Peldavaros, Minta utca 104."),
  e(300, 411, "ÁRUÁTVÉT. HELYE:"),
  e(373, 411, "MINTAVÁROS"),
  e(27, 328, "Fuvardíj:"),
  e(197, 329, "75 000"),
  e(240, 329, "Ft + ÁFA"),
];

eq("felrakó, lerakó, díj a koordinátából — a saját cím NEM lerakó",
  kivonLogoTrekMezoket("", elemek),
  { felrako: "1111 Peldavaros, Minta utca 104.", lerako: "MINTAVÁROS", fuvardij: 75000, fuvardijPenznem: "Ft" });

eq("koordináta nélkül (docx/Docs) nem tippel", kivonLogoTrekMezoket("bármi", null), {});

eq("címke nélküli irat: üres", kivonLogoTrekMezoket("", [e(27, 100, "Valami más")]), {});

eq("a partner felismerése a cégnévből",
  felismerPartner("Cégnév: Logo Trek Kft.\nTelephely: 9028 Győr")?.kod, "logotrek");

console.log(`${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
