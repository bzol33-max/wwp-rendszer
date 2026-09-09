"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
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

type CegCsoport = { vevoNev: string; szamlak: SzamlaRow[] };

// A bejövő sorok már esedékesség szerint rendezettek (getOsszesLejartSzamla) —
// cégenkénti csoportosításnál az első előfordulás sorrendje megmarad, így a
// legrégebben lejárt tétellel rendelkező cég csoportja kerül elsőnek.
function cegenkentCsoportosit(rows: SzamlaRow[]): CegCsoport[] {
  const csoportok: CegCsoport[] = [];
  const indexByNev = new Map<string, number>();
  for (const row of rows) {
    const idx = indexByNev.get(row.vevo_nev);
    if (idx === undefined) {
      indexByNev.set(row.vevo_nev, csoportok.length);
      csoportok.push({ vevoNev: row.vevo_nev, szamlak: [row] });
    } else {
      csoportok[idx].szamlak.push(row);
    }
  }
  return csoportok;
}

function SzamlaSor({
  row,
  pending,
  onFizetve,
}: {
  row: SzamlaRow;
  pending: boolean;
  onFizetve: (id: string) => void;
}) {
  return (
    <div className="rounded-lg bg-[var(--at-tile)] p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-[var(--at-text)]" title={row.szamlaszam}>
          {row.szamlaszam}
        </span>
        <span className="shrink-0 rounded bg-[var(--at-card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-muted)]">
          {KATEGORIA_LABEL[row.kategoria]}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-[var(--at-negative)]">
          {napjaLejart(row.fizetesi_hatarido)} napja lejárt ({row.fizetesi_hatarido})
        </span>
        <span className="font-medium tabular-nums text-[var(--at-text)]">{formatOsszeg(row.brutto, row.penznem)}</span>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => onFizetve(row.id)}
        className="mt-2 flex w-full min-h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--at-border)] py-1.5 text-xs font-medium text-[var(--at-accent)] disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Fizetve
      </button>
    </div>
  );
}

export function LejartSzamlaLista({ initialRows }: { initialRows: SzamlaRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [nyitva, setNyitva] = useState<Set<string>>(new Set());

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

  function toggleNyitva(vevoNev: string) {
    setNyitva((prev) => {
      const next = new Set(prev);
      if (next.has(vevoNev)) next.delete(vevoNev);
      else next.add(vevoNev);
      return next;
    });
  }

  const csoportok = useMemo(() => cegenkentCsoportosit(rows), [rows]);

  if (csoportok.length === 0) {
    return <p className="text-sm text-[var(--at-muted)]">Nincs lejárt esedékességű, nyitott számla.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {csoportok.map((cs) => {
        // Egyetlen számlájú cégnél nincs értelme becsukni — rögtön látszik.
        if (cs.szamlak.length === 1) {
          return (
            <div key={cs.vevoNev} className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-3">
              <span className="mb-2 block truncate text-sm font-semibold" title={cs.vevoNev}>
                {cs.vevoNev}
              </span>
              <SzamlaSor row={cs.szamlak[0]} pending={pendingId === cs.szamlak[0].id} onFizetve={handleFizetve} />
            </div>
          );
        }

        const kinyitva = nyitva.has(cs.vevoNev);
        return (
          <div key={cs.vevoNev} className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-3">
            <button
              type="button"
              onClick={() => toggleNyitva(cs.vevoNev)}
              className="flex w-full min-h-9 items-center justify-between gap-2"
            >
              <span className="truncate text-sm font-semibold" title={cs.vevoNev}>
                {cs.vevoNev}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-[var(--at-tile)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-muted)]">
                  {cs.szamlak.length} számla
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--at-muted)] transition-transform ${kinyitva ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {kinyitva && (
              <div className="mt-2 flex flex-col gap-2">
                {cs.szamlak.map((row) => (
                  <SzamlaSor key={row.id} row={row} pending={pendingId === row.id} onFizetve={handleFizetve} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
