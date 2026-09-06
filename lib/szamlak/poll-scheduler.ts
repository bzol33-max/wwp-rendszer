// A szerver-folyamat élettartama alatt fut, óránként helyett 15 percenként,
// de csak reggel 6 és este 10 óra között (Europe/Budapest) — éjjel nincs
// új számla, felesleges kérdezgetni. A `instrumentation.ts` indítja a
// szerver induláskor.

import { futtatSzamlaSzinkron } from "./poll";

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
    const eredmeny = await futtatSzamlaSzinkron();
    if (eredmeny.ujMegtalalt || eredmeny.pendingMegoldva || eredmeny.hibak.length) {
      console.log(
        `[szamlak-poll] új: ${eredmeny.ujMegtalalt}, pending megoldva: ${eredmeny.pendingMegoldva}, hibák: ${eredmeny.hibak.length ? eredmeny.hibak.join(" | ") : "—"}`
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
