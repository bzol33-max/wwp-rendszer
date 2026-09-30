// Utánpótlás-kör: azok a megbízások, amelyeknek nincs megállójuk.
//
// Az import már maga hívja a `frissitsdFuvarozas2Modellt`-et (lásd ott, miért
// kellett), de a 2026-09-20 előtt keletkezett sorokat és a kézi úton bevitt
// fuvarokat valakinek be kell érnie. Óránként fut, felső korláttal — ha nincs
// mit tenni, egyetlen olcsó lekérdezés. Ugyanez a kör pótolja a bérfuvarok
// rakott km-ét (lib/fuvarozas2/rakott-km.ts) és a nyitott bérmegbízások
// tárolt kalkulációját (lib/fuvarozas2/kalkulacio-tar.ts, Tervezés).

import { potoldAHianyzoModelleket } from "@/lib/fuvarozas2/modell-szinkron";
import { potoldRakottKmet } from "@/lib/fuvarozas2/rakott-km";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { frissitsKalkulaciokat, tervezettBerMegbizasok } from "@/lib/fuvarozas2/kalkulacio-tar";

const INTERVALL_MS = 60 * 60 * 1000;
const KORLAT = 50;

let inditva = false;

async function tick() {
  try {
    const eredmeny = await futtatRendszerkent("modell-szinkron", () => potoldAHianyzoModelleket(KORLAT));
    if (eredmeny.erintett > 0) {
      console.log(`[modell-szinkron] utánpótolva: ${eredmeny.erintett} megbízás, ${eredmeny.megallo} megálló.`);
    }
  } catch (err) {
    console.error("[modell-szinkron] váratlan hiba:", err);
  }
  // A bérfuvarok rakott km-e (Ma oldal, havi km-díj csempe) — ugyanitt, óránként.
  try {
    const km = await futtatRendszerkent("rakott-km", () => potoldRakottKmet());
    if (km.szamolt + km.hibas > 0) console.log(`[rakott-km] ${km.szamolt} fuvar km-e kiszámolva, ${km.hibas} nem számolható.`);
  } catch (err) {
    console.error("[rakott-km] váratlan hiba:", err);
  }
  // A nyitott bérmegbízások tárolt kalkulációja (Tervezés) — hogy az oldal csak olvasson.
  try {
    const k = await futtatRendszerkent("kalkulacio", async () => frissitsKalkulaciokat(await tervezettBerMegbizasok()));
    if (k.szamolt + k.hibas > 0) console.log(`[kalkulacio-tar] ${k.szamolt} kalkuláció frissítve, ${k.hibas} nem számolható.`);
  } catch (err) {
    console.error("[kalkulacio-tar] váratlan hiba:", err);
  }
}

export function inditModellSzinkronScheduler() {
  if (inditva) return;
  inditva = true;
  setTimeout(tick, 60_000);
  setInterval(tick, INTERVALL_MS);
  console.log("[modell-szinkron] ütemező elindítva (óránként).");
}
