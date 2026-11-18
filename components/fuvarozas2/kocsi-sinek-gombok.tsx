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

/** Tálca-jegy alatt: egy gomb kocsinként. Saját fuvar → kocsihozAdom (nap: a felrakás napja vagy ma); bér → setFuvarJarmu. */
export function KocsiraGombok({ id, jelleg, nap, kocsik }: { id: string; jelleg: "ber" | "sajat"; nap: string; kocsik: { kod: string; cimke: string }[] }) {
  const router = useRouter();
  const [fut, start] = useTransition();
  const ad = (kod: string) =>
    start(async () => {
      try {
        const r = jelleg === "sajat" ? await kocsihozAdom(id, { jarmuKod: kod, nap }) : await setFuvarJarmu(id, kod);
        if (!r.ok) { toast.error(r.hiba); return; }
        toast.success(`Kocsira adva: ${kod}.`);
        router.refresh();
      } catch {
        toast.error("Nem sikerült a kocsira adás.");
      }
    });
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {kocsik.map((k) => (
        <button key={k.kod} type="button" disabled={fut} onClick={() => ad(k.kod)} title={k.cimke}
          className="h-6 rounded-md border bg-background px-2 text-[11px] font-semibold hover:border-primary hover:text-primary disabled:opacity-50">
          → {k.kod}
        </button>
      ))}
    </div>
  );
}
