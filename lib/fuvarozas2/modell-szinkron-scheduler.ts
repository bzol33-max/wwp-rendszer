// Utánpótlás-kör: azok a megbízások, amelyeknek nincs megállójuk.
//
// Az import már maga hívja a `frissitsdFuvarozas2Modellt`-et (lásd ott, miért
// kellett), de a 2026-09-20 előtt keletkezett sorokat és a kézi úton bevitt
// fuvarokat valakinek be kell érnie. Óránként fut, felső korláttal — ha nincs
// mit tenni, egyetlen olcsó lekérdezés.

import { potoldAHianyzoModelleket } from "@/lib/fuvarozas2/modell-szinkron";
import { futtatRendszerkent } from "@/lib/auth/system-context";

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
}

export function inditModellSzinkronScheduler() {
  if (inditva) return;
  inditva = true;
  setTimeout(tick, 60_000);
  setInterval(tick, INTERVALL_MS);
  console.log("[modell-szinkron] ütemező elindítva (óránként).");
}
