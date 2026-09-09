"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import type { FelvasarlasTipusSor } from "@/lib/attekintes/actions";

export function HaviFelvasarlasButton({ tipusok }: { tipusok: FelvasarlasTipusSor[] }) {
  const [nyitva, setNyitva] = useState(false);

  if (tipusok.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setNyitva(true)}
        className="mx-4 mb-2 flex min-h-9 items-center gap-1.5 self-start rounded-md border border-[var(--at-border)] bg-[var(--at-tile)] px-2.5 py-1.5 text-xs font-medium text-[var(--at-text)]"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Havi felvásárlás
      </button>

      {nyitva && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--at-bg)] text-[var(--at-text)]">
          <div className="flex items-center justify-between border-b border-[var(--at-border)] px-4 py-3">
            <h2 className="text-sm font-semibold">Havi felvásárlás típusonként</h2>
            <button
              type="button"
              onClick={() => setNyitva(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--at-muted)] hover:text-[var(--at-text)]"
              aria-label="Bezárás"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
              {tipusok.map((t) => (
                <div key={t.tipus} className="rounded-lg bg-[var(--at-tile)] p-2.5">
                  <div className="text-[11px] text-[var(--at-muted)]">{t.tipus}</div>
                  <div className="text-xl font-bold tabular-nums text-[var(--at-positive)]">+{t.qty}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
