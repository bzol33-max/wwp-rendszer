"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// A Megbízások oldalon a fuvar részlete jobbról becsúszó lapon nyílik
// (Budaházi Zoltán, 2026-09-30): a két oszlop mögötte marad, bezárva ott
// folytatod, ahol voltál. Bezárás: × gomb, a sötétített háttér, vagy Esc.
// A lap az URL-ből él (?reszlet=…), így a link megosztható és a Vissza gomb is működik.

export function ReszletLap({ bezarHref, cim, children }: { bezarHref: string; cim: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const billentyu = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(bezarHref, { scroll: false });
    };
    window.addEventListener("keydown", billentyu);
    return () => window.removeEventListener("keydown", billentyu);
  }, [bezarHref, router]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={cim}>
      <Link href={bezarHref} scroll={false} aria-label="A részlet bezárása" className="absolute inset-0 bg-black/25" />
      <div className="relative flex h-full w-full max-w-[600px] flex-col gap-3 overflow-y-auto bg-background p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-base font-bold">{cim}</h2>
          <Link href={bezarHref} scroll={false} className="shrink-0 rounded-lg border border-foreground/15 bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted">
            × bezár
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
