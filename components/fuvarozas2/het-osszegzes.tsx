"use client";

// Hét nézet B1 (A2 terv): heti / havi összefoglaló az oldalsáv tetején,
// a getKihasznaltsag() adatából, kocsinként a kocsi színében.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { KihasznaltsagAdat } from "@/lib/fuvarozas2/kihasznaltsag";
import { kocsiSzin } from "@/lib/fuvarozas2/kocsi-szin";

const ezerFt = (x: number) => (Math.abs(x) >= 1_000_000 ? `${(x / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} M` : `${Math.round(x / 1000).toLocaleString("hu-HU")} e`);

export function HetOsszegzes({ adat }: { adat: KihasznaltsagAdat }) {
  const [mit, setMit] = useState<"het" | "honap">("het");
  const sorok = adat.kocsik.map((k) => ({ kod: k.kod, nev: k.nev, szin: k.szin, s: k[mit] }));
  const berFt = sorok.reduce((a, k) => a + k.s.berBevetelFt, 0);
  const eur = sorok.reduce((a, k) => a + k.s.atvaltatlanEur, 0);
  const fizetos = sorok.reduce((a, k) => a + k.s.fizetosNapok, 0);
  const munka = sorok.reduce((a, k) => a + k.s.munkanapok, 0);
  const rakott = sorok.reduce((a, k) => a + k.s.rakottKm, 0);
  const ures = sorok.reduce((a, k) => a + k.s.uresKm, 0);
  const uresArany = rakott + ures > 0 ? Math.round((ures / (rakott + ures)) * 100) : null;
  const max = Math.max(1, ...sorok.map((k) => k.s.berBevetelFt));
  const cim = mit === "het" ? adat.het.cim : adat.honap.cim;
  if (!sorok.length) return null;

  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Időszak">
        {(["het", "honap"] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={mit === x} onClick={() => setMit(x)}
            className={cn("h-8 rounded-full px-3 text-xs", mit === x ? "bg-[var(--f2-dark)] text-white" : "ring-1 ring-foreground/15 hover:bg-muted")}>
            {x === "het" ? "hét" : "hónap"}
          </button>
        ))}
        <span className="ml-auto truncate text-xs text-muted-foreground">{cim}</span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Bérfuvar bevétel</div>
      <div className="text-[26px] font-bold leading-tight tracking-tight text-primary tabular-nums">
        {ezerFt(berFt)} Ft{eur > 0 ? <span className="text-base"> + {Math.round(eur).toLocaleString("hu-HU")} €</span> : null}
      </div>
      {eur > 0 ? <div className="text-[11px] text-muted-foreground">az € rész árfolyam nélkül, nincs a Ft-ban</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/60 px-3 py-2"><div className="text-[11px] text-muted-foreground">fizetős kocsinap</div><b className="text-lg tabular-nums">{fizetos} / {munka}</b></div>
        <div className="rounded-xl bg-muted/60 px-3 py-2"><div className="text-[11px] text-muted-foreground">üres km</div><b className="text-lg tabular-nums">{uresArany == null ? "—" : `${uresArany} %`}</b></div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <div className="text-xs font-semibold">Kocsinként</div>
        {sorok.map((k) => {
          const sz = kocsiSzin(k.szin);
          const ures = k.s.berBevetelFt === 0 && k.s.atvaltatlanEur === 0 && k.s.sajatDb === 0;
          return (
            <div key={k.kod} className={cn("grid grid-cols-[76px_minmax(0,1fr)_72px] items-center gap-2 text-xs", ures && "text-muted-foreground")}>
              <span className="flex items-center gap-1.5 truncate"><span className="size-2 shrink-0 rounded-full" style={{ background: sz.c }} />{k.nev}</span>
              <span className="h-2 rounded-full bg-muted">
                <span className="block h-2 rounded-full" style={{ width: `${(k.s.berBevetelFt / max) * 100}%`, background: sz.c }} />
              </span>
              <span className="text-right tabular-nums">{ures ? "—" : `${ezerFt(k.s.berBevetelFt)}${k.s.atvaltatlanEur > 0 ? "+€" : ""}`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
