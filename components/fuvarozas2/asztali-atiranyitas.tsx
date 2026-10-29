"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redesign 5: a régi `/fuvarozas2/tervezes?het=…&res=…` linkek az asztali nézetben
 * az új Ma + hét lapra mennek (768 px-től). Telefonon a régi Hét nézet marad,
 * ezért az átirányítás csak a képernyő szélességén múlik (szerveren nem látszik).
 */
export function AsztaliAtiranyitas({ cel }: { cel: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) router.replace(cel, { scroll: false });
  }, [cel, router]);
  return null;
}
