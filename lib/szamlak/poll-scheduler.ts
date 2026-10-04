// A szerver-folyamat élettartama alatt fut, óránként helyett 15 percenként,
// de csak reggel 6 és este 10 óra között (Europe/Budapest) — éjjel nincs
// új számla, felesleges kérdezgetni. A `instrumentation.ts` indítja a
// szerver induláskor.

import { futtatSzamlaSzinkron } from "./poll";
import { futtatRendszerkent } from "@/lib/auth/system-context";
import { egyetlenPeldanyban, ZAR_KULCS } from "@/lib/db";

const INTERVALL_MS = 15 * 60 * 1000;
const KEZDET_ORA = 6;
const VEG_ORA = 22; // kizárólag eddig — 22:00 után már nem fut

let inditva = false;

function budapestOra(): number {
  return Number(
    new Intl.DateTimeFormat("hu-HU", {
      timeZone: "Europe/Budapest",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
}

async function tick() {
  const ora = budapestOra();
  if (ora < KEZDET_ORA || ora >= VEG_ORA) return;
  try {
    const zar = await egyetlenPeldanyban(ZAR_KULCS.szamlaSzinkron, () =>
      futtatRendszerkent("szamla-szinkron", futtatSzamlaSzinkron)
    );
    if (!zar.futott) return; // a másik példány épp szinkronizál
    const eredmeny = zar.eredmeny;
    if (
      eredmeny.ujMegtalalt ||
      eredmeny.pendingMegoldva ||
      eredmeny.rendelesszamJavitva ||
      eredmeny.szamlaSzamParositva ||
      eredmeny.szallitolevelUj ||
      eredmeny.hibak.length
    ) {
      console.log(
        `[szamlak-poll] új: ${eredmeny.ujMegtalalt}, pending megoldva: ${eredmeny.pendingMegoldva}, rendelésszám javítva: ${eredmeny.rendelesszamJavitva ?? 0}, fuvarhoz párosítva: ${eredmeny.szamlaSzamParositva ?? 0}, szállítólevél: ${eredmeny.szallitolevelUj ?? 0} új / ${eredmeny.szallitolevelParositva ?? 0} párosítva, hibák: ${eredmeny.hibak.length ? eredmeny.hibak.join(" | ") : "—"}`
      );
    }
  } catch (err) {
    console.error("[szamlak-poll] váratlan hiba:", err);
  }
}

export function inditSzamlaPollScheduler() {
  if (inditva) return;
  inditva = true;
  // Az első futás kicsit késleltetve, hogy ne versenyezzen a szerver
  // induláskori egyéb munkájával.
  setTimeout(tick, 15_000);
  setInterval(tick, INTERVALL_MS);
  console.log("[szamlak-poll] ütemező elindítva (15 percenként, 6:00–22:00 között).");
}
