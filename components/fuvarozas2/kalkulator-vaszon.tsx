"use client";

// Kalkulátor a tervvászon (D6) szerint: bal oldalon az útvonal és a kocsi,
// jobbra a HU-GO tény (km, menetidő, útdíj), alatta az ÖNKÖLTSÉG bontás és a
// három ajánlat-sáv. A megbízó ajánlata külön sorban, minősítéssel.
//
// A számolás szerver-oldali (szamoljKalkulaciot) — itt csak űrlap és
// megjelenítés van.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { szamoljKalkulaciot, type KalkulacioEredmeny } from "@/lib/fuvarozas2/kalkulator";

const ft = (n: number | null | undefined) => (n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} Ft`);
const MINOSITES_SZIN: Record<string, string> = {
  veszteseges: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  hatareset: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  ajanlott: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
};
const MINOSITES_NEV: Record<string, string> = { veszteseges: "veszteséges", hatareset: "határeset", ajanlott: "ajánlott" };

export function KalkulatorVaszon({
  jarmuvek, kezdoHonnan, kezdoHova,
}: { jarmuvek: { kod: string; cimke: string }[]; kezdoHonnan: string; kezdoHova: string }) {
  const [honnan, setHonnan] = useState(kezdoHonnan);
  const [hova, setHova] = useState(kezdoHova);
  const [jarmu, setJarmu] = useState("");
  const [ajanlat, setAjanlat] = useState("");
  const [visszfuvar, setVisszfuvar] = useState(false);
  const [eredmeny, setEredmeny] = useState<KalkulacioEredmeny | null>(null);
  const [pending, start] = useTransition();

  const szamol = () =>
    start(async () => {
      if (!honnan.trim() || !hova.trim()) { toast.error("Felrakó és lerakó cím kell."); return; }
      try {
        const r = await szamoljKalkulaciot({
          honnan: honnan.trim(), hova: hova.trim(),
          jarmuKod: jarmu || undefined,
          ajanlatFt: ajanlat ? Number(ajanlat.replace(/\s/g, "")) : undefined,
          vanVisszfuvar: visszfuvar,
        });
        setEredmeny(r);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "A kalkuláció nem sikerült");
      }
    });

  const mezo = "w-full rounded-lg border border-foreground/15 bg-card px-3 py-2 text-sm";

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Útvonal</div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Felrakó
          <input className={mezo} value={honnan} onChange={(e) => setHonnan(e.target.value)} placeholder="Nyíregyháza, Ipari park 4" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Lerakó
          <input className={mezo} value={hova} onChange={(e) => setHova(e.target.value)} placeholder="Győr, Ipari park 12" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={visszfuvar} onChange={(e) => setVisszfuvar(e.target.checked)} />
          Van visszfuvar (a hazaút nem erre a fuvarra terhelődik)
        </label>

        <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kocsi és ajánlat</div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Kocsi (a mért fogyasztáshoz)
          <select className={mezo} value={jarmu} onChange={(e) => setJarmu(e.target.value)}>
            <option value="">flotta-átlag</option>
            {jarmuvek.map((j) => <option key={j.kod} value={j.kod}>{j.cimke}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Megbízó ajánlata (Ft)
          <input className={mezo} value={ajanlat} onChange={(e) => setAjanlat(e.target.value)} inputMode="numeric" placeholder="185000" />
        </label>

        <button type="button" onClick={szamol} disabled={pending}
          className="mt-1 rounded-lg bg-[var(--f2-mint)] py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Számolok…" : "Számol"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          A HU-GO útdíjat és a menetidőt az állami kalkulátor adja; az üres km a telephelytől a felrakóig és a lerakótól haza.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {!eredmeny ? (
          <div className="rounded-2xl border border-dashed border-foreground/15 p-8 text-center text-sm text-muted-foreground">
            Add meg a felrakót és a lerakót, és megmondom, mennyibe kerül nekünk — és mennyiért érdemes elvállalni.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { c: "Rakott km", e: `${eredmeny.rakottKm}`, a: `${eredmeny.honnan} → ${eredmeny.hova}` },
                { c: "Üres km", e: `${eredmeny.uresKm}`, a: eredmeny.uresReszletek },
                { c: "Menetidő", e: `${Math.floor(eredmeny.menetidoPerc / 60)}:${String(eredmeny.menetidoPerc % 60).padStart(2, "0")}`, a: `${eredmeny.napok} nap lekötve` },
                { c: "Útdíj (HU-GO)", e: ft(eredmeny.utdijFt), a: "rakott + üres szakasz" },
              ].map((k) => (
                <div key={k.c} className="rounded-2xl border border-foreground/10 bg-card px-4 py-3">
                  <div className="text-xs font-semibold text-muted-foreground">{k.c}</div>
                  <div className="text-2xl font-bold">{k.e}</div>
                  <div className="text-[11px] text-muted-foreground">{k.a}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Önköltség</div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  <tr className="border-b border-foreground/5">
                    <td className="py-1.5">Üzemanyag</td>
                    <td className="py-1.5 text-muted-foreground">{eredmeny.onkoltseg.osszesKm} km × {eredmeny.fogyasztasL100} l/100 × {eredmeny.gazolajFt} Ft <span className="opacity-70">({eredmeny.fogyasztasForras}, {eredmeny.gazolajCimke})</span></td>
                    <td className="py-1.5 text-right tabular-nums">{ft(eredmeny.onkoltseg.uzemanyagFt)}</td>
                  </tr>
                  <tr className="border-b border-foreground/5">
                    <td className="py-1.5">Útdíj</td><td /><td className="py-1.5 text-right tabular-nums">{ft(eredmeny.onkoltseg.utdijFt)}</td>
                  </tr>
                  <tr className="border-b border-foreground/5">
                    <td className="py-1.5">Sofőr + kocsi napi fix</td>
                    <td className="py-1.5 text-muted-foreground">{eredmeny.napok} nap × 50 000 Ft</td>
                    <td className="py-1.5 text-right tabular-nums">{ft(eredmeny.onkoltseg.napiFt)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2">Önköltség</td>
                    <td className="py-2 text-muted-foreground">{eredmeny.onkoltseg.ftPerRakottKm != null ? `${eredmeny.onkoltseg.ftPerRakottKm} Ft / rakott km` : ""}</td>
                    <td className="py-2 text-right tabular-nums">{ft(eredmeny.onkoltseg.osszesenFt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ajánlat és árrés</div>
              <div className="mt-2 flex flex-col gap-2">
                {eredmeny.savok.map((s) => (
                  <div key={s.ftKm} className={`flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2 ${MINOSITES_SZIN[s.minosites]}`}>
                    <span className="font-semibold">{s.ftKm} Ft/km → {ft(s.dijFt)}</span>
                    <span className="text-sm">árrés {s.marginSzazalek} % · eredmény {ft(s.eredmenyFt)}</span>
                    <span className="text-xs font-semibold uppercase">{MINOSITES_NEV[s.minosites]}</span>
                  </div>
                ))}
                {eredmeny.megbizoiAjanlat ? (
                  <div className={`flex flex-wrap items-baseline justify-between gap-2 rounded-xl border-2 border-foreground/20 px-3 py-2 ${MINOSITES_SZIN[eredmeny.megbizoiAjanlat.minosites]}`}>
                    <span className="font-semibold">Megbízó ajánlata: {ft(eredmeny.megbizoiAjanlat.dijFt)}</span>
                    <span className="text-sm">{eredmeny.megbizoiAjanlat.ftKm} Ft/km · árrés {eredmeny.megbizoiAjanlat.marginSzazalek} % · eredmény {ft(eredmeny.megbizoiAjanlat.eredmenyFt)}</span>
                    <span className="text-xs font-semibold uppercase">{MINOSITES_NEV[eredmeny.megbizoiAjanlat.minosites]}</span>
                  </div>
                ) : null}
              </div>
              <ul className="mt-3 flex flex-col gap-1">
                {eredmeny.figyelmeztetesek.map((f, i) => <li key={i} className="text-[11px] text-muted-foreground">· {f}</li>)}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
