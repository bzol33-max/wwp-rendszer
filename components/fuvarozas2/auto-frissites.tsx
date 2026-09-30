"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * A Ma oldal magától frissül: percenként (amíg a fül látszik), és azonnal,
 * amikor a fülre visszaváltasz. A „frissítve” idő a szerver adatának ideje.
 */
export function AutoFrissites({ frissitve, intervallMs = 60_000 }: { frissitve: string; intervallMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let utolso = Date.now();
    const frissit = () => {
      if (document.visibilityState !== "visible") return;
      utolso = Date.now();
      router.refresh();
    };
    const idozito = window.setInterval(frissit, intervallMs);
    // Visszaváltáskor csak akkor, ha legalább 15 mp telt el (ne duplázzon).
    const lathato = () => {
      if (document.visibilityState === "visible" && Date.now() - utolso > 15_000) frissit();
    };
    document.addEventListener("visibilitychange", lathato);
    window.addEventListener("focus", lathato);
    return () => {
      window.clearInterval(idozito);
      document.removeEventListener("visibilitychange", lathato);
      window.removeEventListener("focus", lathato);
    };
  }, [router, intervallMs]);
  return <span className="text-[11px] text-muted-foreground tabular-nums">frissítve {frissitve} · percenként magától</span>;
}
