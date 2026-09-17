"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { jeloltFizetve, visszavonFizetve, type SzamlaFejlecSor } from "@/lib/szamlak/actions";
import { KATEGORIA_LABEL } from "@/lib/szamlak/szamla-constants";
import type { SzamlaRow } from "@/lib/szamlak/szamla-constants";

// A pg a numeric oszlopokat (brutto) stringként adja — Number() nélkül a
// toLocaleString a stringen nem tagol ("2057400 Ft" lett volna).
function formatOsszeg(n: number | string, penznem: string) {
  return `${Number(n).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} ${penznem}`;
}

function napjaLejart(hatarido: string | null): number {
  if (!hatarido) return 0;
  // Budapesti mai nap — a toISOString() UTC-je éjfél és 2 óra között még a tegnapot adná.
  const ma = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date());
  const napMs = 24 * 60 * 60 * 1000;
  return Math.round((new Date(ma).getTime() - new Date(hatarido).getTime()) / napMs);
}

const VISSZAVONAS_MS = 5000;

type Osszeg = { penznem: string; osszeg: number };

/** Pénznemenkénti összeg (forint elöl), nullák nélkül — ha nincs semmi, "0 Ft". */
function penznemenkent(tetelek: Osszeg[]): Osszeg[] {
  const map = new Map<string, number>();
  for (const t of tetelek) map.set(t.penznem, (map.get(t.penznem) ?? 0) + Number(t.osszeg));
  const lista = [...map.entries()]
    .filter(([, osszeg]) => Math.round(osszeg * 100) !== 0)
    .map(([penznem, osszeg]) => ({ penznem, osszeg }))
    .sort((a, b) => (a.penznem === "Ft" || a.penznem === "HUF" ? -1 : b.penznem === "Ft" || b.penznem === "HUF" ? 1 : 0));
  return lista.length > 0 ? lista : [{ penznem: "Ft", osszeg: 0 }];
}

function osszegSzoveg(lista: Osszeg[]): string {
  return lista.map((o) => formatOsszeg(o.osszeg, o.penznem)).join(" + ");
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

/** A felső 3 szám (Nyitott / Lejárt / 7 napon belül esedékes) egy csempéje. */
function FejlecCsempe({ cim, lista, alsor, szin }: { cim: string; lista: Osszeg[]; alsor: string; szin: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-[var(--at-tile)] p-2">
      <span className="text-[10px] text-[var(--at-muted)]">{cim}</span>
      <span className={`truncate text-sm font-bold tabular-nums ${szin}`}>{formatOsszeg(lista[0].osszeg, lista[0].penznem)}</span>
      {lista.slice(1).map((o) => (
        <span key={o.penznem} className={`truncate text-[11px] font-semibold tabular-nums ${szin}`}>
          + {formatOsszeg(o.osszeg, o.penznem)}
        </span>
      ))}
      <span className="text-[10px] text-[var(--at-muted)]">{alsor}</span>
    </div>
  );
}

function SzamlaSor({
  row,
  pending,
  onFizetve,
}: {
  row: SzamlaRow;
  pending: boolean;
  onFizetve: (row: SzamlaRow) => void;
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
        onClick={() => onFizetve(row)}
        className="mt-2 flex w-full min-h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--at-border)] py-1.5 text-xs font-medium text-[var(--at-accent)] disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Fizetve
      </button>
    </div>
  );
}

export function LejartSzamlaLista({
  initialRows,
  fejlec,
}: {
  initialRows: SzamlaRow[];
  fejlec: SzamlaFejlecSor[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [nyitva, setNyitva] = useState<Set<string>>(new Set());
  // Ebben a nézetben fizetettre jelölt számlák (id → sor) — a Nyitott / 7 napos
  // összegekből ezeket levonjuk, visszavonáskor visszakerülnek.
  const [fizetettek, setFizetettek] = useState<Map<string, SzamlaRow>>(new Map());
  // A mai és a +7 napos határ (Budapest) — egyszer, betöltéskor számolva.
  const [napok] = useState(() => {
    const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" });
    const most = new Date();
    return { ma: fmt.format(most), het: fmt.format(new Date(most.getTime() + 7 * 24 * 60 * 60 * 1000)) };
  });

  // Visszavonáskor a sor az eredeti (esedékesség szerinti) helyére kerül vissza.
  const eredetiSorrend = useMemo(() => new Map(initialRows.map((r, i) => [r.id, i])), [initialRows]);

  async function handleVisszavon(row: SzamlaRow) {
    try {
      await visszavonFizetve(row.id);
    } catch {
      toast.error("Nem sikerült visszavonni.");
      return;
    }
    setRows((rs) =>
      [...rs, row].sort((a, b) => (eredetiSorrend.get(a.id) ?? 0) - (eredetiSorrend.get(b.id) ?? 0))
    );
    setFizetettek((m) => {
      const uj = new Map(m);
      uj.delete(row.id);
      return uj;
    });
    toast.success("Visszavonva.");
  }

  async function handleFizetve(row: SzamlaRow) {
    setPendingId(row.id);
    try {
      await jeloltFizetve(row.id);
    } catch {
      toast.error("Nem sikerült fizetve-nek jelölni.");
      return;
    } finally {
      setPendingId(null);
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setFizetettek((m) => new Map(m).set(row.id, row));
    toast.success(`${row.szamlaszam} fizetve.`, {
      duration: VISSZAVONAS_MS,
      action: { label: "Visszavon", onClick: () => handleVisszavon(row) },
    });
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

  // A lejártat a (frissen fizetettre jelöltek nélküli) sorokból számoljuk; a
  // nyitottat és a 7 naposat a szerver összegzéséből, a most fizetettek levonásával.
  const { ma, het } = napok;
  const levonando = [...fizetettek.values()];
  const nyitott = penznemenkent([
    ...fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.nyitott_osszeg })),
    ...levonando.map((r) => ({ penznem: r.penznem, osszeg: -Number(r.brutto) })),
  ]);
  const nyitottDarab = fejlec.reduce((s, f) => s + Number(f.nyitott_darab), 0) - levonando.length;
  const lejart = penznemenkent(rows.map((r) => ({ penznem: r.penznem, osszeg: Number(r.brutto) })));
  const hetenBelulLevonando = levonando.filter(
    (r) => r.fizetesi_hatarido && r.fizetesi_hatarido >= ma && r.fizetesi_hatarido <= het
  );
  const hetenBelul = penznemenkent([
    ...fejlec.map((f) => ({ penznem: f.penznem, osszeg: f.het_osszeg })),
    ...hetenBelulLevonando.map((r) => ({ penznem: r.penznem, osszeg: -Number(r.brutto) })),
  ]);
  const hetDarab = fejlec.reduce((s, f) => s + Number(f.het_darab), 0) - hetenBelulLevonando.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <FejlecCsempe cim="Nyitott" lista={nyitott} alsor={`${nyitottDarab} számla`} szin="text-[var(--at-text)]" />
        <FejlecCsempe cim="Lejárt" lista={lejart} alsor={`${rows.length} számla`} szin="text-[var(--at-negative)]" />
        <FejlecCsempe cim="7 napon belül" lista={hetenBelul} alsor={`${hetDarab} számla`} szin="text-[var(--at-text)]" />
      </div>

      <h2 className="text-sm font-semibold">Lejárt számlák</h2>

      {csoportok.length === 0 && (
        <p className="text-sm text-[var(--at-muted)]">Nincs lejárt esedékességű, nyitott számla.</p>
      )}

      {csoportok.map((cs) => {
        const cegOsszeg = osszegSzoveg(
          penznemenkent(cs.szamlak.map((r) => ({ penznem: r.penznem, osszeg: Number(r.brutto) })))
        );

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
              className="flex w-full min-h-9 items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" title={cs.vevoNev}>
                  {cs.vevoNev}
                </span>
                <span className="block text-xs font-medium tabular-nums text-[var(--at-negative)]">{cegOsszeg}</span>
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
