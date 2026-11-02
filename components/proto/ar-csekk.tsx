"use client";

import { useState, useTransition } from "react";
import { protoArCsekk, type ArValasz } from "@/lib/proto/akciok";
import { ft, napCimke, szam } from "@/components/proto/format";
import { ArPirula } from "@/components/proto/ar-pirula";

export function ArCsekkUrlap() {
  const [honnan, setHonnan] = useState("");
  const [hova, setHova] = useState("");
  const [partner, setPartner] = useState("");
  const [dij, setDij] = useState("");
  const [penznem, setPenznem] = useState<"Ft" | "EUR">("Ft");
  const [valasz, setValasz] = useState<ArValasz | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const [fut, indit] = useTransition();

  const kuld = (e: React.FormEvent) => {
    e.preventDefault();
    setHiba(null);
    const d = dij.trim() ? Number(dij.replace(/\s/g, "").replace(",", ".")) : null;
    if (d != null && !Number.isFinite(d)) { setHiba("A díjhoz számot írj."); return; }
    indit(async () => {
      try {
        setValasz(await protoArCsekk({ honnan, hova, partner, dij: d, penznem }));
      } catch {
        setHiba("Nem sikerült a számolás. Próbáld újra.");
      }
    });
  };

  const mezo = "h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base md:h-9 md:text-sm";
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3">
      <div><h2 className="font-semibold">Mennyiért vállald?</h2><p className="text-xs text-muted-foreground">Telefonhoz: a saját fuvarjaid árához mér. Nem ment semmit.</p></div>
      <form onSubmit={kuld} className="grid grid-cols-2 gap-2">
        <input required value={honnan} onChange={(e) => setHonnan(e.target.value)} placeholder="Honnan" aria-label="Honnan" className={mezo} />
        <input required value={hova} onChange={(e) => setHova(e.target.value)} placeholder="Hová" aria-label="Hová" className={mezo} />
        <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Partner (nem kötelező)" aria-label="Partner" className={`${mezo} col-span-2`} />
        <input value={dij} onChange={(e) => setDij(e.target.value)} inputMode="decimal" placeholder="Ajánlott díj" aria-label="Ajánlott díj" className={mezo} />
        <select value={penznem} onChange={(e) => setPenznem(e.target.value as "Ft" | "EUR")} aria-label="Pénznem" className={mezo}><option>Ft</option><option>EUR</option></select>
        <button disabled={fut} className="col-span-2 h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 md:h-9">{fut ? "Számolás…" : "Megnézem"}</button>
      </form>
      {hiba && <p className="text-sm text-red-700">{hiba}</p>}
      {valasz && !fut && (
        <div className="grid gap-1.5 text-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <ArPirula itelet={valasz.csekk.itelet} />
            {valasz.csekk.ftKm != null && <span className="tabular-nums">{szam(valasz.csekk.ftKm)} Ft/km</span>}
            {valasz.csekk.alapFtKm != null && <span className="text-xs text-muted-foreground">{valasz.csekk.alap}: {szam(valasz.csekk.alapFtKm)} Ft/km</span>}
          </div>
          {valasz.csekk.viszonylat.utolso
            ? <p>Ezen a viszonylaton {valasz.csekk.viszonylat.db} fuvarod volt, a szokásos díj {ft(valasz.csekk.viszonylat.medianDij)}. Legutóbb {valasz.csekk.viszonylat.utolso.partner}, {ft(valasz.csekk.viszonylat.utolso.dijFt)}, {napCimke(valasz.csekk.viszonylat.utolso.nap)}.</p>
            : <p className="text-muted-foreground">Ezen a viszonylaton még nem volt fuvarod.</p>}
          {valasz.km != null
            ? <p className="text-muted-foreground">Kb. {szam(valasz.km)} rakott km, üres út nélkül.</p>
            : <p className="text-amber-800">A távolság nem számolható, nézd meg a címeket.</p>}
          {valasz.letra && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Önköltség {ft(valasz.letra.onkoltsegFt)}:</span>
              {valasz.letra.fokok.map((f) => <span key={f.szazalek} className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">+{f.szazalek}%: {ft(f.ft)}{f.eur != null ? ` · ${szam(f.eur)} €` : ""}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
