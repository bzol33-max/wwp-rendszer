"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { jeloltFizetve, visszavonFizetve } from "@/lib/szamlak/actions";
import { ALKATEGORIA_LABEL, FIZETVE_NAPOK_MOBIL as FIZETVE_NAPOK, KATEGORIA_LABEL, type SzamlaRow } from "@/lib/szamlak/szamla-constants";

// Az Áttekintés "Számlák" füle (mobil) — "Áttekintő mátrix" elrendezés:
// felül egy összecsukható táblázat (sorok: mappák, oszlopok: állapotok),
// bármelyik számra koppintva az a lista jön; a számláknál nagy, kerek Fizetve
// gomb; a kereső lent, a hüvelykujj alatt.

type Mappa = "mind" | "fuvar" | "fabrika" | "keter" | "egyeb";
type Allapot = "lejart" | "het" | "nyitott" | "fizetve";

const MAPPA_SOROK: Mappa[] = ["fuvar", "fabrika", "keter", "egyeb", "mind"];
const ALLAPOT_OSZLOPOK: { kulcs: Allapot; cim: string }[] = [
  { kulcs: "lejart", cim: "Lejárt" },
  { kulcs: "het", cim: "7 nap" },
  { kulcs: "nyitott", cim: "Nyitott" },
  { kulcs: "fizetve", cim: "Fizetve" },
];
const ALLAPOT_CIM: Record<Allapot, string> = {
  lejart: "Lejárt",
  het: "7 napon belül",
  nyitott: "Összes nyitott",
  fizetve: `Kifizetve (${FIZETVE_NAPOK} nap)`,
};
const MAPPA_CIM: Record<Mappa, string> = {
  mind: "Összesen",
  fuvar: "Fuvar",
  fabrika: "Fabrika",
  keter: "Keter",
  egyeb: "Egyéb",
};

// Állapotszínek: a téma negatív/akcent színe mellé egy borostyán a "7 napon belül"-höz.
const SZIN_LEJART = "var(--at-negative)";
const SZIN_HET = "#9a6700";
const SZIN_FIZETVE = "#1f7a5c";
const ALLAPOT_SZIN: Record<Allapot, string> = {
  lejart: SZIN_LEJART,
  het: SZIN_HET,
  nyitott: "var(--at-text)",
  fizetve: SZIN_FIZETVE,
};
const MAPPA_SZIN: Record<Mappa, string> = {
  mind: "var(--at-text)",
  fuvar: "#2563eb",
  fabrika: "#ea7a12",
  keter: "#ea7a12",
  egyeb: "#ea7a12",
};

// A pg a numeric oszlopokat (brutto) stringként adja — Number() nélkül a toLocaleString nem tagol.
function formatOsszeg(n: number | string, penznem: string) {
  return `${Number(n).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} ${penznem}`;
}

function osszegSzoveg(rows: SzamlaRow[]): string {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.penznem, (map.get(r.penznem) ?? 0) + Number(r.brutto));
  const ft = (map.get("Ft") ?? 0) + (map.get("HUF") ?? 0);
  map.delete("Ft");
  map.delete("HUF");
  return [formatOsszeg(ft, "Ft"), ...[...map.entries()].filter(([, o]) => o !== 0).map(([p, o]) => formatOsszeg(o, p))].join(" + ");
}

function mappaban(rows: SzamlaRow[], mappa: Mappa): SzamlaRow[] {
  if (mappa === "mind") return rows;
  if (mappa === "fuvar") return rows.filter((r) => r.kategoria === "fuvar");
  return rows.filter((r) => r.kategoria === "raklap" && r.alkategoria === mappa);
}

function napKulonbseg(ma: string, datum: string): number {
  return Math.round((new Date(ma).getTime() - new Date(datum).getTime()) / (24 * 60 * 60 * 1000));
}

function rovidDatum(iso: string): string {
  return iso.slice(5, 10).replace("-", ".");
}

function SzamlaSor({
  row,
  ma,
  het,
  mostFizetett,
  pending,
  onFizetve,
  onVisszavon,
}: {
  row: SzamlaRow;
  ma: string;
  het: string;
  mostFizetett: boolean;
  pending: boolean;
  onFizetve: (row: SzamlaRow) => void;
  onVisszavon: (row: SzamlaRow) => void;
}) {
  const hatarido = row.fizetesi_hatarido;
  let allapot: { szoveg: string; szin: string };
  if (mostFizetett) allapot = { szoveg: "most fizetve", szin: SZIN_FIZETVE };
  else if (row.fizetve) allapot = { szoveg: row.fizetve_datum ? `fizetve ${rovidDatum(row.fizetve_datum)}` : "fizetve", szin: SZIN_FIZETVE };
  else if (!hatarido) allapot = { szoveg: "nincs határidő", szin: "var(--at-muted)" };
  else if (hatarido < ma) allapot = { szoveg: `${napKulonbseg(ma, hatarido)} napja lejárt`, szin: SZIN_LEJART };
  else if (hatarido === ma) allapot = { szoveg: "ma esedékes", szin: SZIN_HET };
  else if (hatarido <= het) allapot = { szoveg: `${-napKulonbseg(ma, hatarido)} nap múlva`, szin: SZIN_HET };
  else allapot = { szoveg: `esedékes ${rovidDatum(hatarido)}`, szin: "var(--at-muted)" };

  const kategoria = row.alkategoria ? ALKATEGORIA_LABEL[row.alkategoria] : KATEGORIA_LABEL[row.kategoria];
  const halvany = row.fizetve || mostFizetett;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] py-2 pl-3 pr-2 ${halvany ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate font-semibold" title={row.vevo_nev}>
            {row.vevo_nev}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">{formatOsszeg(row.brutto, row.penznem)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
          <span style={{ color: allapot.szin }}>{allapot.szoveg}</span>
          <span className="truncate font-mono text-[var(--at-muted)]">
            {row.szamlaszam} · {kategoria}
          </span>
        </div>
      </div>
      {row.fizetve && !mostFizetett ? (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#e3f2ec", color: SZIN_FIZETVE }}
          aria-label="Fizetve"
        >
          <Check className="h-5 w-5" />
        </span>
      ) : mostFizetett ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onVisszavon(row)}
          aria-label="Fizetve visszavonása"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          style={{ background: "#e3f2ec", color: SZIN_FIZETVE }}
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => onFizetve(row)}
          aria-label="Fizetve"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
          style={{ background: SZIN_FIZETVE }}
        >
          <Check className="h-5 w-5" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

export function SzamlakMobil({ nyitott, fizetett }: { nyitott: SzamlaRow[]; fizetett: SzamlaRow[] }) {
  // Ebben a nézetben fizetettre jelölt (eredetileg nyitott) számlák — a helyükön
  // maradnak halványítva, visszavonás-gombbal; a mátrixban már a Fizetve oszlopban számolódnak.
  const [mostFizetett, setMostFizetett] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mappa, setMappa] = useState<Mappa>("mind");
  const [allapot, setAllapot] = useState<Allapot>("lejart");
  const [kereses, setKereses] = useState("");
  const [matrixNyitva, setMatrixNyitva] = useState(true);
  const [kifizetveNyitva, setKifizetveNyitva] = useState(false);
  // A mai és a +7 napos határ (Budapest) — egyszer, betöltéskor számolva.
  const [napok] = useState(() => {
    const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" });
    const most = new Date();
    return { ma: fmt.format(most), het: fmt.format(new Date(most.getTime() + 7 * 24 * 60 * 60 * 1000)) };
  });
  const { ma, het } = napok;

  const valodiNyitott = nyitott.filter((r) => !mostFizetett.has(r.id));
  const valodiFizetett = [...nyitott.filter((r) => mostFizetett.has(r.id)), ...fizetett];

  /** Az állapot szerinti lista; a most fizetettre jelöltek a nyitott-alapú listákban a helyükön maradnak. */
  function allapotLista(a: Allapot, szamlalashoz: boolean): SzamlaRow[] {
    const alap = szamlalashoz ? valodiNyitott : nyitott;
    if (a === "fizetve") return valodiFizetett;
    if (a === "nyitott") return alap;
    if (a === "lejart") return alap.filter((r) => r.fizetesi_hatarido && r.fizetesi_hatarido < ma);
    return alap.filter((r) => r.fizetesi_hatarido && r.fizetesi_hatarido >= ma && r.fizetesi_hatarido <= het);
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
    setMostFizetett((s) => new Set(s).add(row.id));
    toast.success(`${row.szamlaszam} fizetve.`);
  }

  async function handleVisszavon(row: SzamlaRow) {
    setPendingId(row.id);
    try {
      await visszavonFizetve(row.id);
    } catch {
      toast.error("Nem sikerült visszavonni.");
      return;
    } finally {
      setPendingId(null);
    }
    setMostFizetett((s) => {
      const uj = new Set(s);
      uj.delete(row.id);
      return uj;
    });
    toast.success("Visszavonva.");
  }

  const q = kereses.trim().toLowerCase();
  const lista = q
    ? mappaban(
        [...nyitott, ...fizetett].filter(
          (r) => r.vevo_nev.toLowerCase().includes(q) || r.szamlaszam.toLowerCase().includes(q)
        ),
        mappa
      )
    : mappaban(allapotLista(allapot, false), mappa);
  const listaCim = q
    ? `Keresés: „${kereses.trim()}”${mappa !== "mind" ? ` · ${MAPPA_CIM[mappa]}` : ""}`
    : `${ALLAPOT_CIM[allapot]}${mappa !== "mind" ? ` · ${MAPPA_CIM[mappa]}` : ""}`;
  const kifizetveBlokk = !q && mappa !== "mind" && allapot !== "fizetve" ? mappaban(fizetett, mappa) : null;

  const sor = (row: SzamlaRow) => (
    <SzamlaSor
      key={row.id}
      row={row}
      ma={ma}
      het={het}
      mostFizetett={mostFizetett.has(row.id)}
      pending={pendingId === row.id}
      onFizetve={handleFizetve}
      onVisszavon={handleVisszavon}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => setMatrixNyitva((v) => !v)}
          className="flex min-h-9 w-full items-center justify-between px-1 text-sm font-semibold"
          aria-expanded={matrixNyitva}
        >
          Áttekintés
          <ChevronDown className={`h-4 w-4 text-[var(--at-muted)] transition-transform ${matrixNyitva ? "rotate-180" : ""}`} />
        </button>
        {matrixNyitva && (
          <>
            <div className="grid grid-cols-[4.5rem_repeat(4,1fr)] items-center gap-0.5 text-xs">
              <span />
              {ALLAPOT_OSZLOPOK.map((o) => (
                <span key={o.kulcs} className="text-center text-[10px] font-medium" style={{ color: ALLAPOT_SZIN[o.kulcs] }}>
                  {o.cim}
                </span>
              ))}
              {MAPPA_SOROK.map((m) => (
                <MatrixSor
                  key={m}
                  mappa={m}
                  aktivMappa={q ? null : mappa}
                  aktivAllapot={allapot}
                  darab={(a) => mappaban(allapotLista(a, true), m).length}
                  onValaszt={(a) => {
                    setMappa(m);
                    setAllapot(a);
                    setKereses("");
                    setKifizetveNyitva(false);
                  }}
                />
              ))}
            </div>
            <p className="px-1 pb-0.5 pt-1 text-[10px] text-[var(--at-muted)]">Koppints egy számra a listához</p>
          </>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-sm font-semibold" style={{ color: q ? "var(--at-text)" : ALLAPOT_SZIN[allapot] }}>
          {listaCim}
        </span>
        <span className="shrink-0 text-xs text-[var(--at-muted)]">
          {lista.length} db · <span className="font-semibold text-[var(--at-text)]">{osszegSzoveg(lista)}</span>
        </span>
      </div>

      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--at-muted)]">{q ? "Nincs találat." : "Nincs ilyen számla."}</p>
      ) : (
        lista.map(sor)
      )}

      {kifizetveBlokk && (
        <>
          <button
            type="button"
            onClick={() => setKifizetveNyitva((v) => !v)}
            className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-3 text-sm font-semibold"
            style={{ color: SZIN_FIZETVE }}
            aria-expanded={kifizetveNyitva}
          >
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              {MAPPA_CIM[mappa]} – kifizetve ({kifizetveBlokk.length})
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${kifizetveNyitva ? "rotate-180" : ""}`} />
          </button>
          {kifizetveNyitva && kifizetveBlokk.map(sor)}
        </>
      )}

      {/* Kereső lent, a hüvelykujj alatt — a fix alsó fülsáv fölé ragad. */}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 bg-[var(--at-bg)] px-4 py-2">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--at-muted)]" />
          <input
            type="search"
            value={kereses}
            onChange={(e) => setKereses(e.target.value)}
            placeholder="Keresés: cég vagy sorszám"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--at-muted)]"
          />
          {kereses && (
            <button type="button" onClick={() => setKereses("")} aria-label="Keresés törlése" className="text-[var(--at-muted)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MatrixSor({
  mappa,
  aktivMappa,
  aktivAllapot,
  darab,
  onValaszt,
}: {
  mappa: Mappa;
  aktivMappa: Mappa | null;
  aktivAllapot: Allapot;
  darab: (a: Allapot) => number;
  onValaszt: (a: Allapot) => void;
}) {
  const osszesen = mappa === "mind";
  const almappa = mappa === "fabrika" || mappa === "keter" || mappa === "egyeb";
  return (
    <>
      <span
        className={`truncate text-xs ${osszesen ? "border-t border-[var(--at-border)] pt-1 font-semibold" : ""}`}
        style={{ color: MAPPA_SZIN[mappa] }}
      >
        {almappa ? "↳ " : ""}
        {MAPPA_CIM[mappa]}
      </span>
      {ALLAPOT_OSZLOPOK.map((o) => {
        const n = darab(o.kulcs);
        const aktiv = aktivMappa === mappa && aktivAllapot === o.kulcs;
        return (
          <button
            key={o.kulcs}
            type="button"
            onClick={() => onValaszt(o.kulcs)}
            className={`min-h-9 rounded-md text-center text-sm font-semibold tabular-nums ${osszesen ? "mt-1" : ""}`}
            style={
              aktiv
                ? { background: ALLAPOT_SZIN[o.kulcs], color: "#fff" }
                : { color: n ? ALLAPOT_SZIN[o.kulcs] : "var(--at-border)" }
            }
            aria-pressed={aktiv}
          >
            {n}
          </button>
        );
      })}
    </>
  );
}
