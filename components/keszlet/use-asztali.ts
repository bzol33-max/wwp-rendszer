"use client";

import { useSyncExternalStore } from "react";

// Redesign 3: az új asztali Készlet-elrendezések md (768 px) fölött élnek,
// alatta a régi, egymás alatti mobil sorrend marad. Csak az egyik ágat
// rendereljük (nem CSS-sel rejtjük), hogy a kbNav ne találjon rejtett,
// duplikált mezőt, és a mobil nézet DOM-ja ne változzon.
export function useAsztali() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false
  );
}
