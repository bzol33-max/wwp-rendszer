// A szerver-folyamat élettartama alatt fut, 5 percenként (2026-09-30 óta;
// korábban 15 — a Ma oldal eltérései ennyit késhettek a valóságtól), egész nap — a
// szamlak-poll-scheduler.ts mintáját követve, de NAPSZAK-KORLÁTOZÁS NÉLKÜL:
// a fuvarok kiszállítása (és így a GPS-alapú "Teljesítve" jelölés) nem áll
// meg üzleti órákon kívül. A `instrumentation.ts` indítja a szerver
// induláskor.

import { futtatTeljesitesFigyeles, rogzitEletjelet, type TeljesitesFigyelesEredmeny } from "./teljesites-figyeles";
import { maszkoltUzenet } from "@/lib/ecofleet/kliens";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { egyetlenPeldanyban, ZAR_KULCS } from "@/lib/db";

const INTERVALL_MS = 5 * 60 * 1000;

let inditva = false;

async function tick() {
  try {
    // Az életjel (rendszer_eletjel) a zár alatt, minden lefutott kör végén
    // íródik — akkor is, ha a kör hibával állt meg (a hibát az adatba írja).
    // A rogzitEletjelet soha nem dob. Ha a zár foglalt, a másik példány írja.
    const zar = await egyetlenPeldanyban(ZAR_KULCS.teljesitesFigyeles, async () => {
      let eredmeny: TeljesitesFigyelesEredmeny;
      try {
        eredmeny = await futtatRendszerkent("teljesites-figyeles", futtatTeljesitesFigyeles);
      } catch (err) {
        await rogzitEletjelet({
          vizsgalt: 0,
          automatikusanTeljesitve: 0,
          hibak: [maszkoltUzenet(err instanceof Error ? `${err.name}: ${err.message}` : String(err))],
        });
        throw err;
      }
      await rogzitEletjelet(eredmeny);
      return eredmeny;
    });
    if (!zar.futott) return; // az előző kör (vagy a másik példány) még fut
    const eredmeny = zar.eredmeny;
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
