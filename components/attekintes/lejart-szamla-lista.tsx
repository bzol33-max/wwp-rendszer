"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { jeloltFizetve } from "@/lib/szamlak/actions";
import { KATEGORIA_LABEL } from "@/lib/szamlak/szamla-constants";
import type { SzamlaRow } from "@/lib/szamlak/szamla-constants";

function formatOsszeg(n: number, penznem: string) {
  return `${n.toLocaleString("hu-HU")} ${penznem}`;
}

function napjaLejart(hatarido: string | null): number {
  if (!hatarido) return 0;
  const ma = new Date().toISOString().slice(0, 10);
  const napMs = 24 * 60 * 60 * 1000;
  return Math.round((new Date(ma).getTime() - new Date(hatarido).getTime()) / napMs);
}

export function LejartSzamlaLista({ initialRows }: { initialRows: SzamlaRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleFizetve(id: string) {
    setPendingId(id);
    try {
      await jeloltFizetve(id);
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success("Számla fizetve-nek jelölve.");
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--at-muted)]">Nincs lejárt esedékességű, nyitott számla.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium" title={row.vevo_nev}>
              {row.vevo_nev}
            </span>
            <span className="shrink-0 rounded bg-[var(--at-tile)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-muted)]">
              {KATEGORIA_LABEL[row.kategoria]}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-[var(--at-negative)]">
              {napjaLejart(row.fizetesi_hatarido)} napja lejárt ({row.fizetesi_hatarido})
            </span>
            <span className="font-medium tabular-nums text-[var(--at-text)]">
              {formatOsszeg(row.brutto, row.penznem)}
            </span>
          </div>
          <button
            type="button"
            disabled={pendingId === row.id}
            onClick={() => handleFizetve(row.id)}
            className="mt-2 flex w-full min-h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--at-border)] py-1.5 text-xs font-medium text-[var(--at-accent)] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Fizetve
          </button>
        </div>
      ))}
    </div>
  );
}
