"use client";

import { useState } from "react";
import { Wallet, X } from "lucide-react";

function formatFt(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

export function KasszaEgyenlegCard({
  egyenleg,
  havi,
}: {
  egyenleg: number;
  havi: { bevetel: number; kiadas: number };
}) {
  const [nyitva, setNyitva] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setNyitva(true)}
        className="flex items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4 text-left"
      >
        <div className="flex items-center gap-1.5 text-xs text-[var(--at-muted)]">
          <Wallet className="h-4 w-4" />
          Kassza egyenleg
        </div>
        <div
          className={`text-2xl font-bold tabular-nums ${egyenleg < 0 ? "text-[var(--at-negative)]" : ""}`}
        >
          {formatFt(egyenleg)}
        </div>
      </button>

      {nyitva && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--at-bg)] text-[var(--at-text)]">
          <div className="flex items-center justify-between border-b border-[var(--at-border)] px-4 py-3">
            <h2 className="text-sm font-semibold">Havi be- és kifizetés</h2>
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
            <div className="mx-auto flex max-w-md flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
                <span className="text-xs text-[var(--at-muted)]">Havi befizetés</span>
                <span className="text-xl font-bold tabular-nums text-[var(--at-positive)]">
                  +{formatFt(havi.bevetel)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
                <span className="text-xs text-[var(--at-muted)]">Havi kifizetés</span>
                <span className="text-xl font-bold tabular-nums text-[var(--at-negative)]">
                  {formatFt(havi.kiadas)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
