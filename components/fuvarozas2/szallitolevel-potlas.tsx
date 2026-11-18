"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { potolSzallitoleveleketAction, sajatFuvarPotlasAction } from "@/lib/fuvarozas2/szallitolevel-actions";
import type { SzlPotlasSor } from "@/lib/fuvarozas2/szallitolevel";

/**
 * Rendszer → „Szállítólevelek és saját fuvarok pótlása” (2026-11-18): (1) a
 * Számlázz.hu szállítólevelei egy sorszám-tartományra, (2) saját fuvarok a
 * párosítatlan szállítólevelekből egy dátumtól — próba, aztán létrehozás.
 */
export function SzallitolevelPotlas() {
  const [pending, start] = useTransition();
  const [ev, setEv] = useState(String(new Date().getFullYear()));
  const [tol, setTol] = useState("1");
  const [ig, setIg] = useState("149");
  const [tolNap, setTolNap] = useState(`${new Date().getFullYear()}-07-01`);
  const [potlas, setPotlas] = useState<string | null>(null);
  const [terv, setTerv] = useState<{ parositva: number; sorok: SzlPotlasSor[]; alkalmazva: boolean } | null>(null);

  function szlPotlas() {
    start(async () => {
      const r = await potolSzallitoleveleketAction(Number(ev), Number(tol), Number(ig));
      if (!r.ok) { toast.error(r.hiba); return; }
      setPotlas(`${r.uj} szállítólevél mentve, ${r.hianyzo} sorszám nem létezik${r.hibak.length ? ` · hiba: ${r.hibak.join("; ")}` : ""}`);
    });
  }
  function fuvarPotlas(alkalmaz: boolean) {
    start(async () => {
      const r = await sajatFuvarPotlasAction(tolNap, alkalmaz);
      if (!r.ok) { toast.error(r.hiba); return; }
      setTerv({ ...r, alkalmazva: alkalmaz });
      if (alkalmaz) toast.success(`${r.sorok.filter((s) => s.ok === "létrehozva").length} saját fuvar létrehozva, ${r.parositva} meglévőhöz párosítva`);
    });
  }
  return (
    <details className="rounded-xl bg-card shadow-[var(--shadow-card)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Szállítólevelek és saját fuvarok pótlása <span className="font-normal text-muted-foreground">— Számlázz.hu szállítólevelek behúzása, saját fuvar a párosítatlanokból</span></summary>
      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Év<Input value={ev} onChange={(e) => setEv(e.target.value)} className="h-8 w-20 text-sm text-foreground" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Sorszám-tól<Input value={tol} onChange={(e) => setTol(e.target.value)} className="h-8 w-20 text-sm text-foreground" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">-ig<Input value={ig} onChange={(e) => setIg(e.target.value)} className="h-8 w-20 text-sm text-foreground" /></label>
          <Button size="sm" variant="outline" disabled={pending} onClick={szlPotlas}>Szállítólevelek behúzása (S-WLLWR-{ev}-{tol}…{ig})</Button>
          {potlas ? <span className="text-xs text-muted-foreground">{potlas}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">Az óránkénti kereső 2026-ban a 150-es sorszámtól indult; a korábbiak ezzel pótolhatók. A már párosított szállítólevél nem változik.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Saját fuvar a szállítólevelekből ettől a naptól<Input type="date" value={tolNap} onChange={(e) => setTolNap(e.target.value)} className="h-8 w-40 text-sm text-foreground" /></label>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fuvarPotlas(false)}>Próba</Button>
          <Button size="sm" disabled={pending || !terv || terv.alkalmazva || !terv.sorok.some((s) => s.ok === "létrehozható")} onClick={() => fuvarPotlas(true)}>Létrehozás</Button>
        </div>
        {terv ? (
          <div className="flex flex-col gap-1">
            <div>{terv.sorok.length} párosítatlan szállítólevél{terv.alkalmazva ? <> · <b>{terv.sorok.filter((s) => s.ok === "létrehozva").length}</b> fuvar létrehozva · {terv.parositva} meglévőhöz párosítva</> : null}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2">Szállítólevél</th><th className="py-1 pr-2">Kelt</th><th className="py-1 pr-2">Vevő → partner</th><th className="py-1 pr-2">Kocsi</th><th className="py-1 pr-2 text-right">db</th><th className="py-1 pr-2">Tételek</th><th className="py-1">Eredmény</th></tr></thead>
                <tbody>
                  {terv.sorok.map((s) => (
                    <tr key={s.bizonylatszam} className="border-t border-foreground/5">
                      <td className="whitespace-nowrap py-1 pr-2 font-medium">{s.bizonylatszam}</td>
                      <td className="whitespace-nowrap py-1 pr-2">{s.kelt}</td>
                      <td className="py-1 pr-2">{s.vevo ?? "—"}{s.partner && s.partner !== s.vevo ? <span className="text-muted-foreground"> → {s.partner}</span> : null}{!s.partner ? <span className="text-[var(--f2-amb)]"> (új partner lesz)</span> : null}</td>
                      <td className="whitespace-nowrap py-1 pr-2">{s.jarmu ?? "—"}</td>
                      <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">{s.raklap ?? "—"}</td>
                      <td className="py-1 pr-2">{s.tetelek ?? "—"}</td>
                      <td className="whitespace-nowrap py-1">{s.id ? <a href={`/fuvarozas2/megbizasok/${s.id}`} className="hover:underline">#{s.id} {s.ok}</a> : s.ok}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
