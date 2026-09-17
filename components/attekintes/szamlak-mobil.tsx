"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { jeloltFizetve, visszavonFizetve } from "@/lib/szamlak/actions";
import type { SzamlaAlkategoria, SzamlaRow } from "@/lib/szamlak/szamla-constants";

// Az Áttekintés "Számlák" füle (mobil): felül 3 szám, alatta három fül —
// Lejárt / Következő 10 / Mappák (Fuvar, Raklap → Fabrika / Keter / Egyéb).
// Minden a nyitott számlák egyetlen listájából számolódik, így egy "Fizetve"
// jelölés mindenhol azonnal látszik.

// A pg a numeric oszlopokat (brutto) stringként adja — Number() nélkül a
// toLocaleString nem tagol.
function formatOsszeg(n: number | string, penznem: string) {
  return `${Number(n).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} ${penznem}`;
}

/** Rövid összeg a mappasorokhoz: "12,4 M Ft", "913 e Ft". */
function kompakt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} e`;
  return String(Math.round(n));
}

const VISSZAVONAS_MS = 5000;
const SZIN_FUVAR = "#3b82f6";
const SZIN_RAKLAP = "#f97316";

type Ful = "lejart" | "kovetkezo" | "mappak";
type Mappa = "fuvar" | "raklap" | SzamlaAlkategoria;

const MAPPA_CIM: Record<Mappa, string> = {
  fuvar: "Fuvar",
  raklap: "Raklap",
  fabrika: "Fabrika",
  keter: "Keter",
  egyeb: "Egyéb",
};

function mappaSzamlai(rows: SzamlaRow[], mappa: Mappa): SzamlaRow[] {
  if (mappa === "fuvar") return rows.filter((r) => r.kategoria === "fuvar");
  if (mappa === "raklap") return rows.filter((r) => r.kategoria === "raklap");
  return rows.filter((r) => r.kategoria === "raklap" && r.alkategoria === mappa);
}

type Osszegek = { ft: number; eur: number; egyeb: { penznem: string; osszeg: number }[] };

function osszegez(rows: SzamlaRow[]): Osszegek {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.penznem, (map.get(r.penznem) ?? 0) + Number(r.brutto));
  const ft = (map.get("Ft") ?? 0) + (map.get("HUF") ?? 0);
  const eur = map.get("EUR") ?? 0;
  const egyeb = [...map.entries()]
    .filter(([p]) => !["Ft", "HUF", "EUR"].includes(p))
    .map(([penznem, osszeg]) => ({ penznem, osszeg }));
  return { ft, eur, egyeb };
}

function osszegSzoveg(o: Osszegek, rovid = false): string {
  const f = (n: number, p: string) => (rovid ? `${kompakt(n)} ${p}` : formatOsszeg(n, p));
  const reszek = [];
  if (o.ft || (!o.eur && o.egyeb.length === 0)) reszek.push(f(o.ft, "Ft"));
  if (o.eur) reszek.push(f(o.eur, "EUR"));
  for (const e of o.egyeb) reszek.push(f(e.osszeg, e.penznem));
  return reszek.join(" + ");
}

function napKulonbseg(ma: string, hatarido: string): number {
  return Math.round((new Date(ma).getTime() - new Date(hatarido).getTime()) / (24 * 60 * 60 * 1000));
}

function FelsoSzam({ cim, rows, szin }: { cim: string; rows: SzamlaRow[]; szin: string }) {
  const o = osszegez(rows);
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-[var(--at-tile)] p-2">
      <span className="text-[10px] text-[var(--at-muted)]">{cim}</span>
      <span className={`truncate text-sm font-bold tabular-nums ${szin}`}>{formatOsszeg(o.ft, "Ft")}</span>
      {o.eur > 0 && (
        <span className={`truncate text-[11px] font-semibold tabular-nums ${szin}`}>+ {formatOsszeg(o.eur, "EUR")}</span>
      )}
      <span className="text-[10px] text-[var(--at-muted)]">{rows.length} számla</span>
    </div>
  );
}

function SzamlaKartya({
  row,
  ma,
  pending,
  onFizetve,
}: {
  row: SzamlaRow;
  ma: string;
  pending: boolean;
  onFizetve: (row: SzamlaRow) => void;
}) {
  const hatarido = row.fizetesi_hatarido;
  const kulonbseg = hatarido ? napKulonbseg(ma, hatarido) : null;
  const allapot =
    kulonbseg === null ? (
      <span className="text-[var(--at-muted)]">nincs határidő</span>
    ) : kulonbseg > 0 ? (
      <span className="text-[var(--at-negative)]">{kulonbseg} napja lejárt</span>
    ) : kulonbseg === 0 ? (
      <span className="text-[var(--at-negative)]">ma esedékes</span>
    ) : (
      <span className="text-[var(--at-muted)]">{-kulonbseg} nap múlva</span>
    );

  return (
    <div className="rounded-lg bg-[var(--at-tile)] p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold" title={row.vevo_nev}>
          {row.vevo_nev}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatOsszeg(row.brutto, row.penznem)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate font-mono text-[var(--at-muted)]">
          {row.szamlaszam}
          {hatarido ? ` · ${hatarido.slice(5).replace("-", ".")}` : ""}
        </span>
        <span className="shrink-0">{allapot}</span>
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

function MappaSor({
  cim,
  rows,
  ma,
  szin,
  onClick,
}: {
  cim: string;
  rows: SzamlaRow[];
  ma: string;
  szin: string;
  onClick: () => void;
}) {
  const lejart = rows.filter((r) => r.fizetesi_hatarido && r.fizetesi_hatarido < ma).length;
  return (
    <button type="button" onClick={onClick} className="flex w-full min-h-14 items-center gap-3 px-3 py-2.5 text-left">
      <Folder className="h-5 w-5 shrink-0" style={{ color: szin }} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{cim}</span>
        <span className="block text-[11px] text-[var(--at-muted)]">
          {rows.length} nyitott
          {lejart > 0 && <span className="text-[var(--at-negative)]"> · {lejart} lejárt</span>}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums">{osszegSzoveg(osszegez(rows), true)}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-muted)]" />
    </button>
  );
}

export function SzamlakMobil({ initialRows }: { initialRows: SzamlaRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [ful, setFul] = useState<Ful>("lejart");
  const [mappa, setMappa] = useState<Mappa | null>(null);
  // A mai és a +7 napos határ (Budapest) — egyszer, betöltéskor számolva.
  const [napok] = useState(() => {
    const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" });
    const most = new Date();
    return { ma: fmt.format(most), het: fmt.format(new Date(most.getTime() + 7 * 24 * 60 * 60 * 1000)) };
  });
  const { ma, het } = napok;

  // Visszavonáskor a sor az eredeti (esedékesség szerinti) helyére kerül vissza.
  const eredetiSorrend = useMemo(() => new Map(initialRows.map((r, i) => [r.id, i])), [initialRows]);

  const lejart = rows.filter((r) => r.fizetesi_hatarido && r.fizetesi_hatarido < ma);
  const kovetkezo = rows.filter((r) => !r.fizetesi_hatarido || r.fizetesi_hatarido >= ma).slice(0, 10);
  const hetenBelul = rows.filter((r) => r.fizetesi_hatarido && r.fizetesi_hatarido >= ma && r.fizetesi_hatarido <= het);

  async function handleVisszavon(row: SzamlaRow) {
    try {
      await visszavonFizetve(row.id);
    } catch {
      toast.error("Nem sikerült visszavonni.");
      return;
    }
    setRows((rs) => [...rs, row].sort((a, b) => (eredetiSorrend.get(a.id) ?? 0) - (eredetiSorrend.get(b.id) ?? 0)));
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
    toast.success(`${row.szamlaszam} fizetve.`, {
      duration: VISSZAVONAS_MS,
      action: { label: "Visszavon", onClick: () => handleVisszavon(row) },
    });
  }

  function lista(sorok: SzamlaRow[], ures: string) {
    if (sorok.length === 0) return <p className="py-4 text-center text-sm text-[var(--at-muted)]">{ures}</p>;
    return sorok.map((row) => (
      <SzamlaKartya key={row.id} row={row} ma={ma} pending={pendingId === row.id} onFizetve={handleFizetve} />
    ));
  }

  const fulek: { kulcs: Ful; cim: string }[] = [
    { kulcs: "lejart", cim: `Lejárt ${lejart.length}` },
    { kulcs: "kovetkezo", cim: "Következő 10" },
    { kulcs: "mappak", cim: "Mappák" },
  ];

  let tartalom: React.ReactNode;
  if (ful === "lejart") {
    tartalom = lista(lejart, "Nincs lejárt számla.");
  } else if (ful === "kovetkezo") {
    tartalom = lista(kovetkezo, "Nincs közelgő esedékesség.");
  } else if (mappa === null) {
    tartalom = (
      <div className="divide-y divide-[var(--at-border)] rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
        <MappaSor cim="Fuvar" rows={mappaSzamlai(rows, "fuvar")} ma={ma} szin={SZIN_FUVAR} onClick={() => setMappa("fuvar")} />
        <MappaSor cim="Raklap" rows={mappaSzamlai(rows, "raklap")} ma={ma} szin={SZIN_RAKLAP} onClick={() => setMappa("raklap")} />
      </div>
    );
  } else {
    const almappa = mappa === "fabrika" || mappa === "keter" || mappa === "egyeb";
    const sorok = mappaSzamlai(rows, mappa);
    tartalom = (
      <>
        <button
          type="button"
          onClick={() => setMappa(almappa ? "raklap" : null)}
          className="flex min-h-9 items-center gap-0.5 self-start text-xs font-medium text-[var(--at-accent)]"
        >
          <ChevronLeft className="h-4 w-4" />
          {almappa ? "Raklap" : "Mappák"}
        </button>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{almappa ? `Raklap › ${MAPPA_CIM[mappa]}` : MAPPA_CIM[mappa]}</span>
          <span className="text-xs font-semibold tabular-nums">{osszegSzoveg(osszegez(sorok))}</span>
        </div>
        {mappa === "raklap" ? (
          <div className="divide-y divide-[var(--at-border)] rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
            {(["fabrika", "keter", "egyeb"] as const).map((k) => (
              <MappaSor
                key={k}
                cim={MAPPA_CIM[k]}
                rows={mappaSzamlai(rows, k)}
                ma={ma}
                szin={SZIN_RAKLAP}
                onClick={() => setMappa(k)}
              />
            ))}
          </div>
        ) : (
          lista(sorok, "Nincs nyitott számla ebben a mappában.")
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <FelsoSzam cim="Nyitott" rows={rows} szin="text-[var(--at-text)]" />
        <FelsoSzam cim="Lejárt" rows={lejart} szin="text-[var(--at-negative)]" />
        <FelsoSzam cim="7 napon belül" rows={hetenBelul} szin="text-[var(--at-text)]" />
      </div>

      <div className="flex rounded-lg bg-[var(--at-tile)] p-1" role="tablist">
        {fulek.map((f) => {
          const aktiv = ful === f.kulcs;
          return (
            <button
              key={f.kulcs}
              type="button"
              role="tab"
              aria-selected={aktiv}
              onClick={() => {
                setFul(f.kulcs);
                setMappa(null);
              }}
              className={`min-h-9 flex-1 rounded-md text-xs transition-colors ${
                aktiv
                  ? `bg-[var(--at-card)] font-semibold ${f.kulcs === "lejart" ? "text-[var(--at-negative)]" : "text-[var(--at-text)]"}`
                  : "text-[var(--at-muted)]"
              }`}
            >
              {f.cim}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">{tartalom}</div>
    </div>
  );
}
