"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import { protoElonezet, protoLanc, type Elonezet, type Lanc } from "@/lib/proto/akciok";
import { ft, napCimke, szam } from "@/components/proto/format";

const Terkep = dynamic(() => import("@/components/proto/terkep").then((m) => m.ProtoTerkep), {
  ssr: false,
  loading: () => <div className="h-72 rounded-lg bg-muted" />,
});

export type TervFuvar = {
  id: string;
  jelleg: "ber" | "sajat";
  cim: string;
  felrako: string | null;
  lerako: string | null;
  nap: string | null;
  kocsi: string | null;
  dij: string | null;
};

type Props = {
  napok: string[];
  ma: string;
  kocsik: { kod: string; sofor: string }[];
  fuvarok: TervFuvar[];
  hetKezdet: string;
};

function varos(cim: string | null): string {
  if (!cim) return "?";
  const c = cim.split(",").map((x) => x.trim()).filter(Boolean);
  return c.find((x) => /[a-záéíóöőúüű]{3}/i.test(x) && !/\d/.test(x)) ?? c[0] ?? cim;
}

export function TervTabla({ napok, ma, kocsik, fuvarok, hetKezdet }: Props) {
  const [kijelolt, setKijelolt] = useState<string | null>(null);
  const [cel, setCel] = useState<{ id: string; kod: string; nap: string } | null>(null);
  const [elonezet, setElonezet] = useState<Elonezet | null>(null);
  const [lanc, setLanc] = useState<Lanc | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const [folyamatban, inditas] = useTransition();

  const kiosztatlan = fuvarok.filter((f) => !f.kocsi);
  const athuz = (id: string, kod: string, nap: string) => {
    setCel({ id, kod, nap });
    setKijelolt(null);
    setHiba(null);
    inditas(async () => {
      try {
        setElonezet(await protoElonezet(id, nap));
      } catch {
        setElonezet(null);
        setHiba("Az előnézet nem készült el. Próbáld újra.");
      }
    });
  };
  const kocsiLanc = (kod: string) => {
    setHiba(null);
    inditas(async () => {
      try {
        setLanc(await protoLanc(kod, hetKezdet));
      } catch {
        setHiba("A térkép adatai nem töltődtek be. Próbáld újra.");
      }
    });
  };

  const Kartya = ({ f, huzhato }: { f: TervFuvar; huzhato: boolean }) => (
    <button
      type="button"
      draggable={huzhato}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)}
      onClick={(e) => { e.stopPropagation(); if (huzhato) setKijelolt(kijelolt === f.id ? null : f.id); }}
      aria-pressed={kijelolt === f.id}
      className={`w-full rounded-md p-1.5 text-left text-xs ${f.jelleg === "ber" ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-800"} ${kijelolt === f.id ? "ring-2 ring-primary" : ""} ${huzhato ? "cursor-grab" : ""}`}
    >
      <span className="block truncate font-semibold">{varos(f.felrako)} → {varos(f.lerako)}</span>
      <span className="block truncate">{f.cim}{f.dij ? ` · ${f.dij}` : ""}</span>
    </button>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-4 min-w-0">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] table-fixed text-xs">
            <thead><tr className="text-muted-foreground">
              <th className="w-28 p-2 text-left">Kocsi</th>
              {napok.map((n) => <th key={n} className={`p-2 text-left font-medium ${n === ma ? "text-primary" : ""}`}>{napCimke(n)}</th>)}
            </tr></thead>
            <tbody>
              {kocsik.map((k) => (
                <tr key={k.kod} className="border-t align-top">
                  <td className="p-2">
                    <button type="button" onClick={() => kocsiLanc(k.kod)} className={`text-left font-semibold hover:underline ${lanc?.kod === k.kod ? "text-primary" : ""}`}>{k.kod}</button>
                    <div className="text-muted-foreground">{k.sofor}</div>
                  </td>
                  {napok.map((n) => {
                    const itt = fuvarok.filter((f) => f.kocsi === k.kod && f.nap === n);
                    const ide = cel?.kod === k.kod && cel.nap === n ? fuvarok.find((f) => f.id === cel.id) : null;
                    return (
                      <td
                        key={n}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) athuz(id, k.kod, n); }}
                        onClick={() => { if (kijelolt) athuz(kijelolt, k.kod, n); }}
                        className={`h-20 space-y-1 border-l p-1 ${kijelolt ? "cursor-pointer bg-primary/5" : ""}`}
                      >
                        {itt.map((f) => <Kartya key={f.id} f={f} huzhato />)}
                        {ide && <div className="rounded-md border-2 border-dashed border-amber-500 p-1.5 text-amber-900">Előnézet: {varos(ide.felrako)} → {varos(ide.lerako)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Térkép{lanc ? ` · ${lanc.kod} heti lánca` : ""}</h2>{lanc && lanc.kimaradt > 0 && <span className="text-xs text-amber-800">{lanc.kimaradt} megálló címe nem ismert, nincs a térképen</span>}</div>
          {lanc
            ? <Terkep lanc={lanc} />
            : <p className="text-sm text-muted-foreground">Kattints egy kocsi rendszámára a heti láncához és élő helyzetéhez.</p>}
        </div>
      </div>
      <aside className="grid content-start gap-4 min-w-0">
        <div className="grid gap-2 rounded-xl border bg-card p-3">
          <h2 className="font-semibold">Kiosztásra vár · {kiosztatlan.length}</h2>
          <p className="text-xs text-muted-foreground">Húzd rá egy kocsi napjára, vagy telefonon koppints a fuvarra, majd a napra.</p>
          {kiosztatlan.length === 0 && <p className="text-sm text-muted-foreground">Minden fuvarnak van kocsija.</p>}
          {kiosztatlan.map((f) => <Kartya key={f.id} f={f} huzhato />)}
        </div>
        <div className="grid gap-2 rounded-xl border bg-card p-3" aria-live="polite">
          <h2 className="font-semibold">Húzás előnézete</h2>
          {folyamatban && <p className="text-sm text-muted-foreground">Számolás…</p>}
          {hiba && <p className="text-sm text-red-700">{hiba}</p>}
          {!elonezet && !folyamatban && !hiba && <p className="text-sm text-muted-foreground">Itt látod, mi változna. A húzás nem ment semmit.</p>}
          {elonezet && !folyamatban && (
            <>
              <div className="text-sm"><Link className="font-medium hover:underline" href={`/fuvarozas2/megbizasok/${elonezet.fuvar.id}`}>{elonezet.fuvar.cim}</Link><div className="text-xs text-muted-foreground">{elonezet.fuvar.ut}{elonezet.fuvar.rakottKm != null ? ` · rakott ${szam(elonezet.fuvar.rakottKm)} km` : ""}</div></div>
              {elonezet.legkozelebbiTelep && <div className="text-xs text-muted-foreground">Legközelebbi telephely: {elonezet.legkozelebbiTelep.nev}, {elonezet.legkozelebbiTelep.km} km</div>}
              {elonezet.kocsik.map((k) => (
                <div key={k.kod} className={`grid gap-0.5 rounded-lg border p-2 text-xs ${k.kod === cel?.kod ? "border-primary" : ""} ${k.szabalySertes ? "bg-amber-50" : ""}`}>
                  <div className="flex justify-between gap-2"><span className="font-semibold">{k.kod} · {k.sofor}</span><span className="tabular-nums">{k.uresKm != null ? `üres ${k.uresKm} km` : "Nincs km-adat"}</span></div>
                  <div className="truncate text-muted-foreground">Innen: {k.honnan ?? "Nem ismert"}{k.telephelyrol ? " (telephely)" : ""}</div>
                  {k.fedezetFt != null && <div className="tabular-nums">Várható fedezet: {ft(k.fedezetFt)}</div>}
                  {k.szabalySertes && <div className="font-medium text-amber-900">30 km fölötti üres út a telephelyről: indoklás kellene.</div>}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Becslés: légvonal × 1,3 és 120 Ft/km útdíj, sofőrköltség nélkül. A kiosztás a mostani appban történik.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
