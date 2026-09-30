// A szerver-folyamat élettartama alatt fut, 5 percenként (2026-09-30 óta;
// korábban 15 — a Ma oldal eltérései ennyit késhettek a valóságtól), egész nap — a
// szamlak-poll-scheduler.ts mintáját követve, de NAPSZAK-KORLÁTOZÁS NÉLKÜL:
// a fuvarok kiszállítása (és így a GPS-alapú "Teljesítve" jelölés) nem áll
// meg üzleti órákon kívül. A `instrumentation.ts` indítja a szerver
// induláskor.

import { futtatTeljesitesFigyeles } from "./teljesites-figyeles";
import { futtatRendszerkent } from "@/lib/auth/system-context";

const INTERVALL_MS = 5 * 60 * 1000;

let inditva = false;

async function tick() {
  try {
    const eredmeny = await futtatRendszerkent("teljesites-figyeles", futtatTeljesitesFigyeles);
    if (eredmeny.automatikusanTeljesitve || eredmeny.hibak.length) {
      console.log(
        `[teljesites-figyeles] vizsgált: ${eredmeny.vizsgalt}, automatikusan teljesítve: ${eredmeny.automatikusanTeljesitve}, hibák: ${
          eredmeny.hibak.length ? eredmeny.hibak.join(" | ") : "—"
        }`
      );
    }
  } catch (err) {
    console.error("[teljesites-figyeles] váratlan hiba:", err);
  }
}

export function inditTeljesitesFigyelesScheduler() {
  if (inditva) return;
  inditva = true;
  // Az első futás kicsit késleltetve, hogy ne versenyezzen a szerver
  // induláskori egyéb munkájával.
  setTimeout(tick, 30_000);
  setInterval(tick, INTERVALL_MS);
  console.log("[teljesites-figyeles] ütemező elindítva (5 percenként).");
}
