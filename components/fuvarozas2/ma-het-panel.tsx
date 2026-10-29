"use client";

// Ma + hét lap (redesign 5): a jobb panel fülei — Most dönts · Ajánlatok · Rés.
// A tartalmat a szerver rendeli (ma-het.tsx), itt csak a fülváltás van.
// Fuvarozás-jog nélkül (elszámolás hatókör) csak a „Most dönts” látszik.

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelFul = "dont" | "ajanlat" | "res";

export function MaHetPanel({ kezdo, dont, ajanlat, res, dontDb, ajanlatDb, resDb, teljes }: {
  kezdo: PanelFul;
  dont: ReactNode;
  ajanlat: ReactNode;
  res: ReactNode;
  dontDb: number;
  ajanlatDb: number;
  resDb: number;
  /** Fuvarozás-joggal minden fül; nélküle csak a „Most dönts”. */
  teljes: boolean;
}) {
  const [ful, setFul] = useState<PanelFul>(teljes ? kezdo : "dont");
  const fulek: { k: PanelFul; cimke: string; db: number; tartalom: ReactNode }[] = [
    { k: "dont", cimke: "Most dönts", db: dontDb, tartalom: dont },
    ...(teljes
      ? [
          { k: "ajanlat" as const, cimke: "Ajánlatok", db: ajanlatDb, tartalom: ajanlat },
          { k: "res" as const, cimke: "Rés", db: resDb, tartalom: res },
        ]
      : []),
  ];
  return (
    <aside className="flex max-h-[80vh] min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] xl:max-h-none" aria-label="Teendők és ajánlatok">
      <div className="flex shrink-0 gap-1 border-b border-foreground/10 p-2" role="tablist" aria-label="Panel">
        {fulek.map((f) => (
          <button
            key={f.k}
            type="button"
            role="tab"
            id={`ma-het-ful-${f.k}`}
            aria-selected={ful === f.k}
            aria-controls={`ma-het-tartalom-${f.k}`}
            onClick={() => setFul(f.k)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
              ful === f.k ? "bg-primary text-primary-foreground shadow-[var(--glow-primary)] [background-image:var(--grad-primary)]" : "text-[#6E6E73] hover:bg-muted"
            )}
          >
            {f.cimke}
            {f.k === "res" || f.db > 0 ? (
              <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", ful === f.k ? "bg-white/25" : "bg-muted")}>{f.db}</span>
            ) : null}
          </button>
        ))}
      </div>
      {fulek.map((f) => (
        <div
          key={f.k}
          role="tabpanel"
          id={`ma-het-tartalom-${f.k}`}
          aria-labelledby={`ma-het-ful-${f.k}`}
          hidden={ful !== f.k}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {f.tartalom}
        </div>
      ))}
    </aside>
  );
}
