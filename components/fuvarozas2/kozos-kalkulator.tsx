"use client";

// A Fuvarozás 2 közös Kalkulátora (2026-09-30, Budaházi Zoltán: „a régi
// kalkulátort minden tudásával”): a régi útdíjkalkulátor (több megálló
// címjavaslattal, térkép, egymás mellé tett eredménycsempék, amelyek a
// böngészőben megmaradnak) és a tervvászon D6 kalkulátora (kocsi, üres km,
// mért fogyasztás, önköltség, 500/600/700 Ft/km sávok, a megbízó ajánlatának
// minősítése) egyben. A számolás szerver-oldali: szamoljKozosKalkulaciot.

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { searchAddressSuggestions } from "@/lib/fuvarozas/actions";
import { szamoljKozosKalkulaciot, type KozosEredmeny } from "@/lib/fuvarozas2/kalkulator";
import type { GeocodedAddress } from "@/lib/fuvarozas/utdijkalkulacio";
import { cn } from "@/lib/utils";

// A Leaflet a böngésző `window`-ját használja betöltéskor: csak kliensen.
const RouteMap = dynamic(() => import("@/components/fuvarozas/route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="flex h-72 w-full items-center justify-center rounded-lg border text-xs text-muted-foreground">Térkép betöltése…</div>,
});

const ft = (n: number | null | undefined) => (n == null ? "—" : `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} Ft`);
const szam = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n));
function ido(perc: number): string {
  const h = Math.floor(perc / 60), m = Math.round(perc % 60);
  return h > 0 ? `${h} ó ${m} p` : `${m} p`;
}
const MINOSITES_SZIN: Record<string, string> = {
  veszteseges: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  hatareset: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  ajanlott: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
};
const MINOSITES_NEV: Record<string, string> = { veszteseges: "veszteséges", hatareset: "határeset", ajanlott: "ajánlott" };

// A csempék és a térképi útvonalak színpárja (a régi kalkulátoréval egyezik).
const UTVONAL_SZINEK = ["#f97316", "#9333ea", "#0d9488", "#db2777", "#ca8a04", "#4f46e5", "#0891b2", "#c026d3"];
const szin = (id: number) => UTVONAL_SZINEK[id % UTVONAL_SZINEK.length];
const TAROLO = "wwp-f2-kalkulator-csempek";

type Csempe = { id: number; e: KozosEredmeny };
type Megallo = { id: number; value: string; point: GeocodedAddress | null };

let szamlalo = 0;
const ujId = () => ++szamlalo;
const ujMegallo = (value = ""): Megallo => ({ id: ujId(), value, point: null });
function megalloCimke(i: number, db: number): string {
  if (i === 0) return "Honnan";
  if (i === db - 1) return "Hová";
  return `Megálló ${i}`;
}

function CimMezo({ placeholder, value, onChange, onSelect, onRemove }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (a: GeocodedAddress) => void;
  onRemove?: () => void;
}) {
  const [javaslatok, setJavaslatok] = useState<GeocodedAddress[]>([]);
  const [nyitva, setNyitva] = useState(false);
  const idozito = useRef<ReturnType<typeof setTimeout> | null>(null);

  function valtozik(v: string) {
    onChange(v);
    if (idozito.current) clearTimeout(idozito.current);
    if (v.trim().length < 2) { setJavaslatok([]); setNyitva(false); return; }
    idozito.current = setTimeout(async () => {
      const r = await searchAddressSuggestions(v).catch(() => []);
      setJavaslatok(r);
      setNyitva(r.length > 0);
    }, 250);
  }

  return (
    <div className="relative min-w-[180px] flex-1">
      <input
        className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 pr-7 text-sm"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => valtozik(e.target.value)}
        onFocus={() => javaslatok.length > 0 && setNyitva(true)}
        onBlur={() => setNyitva(false)}
      />
      {onRemove ? (
        <button type="button" aria-label="Megálló eltávolítása" className="absolute right-1.5 top-2 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(e) => e.preventDefault()} onClick={onRemove}>×</button>
      ) : null}
      {nyitva ? (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-foreground/10 bg-card shadow-md">
          {javaslatok.map((j) => (
            <button key={`${j.lon},${j.lat}`} type="button" className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              onMouseDown={(e) => { e.preventDefault(); onSelect(j); setNyitva(false); }}>
              {j.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Sor({ cim, ertek, al, kiemelt }: { cim: string; ertek: string; al?: string; kiemelt?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-foreground/5 py-1.5", kiemelt && "border-0 pt-2 text-base font-bold")}>
      <span className={kiemelt ? "" : "text-muted-foreground"}>{cim}{al ? <span className="block text-[11px] font-normal text-muted-foreground">{al}</span> : null}</span>
      <span className="shrink-0 font-mono tabular-nums">{ertek}</span>
    </div>
  );
}

function Reszletek({ e, jarmuCimke }: { e: KozosEredmeny; jarmuCimke: string | null }) {
  const o = e.onkoltseg;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-card p-4 text-sm">
      <div>
        <h3 className="font-bold">{e.stops.map((s) => s.label).join(" → ")}</h3>
        <p className="text-xs text-muted-foreground">
          {jarmuCimke ?? "flotta-átlag"} · {e.vanVisszfuvar ? "visszfuvarral" : "hazaúttal"} · {e.napok} nap
        </p>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Út (HU-GO)</div>
        <Sor cim="Rakott táv" ertek={`${szam(e.rakottKm)} km`} al={`menetidő ${ido(e.menetidoPerc)}`} />
        <Sor cim="Útdíj a rakott útra" ertek={ft(e.rakottUtdijFt)} />
        <Sor cim="Üres táv" ertek={`${szam(e.uresKm)} km`} al={e.uresReszletek} />
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Önköltség</div>
        <Sor
          cim="Üzemanyag"
          ertek={ft(o.uzemanyagFt)}
          al={`${szam(e.literek)} l · ${e.fogyasztasL100} l/100 km (${e.fogyasztasForras}) · ${e.gazolaj.ar} Ft/l = NAV ${e.gazolaj.navAr} − ${e.gazolaj.kedvezmeny} Ft/l tankolási kedvezmény, ${e.gazolaj.cimke}${e.gazolaj.friss ? "" : " (nem sikerült frissíteni)"}`}
        />
        <Sor cim="Útdíj (rakott + üres)" ertek={ft(o.utdijFt)} />
        <Sor cim="Napi költség (sofőr + kocsi)" ertek={ft(o.napiFt)} al={`${e.napok} nap × 50 000 Ft`} />
        <Sor cim="Önköltség összesen" ertek={ft(o.osszesenFt)} kiemelt />
        <p className="text-xs text-muted-foreground">{o.ftPerRakottKm != null ? `${szam(o.ftPerRakottKm)} Ft / rakott km — ennél olcsóbban veszteség.` : ""}</p>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ajánlat</div>
        {[...e.savok, ...(e.megbizoiAjanlat ? [e.megbizoiAjanlat] : [])].map((s) => (
          <div key={"sajat" in s ? "megbizo" : s.ftKm} className={cn("mt-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2", "sajat" in s ? "border-2 border-[var(--f2-blue)]" : "bg-muted/50")}>
            <span>{"sajat" in s ? <b>A megbízó ajánlata</b> : <>{s.ftKm} Ft/km</>} <span className="block text-[11px] text-muted-foreground">{"sajat" in s ? `${szam(s.ftKm)} Ft/km · ` : ""}eredmény {ft(s.eredmenyFt)} ({s.marginSzazalek}%)</span></span>
            <span className="font-mono font-bold tabular-nums">{ft(s.dijFt)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", MINOSITES_SZIN[s.minosites])}>{MINOSITES_NEV[s.minosites]}</span>
          </div>
        ))}
      </div>
      {e.figyelmeztetesek.length ? (
        <ul className="list-disc pl-5 text-xs text-[var(--f2-amb)]">{e.figyelmeztetesek.map((f) => <li key={f}>{f}</li>)}</ul>
      ) : null}
    </div>
  );
}

export function KozosKalkulator({ jarmuvek, kezdoMegallok }: { jarmuvek: { kod: string; cimke: string }[]; kezdoMegallok: string[] }) {
  const [megallok, setMegallok] = useState<Megallo[]>(() => {
    const k = kezdoMegallok.filter((x) => x.trim());
    const alap = k.length >= 2 ? k.map((x) => ujMegallo(x)) : [ujMegallo(k[0] ?? ""), ujMegallo()];
    return k.length >= 2 ? [...alap, ujMegallo()] : alap;
  });
  const [jarmu, setJarmu] = useState("");
  const [ajanlat, setAjanlat] = useState("");
  const [visszfuvar, setVisszfuvar] = useState(false);
  const [szamol, setSzamol] = useState(false);
  const [csempek, setCsempek] = useState<Csempe[]>([]);
  const [betoltve, setBetoltve] = useState(false);
  const [kivalasztott, setKivalasztott] = useState<number | null>(null);

  // A korábbi eredmények a böngészőben megmaradnak (mint a régi kalkulátorban).
  useEffect(() => {
    let el = true;
    Promise.resolve().then(() => {
      if (!el) return;
      try {
        const nyers = localStorage.getItem(TAROLO);
        const t = nyers ? (JSON.parse(nyers) as Csempe[]) : [];
        const ervenyes = Array.isArray(t) ? t.filter((c) => c?.e?.stops && c?.e?.onkoltseg) : [];
        szamlalo = Math.max(szamlalo, ...ervenyes.map((c) => c.id));
        setCsempek(ervenyes);
      } catch {
        // sérült vagy tiltott tároló — üresen indulunk
      }
      setBetoltve(true);
    });
    return () => { el = false; };
  }, []);
  useEffect(() => {
    if (!betoltve) return;
    try { localStorage.setItem(TAROLO, JSON.stringify(csempek)); } catch { /* pl. privát böngészés */ }
  }, [csempek, betoltve]);

  function allit(id: number, v: Partial<Megallo>) {
    setMegallok((elozo) => {
      const kov = elozo.map((m) => (m.id === id ? { ...m, ...v } : m));
      // Ha minden mező ki van töltve, a végére új üres mező kerül (mint a régiben).
      return kov.every((m) => m.value.trim()) ? [...kov, ujMegallo()] : kov;
    });
  }
  const torol = (id: number) => setMegallok((e) => (e.length <= 2 ? e : e.filter((m) => m.id !== id)));

  async function szamolj(ev: React.FormEvent) {
    ev.preventDefault();
    const kitoltott = megallok.filter((m) => m.value.trim());
    if (kitoltott.length < 2) { toast.error("Add meg legalább a Honnan és a Hová címet."); return; }
    const ajanlatFt = ajanlat.trim() ? Number(ajanlat.replace(/[\s.]/g, "")) : undefined;
    if (ajanlatFt !== undefined && !(ajanlatFt > 0)) { toast.error("A megbízó ajánlata nem szám."); return; }
    setSzamol(true);
    try {
      const r = await szamoljKozosKalkulaciot({
        megallok: kitoltott.map((m) => m.point ?? m.value.trim()),
        jarmuKod: jarmu || undefined,
        ajanlatFt,
        vanVisszfuvar: visszfuvar,
      });
      if (!r.ok) { toast.error(r.hiba); return; }
      const uj = { id: ujId(), e: r.eredmeny };
      setCsempek((e) => [...e, uj]);
      setKivalasztott(uj.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nem sikerült a számítás.");
    } finally {
      setSzamol(false);
    }
  }

  const kijelolt = csempek.find((c) => c.id === kivalasztott) ?? csempek[csempek.length - 1] ?? null;
  const jarmuCimke = (kod: string | null) => (kod ? jarmuvek.find((j) => j.kod === kod)?.cimke ?? kod : null);

  // Élő előnézet: a javaslatból kiválasztott címek azonnal a térképre kerülnek.
  const elonezet = megallok
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.point)
    .map(({ m, i }) => ({ role: megalloCimke(i, megallok.length), label: m.point!.label, lon: m.point!.lon, lat: m.point!.lat }));
  const alairas = (l: { lon: number; lat: number }[]) => l.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join("|");
  const utvonalak = [
    ...csempek.map((c) => ({
      id: c.id,
      color: szin(c.id),
      stops: c.e.stops.map((s, i) => ({ role: megalloCimke(i, c.e.stops.length), label: s.label, lon: s.lon, lat: s.lat })),
      geometryLonLat: c.e.route.geometryLonLat,
      kiemelt: c.id === kijelolt?.id,
    })),
    ...(elonezet.length >= 2 && !csempek.some((c) => alairas(c.e.stops) === alairas(elonezet))
      ? [{ id: -1, color: "#94a3b8", stops: elonezet, geometryLonLat: null as [number, number][] | null }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={szamolj} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          {megallok.map((m, i) => (
            <CimMezo
              key={m.id}
              placeholder={megalloCimke(i, megallok.length)}
              value={m.value}
              onChange={(v) => allit(m.id, { value: v, point: null })}
              onSelect={(a) => allit(m.id, { value: a.label, point: a })}
              onRemove={i < megallok.length - 1 && megallok.length > 2 ? () => torol(m.id) : undefined}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kocsi (a mért fogyasztáshoz)
            <select value={jarmu} onChange={(e) => setJarmu(e.target.value)} className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground">
              <option value="">flotta-átlag</option>
              {jarmuvek.map((j) => <option key={j.kod} value={j.kod}>{j.cimke}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">A megbízó ajánlata (Ft)
            <input value={ajanlat} onChange={(e) => setAjanlat(e.target.value)} inputMode="numeric" placeholder="pl. 240 000" className="w-40 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm normal-case tracking-normal text-foreground" />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={visszfuvar} onChange={(e) => setVisszfuvar(e.target.checked)} />
            Van visszfuvar (a hazautat nem erre terheljük)
          </label>
          <button type="submit" disabled={szamol} className="ml-auto rounded-lg bg-[var(--f2-mint)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
            {szamol ? "Számítás…" : "Számítás"}
          </button>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-2xl border border-foreground/10 bg-card p-3">
          <RouteMap routes={utvonalak} />
        </div>
        {kijelolt ? (
          <Reszletek e={kijelolt.e} jarmuCimke={jarmuCimke(kijelolt.e.jarmuKod)} />
        ) : (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-card p-6 text-sm text-muted-foreground">
            Add meg a megállókat, és nyomd meg a „Számítás” gombot. Az eredmények csempeként alul maradnak, egymással összevethetők.
          </div>
        )}
      </div>

      {csempek.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {csempek.map((c) => {
            const m = c.e.megbizoiAjanlat;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setKivalasztott(c.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setKivalasztott(c.id); } }}
                style={{ borderLeftColor: szin(c.id) }}
                className={cn(
                  "relative w-[270px] cursor-pointer rounded-xl border border-l-4 border-foreground/10 bg-card p-3 pr-7 text-xs",
                  c.id === kijelolt?.id && "ring-2 ring-[var(--f2-blue)]"
                )}
              >
                <button type="button" aria-label="Eredmény eltávolítása" className="absolute right-2 top-2 rounded px-1 text-muted-foreground hover:bg-muted"
                  onClick={(ev) => { ev.stopPropagation(); setCsempek((e) => e.filter((x) => x.id !== c.id)); }}>×</button>
                <div className="line-clamp-2 font-semibold">{c.e.stops.map((s) => s.label).join(" → ")}</div>
                <div className="mt-1 text-muted-foreground">{szam(c.e.rakottKm)} km · {ido(c.e.menetidoPerc)} · útdíj {ft(c.e.rakottUtdijFt)}</div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span>önköltség <b className="font-mono">{ft(c.e.onkoltseg.osszesenFt)}</b></span>
                  <span className="font-mono text-muted-foreground">{c.e.onkoltseg.ftPerRakottKm != null ? `${szam(c.e.onkoltseg.ftPerRakottKm)} Ft/km` : ""}</span>
                </div>
                <div className="mt-1 flex gap-2 font-mono">
                  {c.e.savok.map((s) => <span key={s.ftKm} className={cn("rounded px-1", MINOSITES_SZIN[s.minosites])}>{s.ftKm}: {szam(s.dijFt / 1000)}e</span>)}
                </div>
                {m ? <div className={cn("mt-1.5 rounded px-1.5 py-0.5 font-semibold", MINOSITES_SZIN[m.minosites])}>megbízó {ft(m.dijFt)} — {MINOSITES_NEV[m.minosites]}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
