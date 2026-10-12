// A Ma oldal közös segédei (lib/fuvarozas2/ma-het.ts). Futtatás: npx tsx scripts/teszt-ma-het.ts

import { hetNapjai, jarmuNev, kocsiHelykitolto, pihenoNapE } from "@/lib/fuvarozas2/ma-het";
import { megbizoMegjelenites } from "@/lib/fuvarozas/fuvar-constants";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const napok = hetNapjai("2026-10-05");
eq("hétfőn az aktuális hét", napok.map((n) => n.nap), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
eq("napcímke", napok[0].cimke, "Hétfő 5.");
eq("ma jelölve", napok.map((n) => n.ma), [true, false, false, false, false]);
eq("szerdán is ez a hét", hetNapjai("2026-10-07")[0].nap, "2026-10-05");
eq("szombaton már a következő hét", hetNapjai("2026-10-10")[0].nap, "2026-10-12");
eq("vasárnap is a következő hét", hetNapjai("2026-10-11")[0].nap, "2026-10-12");
eq("helykitöltő: GPS nélküli, fuvaros kocsi látszik", kocsiHelykitolto({ vanGps: false, vanRendszam: false, vanFuvar: true }), null);
eq("helykitöltő: fuvar és rendszám nélkül még nem üzemel", kocsiHelykitolto({ vanGps: false, vanRendszam: false, vanFuvar: false }), "még nem üzemel");
eq("helykitöltő: rendszámos kocsi nem helykitöltő", kocsiHelykitolto({ vanGps: false, vanRendszam: true, vanFuvar: false }), null);
eq("helykitöltő: GPS-es kocsi", kocsiHelykitolto({ vanGps: true, vanRendszam: true, vanFuvar: false }), null);
eq("pihenőnap: rossz dátum nem az", [pihenoNapE(null), pihenoNapE("2026-10-11x")], [false, false]);
// Saját árunál a megbízó mindig a Well-Worn Pallet.
eq("megbízó: saját, partner nélkül", megbizoMegjelenites("sajat", null), "Well-Worn Pallet");
eq("megbízó: saját, vevővel", megbizoMegjelenites("sajat", "Fabrika 2000 Kft"), "Well-Worn Pallet → Fabrika 2000 Kft");
eq("megbízó: saját, a saját cég névváltozata", megbizoMegjelenites("sajat", "Well Worn Pallett Kft."), "Well-Worn Pallet");
eq("megbízó: bér", megbizoMegjelenites("ber", "ÁB SPEED Kft."), "ÁB SPEED Kft.");
eq("megbízó: bér, nincs", megbizoMegjelenites("ber", "  "), "(nincs megbízó)");
eq("pihenőnap: vasárnap igen, szombat nem", [pihenoNapE("2026-10-11"), pihenoNapE("2026-10-10")], [true, false]);
eq("név: kód a címkében", jarmuNev({ kod: "AOPU-427", cimke: "AOPU-427/AOTY-474" }), "AOPU-427/AOTY-474");
eq("név: kód + címke", jarmuNev({ kod: "JANI", cimke: "DAF XG (gyártás alatt)" }), "JANI · DAF XG (gyártás alatt)");
eq("név: címke nélkül a kód", jarmuNev({ kod: "QAT-101", cimke: "" }), "QAT-101");
eq("név: kód nélkül a címke", jarmuNev({ kod: null, cimke: "3. kocsi" }), "3. kocsi");

console.log(`Ma segédek: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
