"use client";

import { useState } from "react";
import Link from "next/link";
import type { BerOsszesito, CsempeSzin } from "@/lib/fuvarozas2/ma-vaszon";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";

const SZIN_ERTEK: Record<CsempeSzin, string> = {
  normal: "text-foreground",
  amber: "text-[var(--f2-amb)]",
  red: "text-[var(--f2-red)]",
  mint: "text-[var(--f2-mint)]",
};

// Csempesor a fejléc alatt (1-es látványterv, 2026-09-29): tíz hely egy
// sorban — Budaházi Zoltán sorban ad mindegyiknek funkciót. Az 1. hely a
// havi, a 2. a heti bérfuvar (D terv, alacsony változat); a havira kattintva
// alatta lenyílik a hónap heteinek sora. A többi hely egyelőre üres. Egy hely
// kitöltése: a CSEMPE_HELYEK megfelelő elemét cseréld
// { cimke, ertek, also?, szin, href? }-re. Telefonon oldalra húzható.
// Kliens-komponens a lenyitás miatt.
type CsempeHely = { cimke: string; ertek: string; also?: string; szin: CsempeSzin; href?: string } | null;
/** A 3–10. hely. */
const CSEMPE_HELYEK: CsempeHely[] = [null, null, null, null, null, null, null, null];
const CSEMPE_OSZT = "flex min-h-[76px] w-[132px] shrink-0 snap-start flex-col rounded-xl md:w-auto";

const rovidFt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(".", ",")} M` : n >= 1000 ? `${Math.round(n / 1000)} e` : String(Math.round(n));
const eur = (n: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} €`;

/** 1–2. csempe: a hónapban / héten kezdett bérfuvarok nettó díja, kocsinként; az euró külön. */
function BerCsempe({ b, onClick, nyitva }: { b: BerOsszesito; onClick?: () => void; nyitva?: boolean }) {
  const max = Math.max(...b.kocsik.map((k) => k.ft), 1);
  const belso = (
    <>
      <div className="flex flex-col bg-[var(--f2-mint)] px-2.5 py-1 text-white">
        <span className="truncate text-[10px] leading-tight opacity-90">Bérfuvar · {b.cim}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
          <b className="text-base font-bold tabular-nums">{rovidFt(b.ft)} Ft</b>
          {b.eur > 0 ? <span className="text-[10px] font-semibold tabular-nums">+ {eur(b.eur)}</span> : null}
        </span>
      </div>
      <div className="flex flex-col gap-px px-2.5 py-1">
        {b.kocsik.map((k, i) => {
          const ures = k.ft === 0 && k.eur === 0;
          return (
            <div key={i} className={`flex items-center gap-1 text-[10px] leading-tight ${ures ? "text-muted-foreground" : ""}`} title={k.eur > 0 ? `${k.nev}: ${rovidFt(k.ft)} Ft + ${eur(k.eur)}` : undefined}>
              <span className="w-8 shrink-0 truncate">{k.nev}</span>
              <span className="h-[4px] min-w-0 flex-1 rounded-full bg-foreground/10">
                {k.ft > 0 ? (
                  <span className={`block h-[4px] rounded-full ${k.szin ? JARMU_SZIN_DOT_CLASS[k.szin] : "bg-foreground/40"}`} style={{ width: `${Math.max(4, Math.round((k.ft / max) * 100))}%` }} />
                ) : null}
              </span>
              <b className="shrink-0 font-semibold tabular-nums">{ures ? "—" : k.ft > 0 ? rovidFt(k.ft) : ""}{k.eur > 0 ? " +€" : ""}</b>
            </div>
          );
        })}
      </div>
    </>
  );
  const oszt = `${CSEMPE_OSZT} overflow-hidden border bg-card text-left`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={nyitva} className={`${oszt} ${nyitva ? "border-[var(--f2-mint)] ring-1 ring-[var(--f2-mint)]" : "border-foreground/10 hover:border-[var(--f2-mint)]"}`}>
      {belso}
    </button>
  ) : (
    <div className={`${oszt} border-foreground/10`}>{belso}</div>
  );
}

export function Csempesor({ berHavi, berHeti, berHonapHetei }: { berHavi: BerOsszesito; berHeti: BerOsszesito; berHonapHetei: BerOsszesito[] }) {
  const [hetekNyitva, setHetekNyitva] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 flex snap-x items-stretch gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-10">
        <BerCsempe b={berHavi} onClick={() => setHetekNyitva((x) => !x)} nyitva={hetekNyitva} />
        <BerCsempe b={berHeti} />
        {CSEMPE_HELYEK.map((c, i) => {
          const oszt = `${CSEMPE_OSZT} gap-0.5 px-3 py-2.5`;
          if (!c) {
            return (
              <div key={i} className={`${oszt} items-start justify-between border border-dashed border-foreground/15 text-muted-foreground/60`}>
                <span className="text-[11px] tabular-nums">{i + 3}.</span>
              </div>
            );
          }
          const belso = (
            <>
              <span className="text-xs text-muted-foreground">{c.cimke}</span>
              <b className={`text-xl font-semibold tabular-nums ${SZIN_ERTEK[c.szin]}`}>{c.ertek}</b>
              {c.also ? <span className="truncate text-[11px] text-muted-foreground">{c.also}</span> : null}
            </>
          );
          return c.href ? (
            <Link key={i} href={c.href} className={`${oszt} border border-foreground/10 bg-card hover:bg-muted`}>{belso}</Link>
          ) : (
            <div key={i} className={`${oszt} border border-foreground/10 bg-card`}>{belso}</div>
          );
        })}
      </div>
      {hetekNyitva ? (
        <div className="-mx-4 flex snap-x items-stretch gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-10">
          {berHonapHetei.map((h) => <BerCsempe key={h.cim} b={h} />)}
        </div>
      ) : null}
    </div>
  );
}
