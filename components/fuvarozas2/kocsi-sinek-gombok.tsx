"use client";

// A „Kocsi-sínek” nézet interaktív darabjai (2026-11-18, Q5b-F terv): a havi
// kiadás/cél kézi szerkesztője és a tálca „→ kocsi” gombjai. Csak MEGLÉVŐ
// szerver-akciókat hívnak (kocsihozAdom, setFuvarJarmu) + az új havi mentést.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kocsihozAdom } from "@/lib/fuvarozas2/sajat-fuvar";
import { setFuvarJarmu } from "@/lib/fuvarozas2/megbizasok";
import { mentHaviBeallitasAction } from "@/lib/fuvarozas2/kocsi-sinek-actions";

function szamBol(s: string): number | null {
  const t = s.replace(/[^\d]/g, "");
  return t ? Number(t) : null;
}

export function HaviSzerkeszto({ ev, ho, kiadasFt, celFt }: { ev: number; ho: number; kiadasFt: number | null; celFt: number | null }) {
  const router = useRouter();
  const [nyitva, setNyitva] = useState(false);
  const [kiadas, setKiadas] = useState(kiadasFt == null ? "" : String(kiadasFt));
  const [cel, setCel] = useState(celFt == null ? "" : String(celFt));
  const [fut, start] = useTransition();

  if (!nyitva) {
    return (
      <button type="button" onClick={() => setNyitva(true)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
        ✎ kiadás · cél
      </button>
    );
  }
  const ment = () =>
    start(async () => {
      const r = await mentHaviBeallitasAction(ev, ho, szamBol(kiadas), szamBol(cel)).catch(() => ({ ok: false as const, hiba: "Nem sikerült a mentés." }));
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success("Havi kiadás és cél mentve.");
      setNyitva(false);
      router.refresh();
    });
  const mezo = "h-8 w-36 rounded-md border bg-background px-2 text-right text-sm tabular-nums";
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">Havi kiadás (Ft)
        <input inputMode="numeric" value={kiadas} onChange={(e) => setKiadas(e.target.value)} className={mezo} placeholder="pl. 3 300 000" />
      </label>
      <label className="flex items-center gap-1">Havi cél (Ft)
        <input inputMode="numeric" value={cel} onChange={(e) => setCel(e.target.value)} className={mezo} placeholder="pl. 8 500 000" />
      </label>
      <button type="button" disabled={fut} onClick={ment} className="h-8 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50">Mentés</button>
      <button type="button" disabled={fut} onClick={() => setNyitva(false)} className="h-8 rounded-md border px-3 font-semibold">Mégse</button>
    </span>
  );
}

const HUZAS_TIPUS = "application/x-wwp-fuvar";

/** Tálca-jegy: megfogható, a kocsi sínjére húzható. */
export function HuzhatoJegy({ id, jelleg, nap, children }: { id: string; jelleg: "ber" | "sajat"; nap: string; children: React.ReactNode }) {
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(HUZAS_TIPUS, JSON.stringify({ id, jelleg, nap })); e.dataTransfer.effectAllowed = "move"; }}
      className="w-56 shrink-0 cursor-grab active:cursor-grabbing"
      title="Fogd meg és húzd a kocsi sínjére"
    >
      {children}
    </li>
  );
}

/** Egy kocsi sínje mint ejtési cél: a ráejtett tálca-jegy erre a kocsira kerül (kocsihozAdom / setFuvarJarmu). */
export function SinCel({ kod, engedett, children }: { kod: string; engedett: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [felette, setFelette] = useState(false);
  const [fut, start] = useTransition();
  const huzas = (e: React.DragEvent) => engedett && e.dataTransfer.types.includes(HUZAS_TIPUS);
  return (
    <section
      aria-label={kod}
      onDragOver={(e) => { if (huzas(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setFelette(true); } }}
      onDragLeave={() => setFelette(false)}
      onDrop={(e) => {
        if (!huzas(e)) return;
        e.preventDefault();
        setFelette(false);
        let adat: { id: string; jelleg: "ber" | "sajat"; nap: string };
        try { adat = JSON.parse(e.dataTransfer.getData(HUZAS_TIPUS)); } catch { return; }
        start(async () => {
          try {
            const r = adat.jelleg === "sajat" ? await kocsihozAdom(adat.id, { jarmuKod: kod, nap: adat.nap }) : await setFuvarJarmu(adat.id, kod);
            if (!r.ok) { toast.error(r.hiba); return; }
            toast.success(`Kocsira adva: ${kod}.`);
            router.refresh();
          } catch {
            toast.error("Nem sikerült a kocsira adás.");
          }
        });
      }}
      className={"rounded-2xl bg-card/60 p-3 shadow-[var(--shadow-card)] transition " + (felette ? "ring-2 ring-primary bg-primary/5" : "") + (fut ? " opacity-60" : "")}
    >
      {felette ? <p className="mb-2 text-xs font-semibold text-primary">Engedd el: erre a kocsira kerül ({kod})</p> : null}
      {children}
    </section>
  );
}
