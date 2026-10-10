"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { varosNev } from "@/lib/fuvarozas/varos";
import { feladatLezaras } from "@/lib/menet/akciok";
import type { FeladatTipus } from "@/lib/menet/tipusok";
import { ForrasJel } from "@/components/fuvarozas2/forras-jel";
import { formatFt } from "@/components/fuvarozas2/kozos";
import {
  FELADAT_ALLAPOT_CIMKE, FELADAT_TIPUS_CIMKE, GPS_FRISSESSEG_CIMKE, NEZETEK, PROBLEMA_CIMKE, URES_SZURO,
  alkalmazSzurot, blokkHely, feladatIdoszak, feladatNev, gpsFrissesseg, idoTengely, kesesveszely, korSzoveg, napEltolva,
  oraJelolok, oraPerc, percANapban, problemak, rendezLista, sorokraBont, szuroUrlbe, vanSzuro,
  type DiszFeladat, type DiszFeladatAllapot, type DiszKocsi, type Diszpecser, type GpsFrissesseg, type ListaOszlop, type ListaSor,
  type Nezet, type Problema, type StatuszSzuro, type Szuro, type Tengely,
} from "@/lib/fuvarozas2/diszpecser-alap";
import type { TerkepKocsi } from "@/components/fuvarozas2/diszpecser-terkep";

// Diszpécser (6. fázis, 2026-10-10) — a fuvarszervező egy képernyője:
// fent a szűrősáv és a probléma-sáv, középen kocsinként egy idővonal-sáv
// (vagy heti beosztás / lista / térkép), jobbra a kiválasztott feladat
// részletei és műveletei. A szűrők a betöltött napra a kliensen hatnak, és
// az URL-ben is megjelennek (megosztható, visszagomb-barát). Minden blokk
// gomb szöveges címkével; a nyilak a sávon belül léptetnek; az állapot
// ikonnal és szöveggel is látszik, nem csak színnel.

const DiszpecserTerkep = dynamic(() => import("@/components/fuvarozas2/diszpecser-terkep").then((m) => m.DiszpecserTerkep), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl border border-foreground/10 bg-card text-sm text-muted-foreground">Térkép betöltése…</div>,
});

// A Menetterv panel típus-színei (components/fuvarozas2/menetterv.tsx) — ugyanaz a jelentés.
const TIPUS_SZIN: Record<FeladatTipus, string> = {
  berfuvar: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)] border-[var(--f2-blue)]/40",
  sajat_aru: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)] border-[var(--f2-mint)]/40",
  ures_pozicionalas: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)] border-[var(--f2-amb)]/40 border-dashed",
  telephelyi_rakodas: "bg-muted text-foreground border-foreground/20",
  varakozas: "bg-muted text-muted-foreground border-foreground/15",
};
const TIPUS_JEL: Record<FeladatTipus, string> = { berfuvar: "B", sajat_aru: "S", ures_pozicionalas: "Ü", telephelyi_rakodas: "T", varakozas: "V" };

const ALLAPOT_JEL: Record<DiszFeladatAllapot, string> = { kesz: "✓", folyamatban: "▶", tervezett: "○" };

const GPS_JEL: Record<GpsFrissesseg, { jel: string; osztaly: string }> = {
  friss: { jel: "●", osztaly: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" },
  kesoi: { jel: "◐", osztaly: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" },
  elavult: { jel: "○", osztaly: "bg-[var(--f2-red-l)] text-[var(--f2-red)]" },
  nincs: { jel: "×", osztaly: "bg-muted text-muted-foreground" },
};

const FOKUSZ = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--f2-dark)] focus-visible:ring-offset-2";

const varos = (c: string | null) => (c ? varosNev(c) || c : "?");
const percOra = (p: number) => (p >= 1440 ? "24:00" : `${String(Math.floor(p / 60)).padStart(2, "0")}:${String(p % 60).padStart(2, "0")}`);
const napCimke = (nap: string, ma: string) =>
  `${nap === ma ? "ma, " : nap === napEltolva(ma, 1) ? "holnap, " : nap === napEltolva(ma, -1) ? "tegnap, " : ""}${new Date(`${nap}T12:00:00Z`).toLocaleDateString("hu-HU", { timeZone: "UTC", weekday: "long", month: "2-digit", day: "2-digit" })}`;
const napRovid = (nap: string) => new Date(`${nap}T12:00:00Z`).toLocaleDateString("hu-HU", { timeZone: "UTC", weekday: "short", month: "2-digit", day: "2-digit" });

function Chip({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", className ?? "bg-muted text-muted-foreground")}>{children}</span>;
}

function GpsJel({ k, mostMs, b }: { k: DiszKocsi; mostMs: number; b: Diszpecser["beallitas"] }) {
  const fr = gpsFrissesseg(k.gps?.utolsoAdat, mostMs, b.gpsKesoiPerc, b.gpsElavultPerc);
  const kor = korSzoveg(k.gps?.utolsoAdat, mostMs);
  const g = GPS_JEL[fr];
  return (
    <Chip className={g.osztaly} title={fr === "nincs" ? (k.vanGpsEszkoz ? k.gpsHiba ?? "Nincs élő GPS-jel" : "Nincs Ecofleet-eszköz a kocsin") : `Utolsó jel ${oraPerc(k.gps?.utolsoAdat)} (${kor})`}>
      <span aria-hidden>{g.jel}</span> GPS {GPS_FRISSESSEG_CIMKE[fr]}{fr !== "nincs" && kor ? ` · ${kor}` : ""}
    </Chip>
  );
}

function MenetCimke({ k }: { k: DiszKocsi }) {
  if (k.menetForras === "jovahagyott") return <Chip className="bg-[var(--f2-mint-l)] text-[var(--f2-mint)]">✓ jóváhagyott menet</Chip>;
  if (k.menetForras === "javaslat") return <Chip className="bg-[var(--f2-blue-l)] text-[var(--f2-blue)]">javaslat</Chip>;
  return <Chip>menet nélkül</Chip>;
}

// ------------------------------------------------------------------ fő nézet

export function DiszpecserNezet({ adat, kezdoSzuro, kezdoNezet, kezdoValasztott = null }: { adat: Diszpecser; kezdoSzuro: Szuro; kezdoNezet: Nezet; kezdoValasztott?: string | null }) {
  const [szuro, setSzuro] = useState<Szuro>(kezdoSzuro);
  const [nezet, setNezet] = useState<Nezet>(kezdoNezet);
  const [valasztott, setValasztott] = useState<string | null>(kezdoValasztott);
  const reszletRef = useRef<HTMLElement>(null);
  const mostMs = useMemo(() => Date.parse(adat.most), [adat.most]);

  // A szűrő és a nézet az URL-ben (szerver-kör nélkül; a nap váltása viszont új betöltés).
  const urlFrissit = useCallback((sz: Szuro, nz: Nezet) => {
    const q = szuroUrlbe(sz, { nap: adat.nap !== adat.ma ? adat.nap : null, nezet: nz });
    const s = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [adat.nap, adat.ma]);
  const szuroAllit = (sz: Szuro) => { setSzuro(sz); urlFrissit(sz, nezet); };
  const nezetAllit = (nz: Nezet) => { setNezet(nz); urlFrissit(szuro, nz); };

  const probl = useMemo(() => problemak(adat, (c) => varos(c)), [adat]);
  const problemasFeladatok = useMemo(() => new Set(probl.flatMap((p) => (p.feladatKulcs ? [p.feladatKulcs] : []))), [probl]);
  const szurt = useMemo(() => alkalmazSzurot(adat.kocsik, szuro, problemasFeladatok), [adat.kocsik, szuro, problemasFeladatok]);
  const szurtProbl = useMemo(() => {
    const lathato = new Set(szurt.flatMap((k) => k.feladatok.map((f) => f.kulcs)));
    const kocsik = new Set(szurt.map((k) => k.kod));
    return probl.filter((p) => (p.feladatKulcs ? lathato.has(p.feladatKulcs) : !vanSzuro(szuro) || (p.jarmuKod ? kocsik.has(p.jarmuKod) : false)));
  }, [probl, szurt, szuro]);

  const kivalasztott = adat.kocsik.flatMap((k) => k.feladatok.filter((f) => f.kulcs === valasztott).map((f) => ({ k, f })))[0] ?? null;

  const valaszt = useCallback((kulcs: string, gorgess = false) => {
    setValasztott(kulcs);
    if (gorgess && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => reszletRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }, []);

  const problemaValaszt = (p: Problema) => {
    if (!p.feladatKulcs) return;
    if (nezet === "het" || nezet === "terkep") nezetAllit("idovonal");
    valaszt(p.feladatKulcs, true);
    window.setTimeout(() => {
      const gombok = [...document.querySelectorAll<HTMLElement>(`[data-feladat="${CSS.escape(p.feladatKulcs!)}"]`)];
      gombok.find((g) => g.offsetParent !== null)?.focus();
    }, 30);
  };

  const napLink = (nap: string, nz: Nezet = nezet) => {
    const q = szuroUrlbe(szuro, { nap: nap !== adat.ma ? nap : null, nezet: nz });
    const s = q.toString();
    return `/fuvarozas2/diszpecser${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Sötét antracit sáv: nap-léptető és nézetváltó */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--f2-dark)] px-3 py-2 text-white">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Nap választása">
          <Link href={napLink(napEltolva(adat.nap, -1))} className={cn("rounded-lg px-2.5 py-1.5 text-sm hover:bg-white/10", FOKUSZ)} aria-label="Előző nap">‹</Link>
          <span className="min-w-[11rem] px-1 text-center text-sm font-semibold capitalize" aria-live="polite">{napCimke(adat.nap, adat.ma)}</span>
          <Link href={napLink(napEltolva(adat.nap, 1))} className={cn("rounded-lg px-2.5 py-1.5 text-sm hover:bg-white/10", FOKUSZ)} aria-label="Következő nap">›</Link>
          {adat.nap !== adat.ma ? <Link href={napLink(adat.ma)} className={cn("ml-1 rounded-lg border border-white/25 px-2.5 py-1 text-xs hover:bg-white/10", FOKUSZ)}>ma</Link> : null}
          <label className="ml-1 flex items-center gap-1 text-xs text-white/75">
            <span className="sr-only">Nap</span>
            <input
              type="date"
              value={adat.nap}
              onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) window.location.assign(napLink(e.target.value)); }}
              className={cn("rounded-md border border-white/25 bg-transparent px-1.5 py-1 text-xs text-white [color-scheme:dark]", FOKUSZ)}
            />
          </label>
        </nav>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Nézet">
          {NEZETEK.map((n) => (
            <button
              key={n.kulcs}
              type="button"
              aria-pressed={nezet === n.kulcs}
              onClick={() => nezetAllit(n.kulcs)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", FOKUSZ, nezet === n.kulcs ? "bg-white text-[var(--f2-dark)]" : "text-white/80 hover:bg-white/10")}
            >
              {n.cimke}
            </button>
          ))}
        </div>
      </div>

      <SzuroSav adat={adat} szuro={szuro} onValtozik={szuroAllit} />

      {adat.gpsHiba ? <p role="status" className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">⚠ {adat.gpsHiba}</p> : null}
      {adat.menetHiba ? <p role="status" className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">⚠ {adat.menetHiba}</p> : null}

      <ProblemaSav problemak={szurtProbl} onValaszt={problemaValaszt} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">
          {nezet === "idovonal" ? <Idovonal adat={adat} kocsik={szurt} valasztott={valasztott} onValaszt={valaszt} mostMs={mostMs} problemasFeladatok={problemasFeladatok} /> : null}
          {nezet === "het" ? <HetiBeosztas adat={adat} szuro={szuro} napLink={napLink} /> : null}
          {nezet === "lista" ? <Lista kocsik={szurt} osszes={adat.kocsik} valasztott={valasztott} onValaszt={valaszt} problemasFeladatok={problemasFeladatok} /> : null}
          {nezet === "terkep" ? <Terkep adat={adat} kocsik={szurt} mostMs={mostMs} valasztott={kivalasztott?.k.kod ?? null} onValaszt={(kod) => {
            const k = adat.kocsik.find((x) => x.kod === kod);
            const f = k?.feladatok.find((x) => x.allapot !== "kesz") ?? k?.feladatok[0];
            if (f) valaszt(f.kulcs, true);
          }} /> : null}
        </div>
        <aside ref={reszletRef} aria-label="Kiválasztott feladat" className="scroll-mt-4 lg:sticky lg:top-4">
          <ReszletPanel key={kivalasztott?.f.kulcs ?? "nincs"} adat={adat} kiv={kivalasztott} mostMs={mostMs} problemak={probl} onBezar={() => setValasztott(null)} />
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ szűrősáv

function SzuroSav({ adat, szuro, onValtozik }: { adat: Diszpecser; szuro: Szuro; onValtozik: (s: Szuro) => void }) {
  const partnerek = useMemo(() => [...new Set(adat.kocsik.flatMap((k) => k.feladatok.flatMap((f) => (f.partner ? [f.partner] : []))))].sort((a, b) => a.localeCompare(b, "hu")), [adat.kocsik]);
  const soforok = useMemo(() => [...new Set(adat.kocsik.map((k) => k.sofor).filter(Boolean))], [adat.kocsik]);
  const mezo = cn("h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-sm", FOKUSZ);
  const allit = (k: keyof Szuro) => (e: React.ChangeEvent<HTMLSelectElement>) => onValtozik({ ...szuro, [k]: e.target.value });
  return (
    <form role="search" aria-label="Szűrők" className="grid grid-cols-2 gap-2 rounded-2xl border border-foreground/10 bg-card p-3 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]" onSubmit={(e) => e.preventDefault()}>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Rendszám / jármű
        <select className={mezo} value={szuro.jarmu} onChange={allit("jarmu")}>
          <option value="">mind</option>
          {adat.kocsik.map((k) => <option key={k.kod} value={k.kod}>{k.cimke}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Sofőr
        <select className={mezo} value={szuro.sofor} onChange={allit("sofor")}>
          <option value="">mind</option>
          {soforok.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Partner
        <select className={mezo} value={szuro.partner} onChange={allit("partner")}>
          <option value="">mind</option>
          {szuro.partner && !partnerek.includes(szuro.partner) ? <option value={szuro.partner}>{szuro.partner}</option> : null}
          {partnerek.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Telephely
        <select className={mezo} value={szuro.telephely} onChange={allit("telephely")}>
          <option value="">mind</option>
          {adat.telephelyNevek.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Státusz
        <select className={mezo} value={szuro.statusz} onChange={(e) => onValtozik({ ...szuro, statusz: e.target.value as StatuszSzuro | "" })}>
          <option value="">mind</option>
          <option value="tervezett">tervezett</option>
          <option value="folyamatban">folyamatban</option>
          <option value="kesz">kész</option>
          <option value="problema">problémás</option>
        </select>
      </label>
      <div className="flex items-end">
        <button type="button" disabled={!vanSzuro(szuro)} onClick={() => onValtozik(URES_SZURO)} className={cn("h-9 rounded-lg border border-foreground/15 px-3 text-sm hover:bg-muted disabled:opacity-40", FOKUSZ)}>
          Szűrők törlése
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ probléma-sáv

function ProblemaSav({ problemak, onValaszt }: { problemak: Problema[]; onValaszt: (p: Problema) => void }) {
  const [mind, setMind] = useState(false);
  const lathato = mind ? problemak : problemak.slice(0, 6);
  return (
    <section aria-label="Problémák" className="rounded-2xl border border-foreground/10 bg-card p-3">
      <div aria-live="polite" aria-atomic="false">
        <h2 className="mb-2 text-sm font-semibold">
          {problemak.length === 0 ? "✓ Nincs jelzett probléma a látható feladatokon" : `⚠ ${problemak.length} probléma`}
        </h2>
        {problemak.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {lathato.map((p) => {
              const tartalom = (
                <>
                  <span aria-hidden className="shrink-0">{p.sulyos ? "⛔" : "⚠"}</span>
                  <b className="shrink-0">{PROBLEMA_CIMKE[p.tipus]}</b>
                  <span className="min-w-0 break-words">{p.szoveg}</span>
                </>
              );
              const osztaly = cn("flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs", p.sulyos ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]");
              return (
                <li key={p.kulcs}>
                  {p.feladatKulcs ? (
                    <button type="button" onClick={() => onValaszt(p)} className={cn(osztaly, "hover:brightness-95", FOKUSZ)}>{tartalom}</button>
                  ) : p.megbizasId ? (
                    <Link href={`/fuvarozas2/megbizasok/${p.megbizasId}`} className={cn(osztaly, "hover:brightness-95", FOKUSZ)}>{tartalom}</Link>
                  ) : (
                    <div className={osztaly}>{tartalom}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {problemak.length > 6 ? (
        <button type="button" onClick={() => setMind((x) => !x)} aria-expanded={mind} className={cn("mt-2 text-xs font-semibold underline", FOKUSZ)}>
          {mind ? "Kevesebb" : `Mind a ${problemak.length} mutatása`}
        </button>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ idővonal

/** Nyíl-billentyűk a sávon belül: a sáv következő / előző feladat-gombja (DOM-sorrend = sorrend). */
function savBillentyu(e: React.KeyboardEvent<HTMLElement>, onValaszt: (kulcs: string) => void) {
  const elore = e.key === "ArrowRight" || e.key === "ArrowDown";
  const hatra = e.key === "ArrowLeft" || e.key === "ArrowUp";
  if (!elore && !hatra && e.key !== "Home" && e.key !== "End") return;
  const gombok = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-feladat]")].filter((b) => b.offsetParent !== null);
  if (gombok.length === 0) return;
  const i = gombok.indexOf(document.activeElement as HTMLButtonElement);
  const j = e.key === "Home" ? 0 : e.key === "End" ? gombok.length - 1 : i < 0 ? 0 : Math.max(0, Math.min(gombok.length - 1, i + (elore ? 1 : -1)));
  e.preventDefault();
  gombok[j].focus();
  onValaszt(gombok[j].dataset.feladat!);
}

function feladatCimke(f: DiszFeladat, problemas: boolean): string {
  const ido = [oraPerc(f.tenyIndulas ?? f.tervIndulas), oraPerc(f.tenyErkezes ?? f.eta ?? f.tervErkezes)].filter(Boolean).join("–");
  return [
    feladatNev(f, varos),
    FELADAT_TIPUS_CIMKE[f.tipus],
    f.partner,
    ido || "időpont nélkül",
    FELADAT_ALLAPOT_CIMKE[f.allapot],
    problemas ? "problémás" : null,
  ].filter(Boolean).join(", ");
}

function Idovonal({ adat, kocsik, valasztott, onValaszt, mostMs, problemasFeladatok }: {
  adat: Diszpecser; kocsik: DiszKocsi[]; valasztott: string | null; onValaszt: (kulcs: string, gorgess?: boolean) => void; mostMs: number; problemasFeladatok: ReadonlySet<string>;
}) {
  const mostPerc = adat.nap === adat.ma ? percANapban(adat.most, adat.nap) : null;
  const tengely = useMemo(
    () => idoTengely(kocsik.flatMap((k) => k.feladatok.flatMap((f) => { const x = feladatIdoszak(f, adat.nap); return x ? [x] : []; })), mostPerc),
    [kocsik, adat.nap, mostPerc]
  );
  if (kocsik.length === 0) return <p className="rounded-2xl border border-dashed border-foreground/15 bg-card p-6 text-sm text-muted-foreground">A szűrőnek egy kocsi sem felel meg.</p>;
  return (
    <section aria-label="Idővonal" className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" aria-label="Jelmagyarázat">
        {(["berfuvar", "sajat_aru", "ures_pozicionalas", "telephelyi_rakodas"] as FeladatTipus[]).map((t) => (
          <span key={t} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-px font-semibold", TIPUS_SZIN[t])}><span aria-hidden>{TIPUS_JEL[t]}</span>{FELADAT_TIPUS_CIMKE[t]}</span>
        ))}
        <span>· ✓ kész · ▶ folyamatban · ○ tervezett · ⚠ problémás</span>
      </div>
      <div className="hidden md:block">
        <OraTengely t={tengely} mostPerc={mostPerc} />
      </div>
      {kocsik.map((k) => (
        <Sav key={k.kod} k={k} adat={adat} tengely={tengely} mostPerc={mostPerc} valasztott={valasztott} onValaszt={onValaszt} mostMs={mostMs} problemasFeladatok={problemasFeladatok} />
      ))}
    </section>
  );
}

function OraTengely({ t, mostPerc }: { t: Tengely; mostPerc: number | null }) {
  const hossz = t.ig - t.tol;
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-2" aria-hidden>
      <div />
      <div className="relative h-5 text-[10px] text-muted-foreground">
        {oraJelolok(t).map((p) => (
          <span key={p} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((p - t.tol) / hossz) * 100}%` }}>{percOra(p)}</span>
        ))}
        {mostPerc != null && mostPerc >= t.tol && mostPerc <= t.ig ? (
          <span className="absolute -translate-x-1/2 rounded bg-[var(--f2-red)] px-1 font-semibold text-white" style={{ left: `${((mostPerc - t.tol) / hossz) * 100}%` }}>most {percOra(mostPerc)}</span>
        ) : null}
      </div>
    </div>
  );
}

function Sav({ k, adat, tengely, mostPerc, valasztott, onValaszt, mostMs, problemasFeladatok }: {
  k: DiszKocsi; adat: Diszpecser; tengely: Tengely; mostPerc: number | null; valasztott: string | null; onValaszt: (kulcs: string, gorgess?: boolean) => void; mostMs: number; problemasFeladatok: ReadonlySet<string>;
}) {
  const hossz = tengely.ig - tengely.tol;
  const idozitett = k.feladatok.map((f) => ({ f, x: feladatIdoszak(f, adat.nap) }));
  const vanIdo = idozitett.filter((y): y is { f: DiszFeladat; x: { kezd: number; veg: number } } => y.x != null);
  const sorIndex = sorokraBont(vanIdo.map((y) => y.x));
  const sorDb = Math.max(1, ...sorIndex.map((s) => s + 1));
  const idoNelkul = idozitett.filter((y) => y.x == null).map((y) => y.f);

  const gomb = (f: DiszFeladat, extra: string, style?: React.CSSProperties) => {
    const problemas = problemasFeladatok.has(f.kulcs);
    const kiv = valasztott === f.kulcs;
    return (
      <button
        key={f.kulcs}
        type="button"
        data-feladat={f.kulcs}
        aria-pressed={kiv}
        aria-label={feladatCimke(f, problemas)}
        title={feladatCimke(f, problemas)}
        onClick={() => onValaszt(f.kulcs, true)}
        style={style}
        className={cn(
          "flex min-w-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-left text-[11px] font-semibold leading-tight",
          TIPUS_SZIN[f.tipus], FOKUSZ,
          f.allapot === "kesz" && "opacity-60",
          problemas && "ring-2 ring-[var(--f2-red)] ring-offset-1",
          kiv && "outline outline-2 outline-offset-1 outline-[var(--f2-dark)]",
          extra
        )}
      >
        <span aria-hidden className="shrink-0">{ALLAPOT_JEL[f.allapot]}</span>
        {f.sorszam != null ? <span className="shrink-0 tabular-nums">#{f.sorszam}</span> : <span aria-hidden className="shrink-0">{TIPUS_JEL[f.tipus]}</span>}
        <span className="truncate">{varos(f.hova)}</span>
        {problemas ? <span aria-hidden className="shrink-0">⚠</span> : null}
      </button>
    );
  };

  return (
    <div role="group" aria-label={`${k.cimke}, ${k.sofor} sávja — nyilakkal léptethető`} onKeyDown={(e) => savBillentyu(e, (kulcs) => onValaszt(kulcs))}
      className="grid gap-2 border-t border-foreground/10 pt-2 md:grid-cols-[200px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-mono text-sm">{k.vontato ?? k.kod}</b>
          {k.potkocsi ? <span className="font-mono text-xs text-muted-foreground">+ {k.potkocsi}</span> : null}
        </div>
        <span className="text-xs">{k.sofor || "sofőr nincs megadva"}</span>
        <div className="flex flex-wrap gap-1">
          <GpsJel k={k} mostMs={mostMs} b={adat.beallitas} />
          <MenetCimke k={k} />
        </div>
      </div>

      {/* Asztali: idővonal */}
      <div className="hidden min-w-0 md:block">
        {k.feladatok.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nincs feladat {k.menetForras === "nincs" ? "és menet " : ""}erre a napra.</p>
        ) : (
          <div className="relative rounded-md bg-muted/40" style={{ height: `${sorDb * 30 + 6}px` }}>
            {oraJelolok(tengely).map((p) => (
              <span key={p} aria-hidden className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: `${((p - tengely.tol) / hossz) * 100}%` }} />
            ))}
            {mostPerc != null && mostPerc >= tengely.tol && mostPerc <= tengely.ig ? (
              <span aria-hidden className="absolute inset-y-0 z-10 w-0.5 bg-[var(--f2-red)]" style={{ left: `${((mostPerc - tengely.tol) / hossz) * 100}%` }} />
            ) : null}
            {vanIdo.map(({ f, x }, i) => {
              const h = blokkHely(x, tengely);
              return gomb(f, "absolute h-[26px]", { left: `${h.bal}%`, width: `${h.szel}%`, top: `${3 + sorIndex[i] * 30}px`, minWidth: "1.75rem" });
            })}
          </div>
        )}
        {idoNelkul.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">időpont nélkül:</span>
            {idoNelkul.map((f) => gomb(f, "h-[26px] max-w-[14rem]"))}
          </div>
        ) : null}
      </div>

      {/* Mobil: egymás alatti sor */}
      <ol className="flex flex-col gap-1 md:hidden">
        {k.feladatok.length === 0 ? <li className="text-xs text-muted-foreground">Nincs feladat erre a napra.</li> : null}
        {k.feladatok.map((f) => (
          <li key={f.kulcs} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {[oraPerc(f.tenyIndulas ?? f.tervIndulas), oraPerc(f.tenyErkezes ?? f.eta ?? f.tervErkezes)].filter(Boolean).join("–") || "—"}
            </span>
            {gomb(f, "h-9 flex-1")}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ heti beosztás

function HetiBeosztas({ adat, szuro, napLink }: { adat: Diszpecser; szuro: Szuro; napLink: (nap: string, nz?: Nezet) => string }) {
  const sorok = adat.het.sorok
    .filter((s) => !szuro.jarmu || s.kod === szuro.jarmu)
    .filter((s) => !szuro.sofor || s.sofor.toLocaleLowerCase("hu-HU") === szuro.sofor.toLocaleLowerCase("hu-HU"));
  return (
    <section aria-label="Heti beosztás" className="rounded-2xl border border-foreground/10 bg-card p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        A hét kocsinként: feladatok száma és típusa (jóváhagyott menet, javaslat, vagy menet nélkül a megbízásokból), a sofőr távolléte
        {adat.het.tavolletLathato ? "" : " (a Jelenlét modul jogosultsága nélkül nem látszik)"} és a 30 napon belül lejáró okmányok. A napra kattintva arra a napra vált.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th scope="col" className="w-44 text-left font-semibold">Kocsi</th>
              {adat.het.napok.map((n) => (
                <th key={n} scope="col" className={cn("rounded-md px-1 py-1 text-left font-semibold capitalize", n === adat.nap && "bg-[var(--f2-dark)] text-white", n === adat.ma && n !== adat.nap && "underline")}>
                  {napRovid(n)}{n === adat.ma ? " · ma" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorok.map((s) => (
              <tr key={s.kod}>
                <th scope="row" className="rounded-md bg-muted/40 p-2 text-left align-top font-normal">
                  <b className="block font-mono">{s.cimke}</b>
                  <span className="block">{s.sofor || "—"}</span>
                  {s.okmanyok.map((o) => (
                    <span key={`${o.cimke}-${o.targy}-${o.lejarat}`} className={cn("mt-1 block rounded px-1.5 py-0.5 font-semibold", o.allapot === "lejart" ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]")}>
                      {o.allapot === "lejart" ? "⛔" : "⚠"} {o.cimke}{o.targy !== s.cimke ? ` (${o.targy})` : ""}: {o.allapot === "lejart" ? `lejárt ${-o.hatraNap} napja` : `${o.hatraNap} nap múlva`}
                    </span>
                  ))}
                </th>
                {s.napok.map((c) => (
                  <td key={c.nap} className="align-top">
                    <Link href={napLink(c.nap, "idovonal")} className={cn("flex h-full min-h-16 flex-col gap-1 rounded-md border p-1.5 hover:border-foreground/40", FOKUSZ, c.nap === adat.nap ? "border-[var(--f2-dark)]" : "border-foreground/10")}
                      aria-label={`${s.cimke}, ${napRovid(c.nap)}: ${c.feladatDb} feladat${c.tavollet ? `, sofőr ${c.tavollet === "beteg" ? "betegszabadságon" : "szabadságon"}` : ""}`}>
                      {c.tavollet ? <span className="rounded bg-[var(--f2-amb-l)] px-1 font-semibold text-[var(--f2-amb)]">{c.tavollet === "beteg" ? "✚ beteg" : "☀ szabadság"}</span> : null}
                      {c.feladatDb > 0 ? (
                        <>
                          <span className="font-semibold">{c.feladatDb} feladat</span>
                          <span className="flex flex-wrap gap-0.5">
                            {(Object.entries(c.tipusok) as [FeladatTipus, number][]).map(([t, db]) => (
                              <span key={t} className={cn("rounded border px-1 font-semibold", TIPUS_SZIN[t])} title={FELADAT_TIPUS_CIMKE[t]}>{TIPUS_JEL[t]} {db}</span>
                            ))}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{c.forras === "jovahagyott" ? "✓ jóváhagyott" : c.forras === "javaslat" ? "javaslat" : "menet nélkül"}</span>
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ lista

const LISTA_OSZLOPOK: { kulcs: ListaOszlop; cimke: string }[] = [
  { kulcs: "jarmu", cimke: "Jármű" },
  { kulcs: "sorszam", cimke: "Sorszám" },
  { kulcs: "tipus", cimke: "Típus" },
  { kulcs: "partner", cimke: "Partner" },
  { kulcs: "felrako", cimke: "Felrakó" },
  { kulcs: "lerako", cimke: "Lerakó" },
  { kulcs: "ablak", cimke: "Ablak" },
  { kulcs: "statusz", cimke: "Státusz" },
  { kulcs: "km", cimke: "Km" },
  { kulcs: "koltseg", cimke: "Költség" },
];

function ablakSzoveg(f: DiszFeladat): string {
  const fel = f.felrakasAblak.tol || f.felrakasAblak.ig ? `fel ${oraPerc(f.felrakasAblak.tol) ?? "?"}–${oraPerc(f.felrakasAblak.ig) ?? "?"}` : null;
  const le = f.lerakasAblak.tol || f.lerakasAblak.ig ? `le ${oraPerc(f.lerakasAblak.tol) ?? "?"}–${oraPerc(f.lerakasAblak.ig) ?? "?"}` : null;
  return [fel, le].filter(Boolean).join(" · ") || "—";
}

function Lista({ kocsik, osszes, valasztott, onValaszt, problemasFeladatok }: {
  kocsik: DiszKocsi[]; osszes: DiszKocsi[]; valasztott: string | null; onValaszt: (kulcs: string, gorgess?: boolean) => void; problemasFeladatok: ReadonlySet<string>;
}) {
  const [rend, setRend] = useState<{ o: ListaOszlop; irany: "asc" | "desc" }>({ o: "jarmu", irany: "asc" });
  const sorok: ListaSor[] = useMemo(() => {
    const index = new Map(osszes.map((k, i) => [k.kod, i]));
    const alap = kocsik.flatMap((k) => k.feladatok.map((f) => ({ ...f, jarmuCimke: k.cimke, jarmuIndex: index.get(k.kod) ?? 0 })));
    return rendezLista(alap, rend.o, rend.irany);
  }, [kocsik, osszes, rend]);
  const kattint = (o: ListaOszlop) => setRend((r) => ({ o, irany: r.o === o && r.irany === "asc" ? "desc" : "asc" }));
  return (
    <section aria-label="Lista" className="rounded-2xl border border-foreground/10 bg-card p-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <caption className="sr-only">A nap feladatai — az oszlopfejlécre kattintva rendezhető</caption>
          <thead>
            <tr className="border-b border-foreground/10 text-left">
              {LISTA_OSZLOPOK.map((o) => (
                <th key={o.kulcs} scope="col" aria-sort={rend.o === o.kulcs ? (rend.irany === "asc" ? "ascending" : "descending") : "none"} className="px-1.5 py-1.5 font-semibold">
                  <button type="button" onClick={() => kattint(o.kulcs)} className={cn("inline-flex items-center gap-1 rounded hover:underline", FOKUSZ)}>
                    {o.cimke}<span aria-hidden className="text-muted-foreground">{rend.o === o.kulcs ? (rend.irany === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorok.length === 0 ? (
              <tr><td colSpan={LISTA_OSZLOPOK.length} className="px-1.5 py-4 text-center text-muted-foreground">Nincs a szűrőnek megfelelő feladat.</td></tr>
            ) : sorok.map((f) => {
              const problemas = problemasFeladatok.has(f.kulcs);
              return (
                <tr key={f.kulcs} className={cn("border-b border-foreground/5 align-top", valasztott === f.kulcs && "bg-[var(--f2-blue-l)]/60")}>
                  <td className="px-1.5 py-1.5 font-mono">{f.jarmuCimke}</td>
                  <td className="px-1.5 py-1.5">
                    <button type="button" data-feladat={f.kulcs} onClick={() => onValaszt(f.kulcs, true)} aria-pressed={valasztott === f.kulcs} aria-label={`Kiválasztás: ${feladatCimke(f, problemas)}`}
                      className={cn("rounded border border-foreground/15 px-1.5 py-0.5 font-semibold tabular-nums hover:bg-muted", FOKUSZ)}>
                      {f.sorszam != null ? `#${f.sorszam}` : "—"}
                    </button>
                  </td>
                  <td className="px-1.5 py-1.5"><span className={cn("rounded border px-1 font-semibold", TIPUS_SZIN[f.tipus])}>{FELADAT_TIPUS_CIMKE[f.tipus]}</span></td>
                  <td className="px-1.5 py-1.5">{f.partner ?? "—"}</td>
                  <td className="px-1.5 py-1.5">{varos(f.honnan)}</td>
                  <td className="px-1.5 py-1.5">{varos(f.hova)}</td>
                  <td className="px-1.5 py-1.5 tabular-nums">{ablakSzoveg(f)}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5">{ALLAPOT_JEL[f.allapot]} {FELADAT_ALLAPOT_CIMKE[f.allapot]}{problemas ? " · ⚠" : ""}</td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 tabular-nums">
                    {(f.uresKm ?? 0) + (f.rakottKm ?? 0) > 0 ? `${(f.uresKm ?? 0) + (f.rakottKm ?? 0)} km` : "—"}
                    {f.kmForras === "becsles" ? <span className="ml-1 text-[10px] text-[var(--f2-amb)]">becslés</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 tabular-nums">{f.koltseg ? <>{formatFt(f.koltseg.ft)} <ForrasJel forras={f.koltseg.forras} /></> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ térkép

function Terkep({ adat, kocsik, mostMs, valasztott, onValaszt }: { adat: Diszpecser; kocsik: DiszKocsi[]; mostMs: number; valasztott: string | null; onValaszt: (kod: string) => void }) {
  const b = adat.beallitas;
  const rajzolhato: TerkepKocsi[] = kocsik.filter((k) => k.gps).map((k) => ({
    kod: k.kod, cimke: k.vontato ?? k.kod, sofor: k.sofor, lat: k.gps!.lat, lon: k.gps!.lon,
    ido: oraPerc(k.gps!.utolsoAdat) ?? "?", kor: korSzoveg(k.gps!.utolsoAdat, mostMs),
    frissesseg: gpsFrissesseg(k.gps!.utolsoAdat, mostMs, b.gpsKesoiPerc, b.gpsElavultPerc),
    cim: k.gps!.cim, kovetkezo: k.kovetkezoCel, kijelolt: valasztott === k.kod,
  }));
  const jelNelkul = kocsik.filter((k) => !k.gps);
  return (
    <section aria-label="Térkép" className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3">
      <p className="text-xs text-muted-foreground">Az utolsó ismert GPS-pozíció kocsinként (időponttal és frissességgel), szaggatott vonal a következő megállóig, ha annak ismert a helye. A pozíció mindig a mostani — a választott naptól független.</p>
      <DiszpecserTerkep kocsik={rajzolhato} onValaszt={onValaszt} />
      <ul className="flex flex-col gap-1 text-xs" aria-label="Kocsik pozíciója">
        {rajzolhato.map((k) => (
          <li key={k.kod} className="flex flex-wrap items-center gap-2">
            <b className="font-mono">{k.cimke}</b> {k.sofor} · utolsó jel {k.ido} ({k.kor}) · <span>{GPS_JEL[k.frissesseg].jel} {GPS_FRISSESSEG_CIMKE[k.frissesseg]}</span>
            {k.kovetkezo ? <span className="text-muted-foreground">→ {varos(k.kovetkezo.cim)}</span> : <span className="text-muted-foreground">→ következő megálló helye nem ismert</span>}
          </li>
        ))}
        {jelNelkul.map((k) => (
          <li key={k.kod} className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <b className="font-mono text-foreground">{k.vontato ?? k.kod}</b> {k.sofor} · × nincs GPS — nem rajzoljuk{k.vanGpsEszkoz ? (k.gpsHiba ? ` (${k.gpsHiba})` : "") : " (nincs Ecofleet-eszköz)"}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ részlet-panel

function Sor({ cimke, children }: { cimke: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-xs">
      <dt className="text-muted-foreground">{cimke}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ReszletPanel({ adat, kiv, mostMs, problemak, onBezar }: {
  adat: Diszpecser; kiv: { k: DiszKocsi; f: DiszFeladat } | null; mostMs: number; problemak: Problema[]; onBezar: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [megerosit, setMegerosit] = useState(false);

  if (!kiv) {
    return (
      <div className="rounded-2xl border border-dashed border-foreground/15 bg-card p-4 text-sm text-muted-foreground">
        Válassz egy feladatot az idővonalon, a listán vagy a probléma-sávban — itt jelennek meg a részletei és a műveletek.
      </div>
    );
  }
  const { k, f } = kiv;
  const kes = kesesveszely(f);
  const sajatProbl = problemak.filter((p) => p.feladatKulcs === f.kulcs);
  const km = (f.uresKm ?? 0) + (f.rakottKm ?? 0);
  const menetZarhato = k.menetForras === "jovahagyott" && f.feladatId != null && f.allapot !== "kesz";
  const tervezesLink = `/fuvarozas2/tervezes?menetnap=${adat.nap}#menetterv`;
  const ablak = (a: { tol: string | null; ig: string | null }) => (a.tol || a.ig ? `${oraPerc(a.tol) ?? "?"}–${oraPerc(a.ig) ?? "?"}` : "nincs megadva");

  function lezar() {
    if (!f.feladatId) return;
    start(async () => {
      try {
        const r = await feladatLezaras(f.feladatId!);
        if (!r.ok) { toast.error(r.hiba); router.refresh(); return; }
        toast.success("Feladat lezárva.");
        setMegerosit(false);
        router.refresh();
      } catch {
        toast.error("Nem sikerült — próbáld újra.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{feladatNev(f, varos)}</h2>
          <p className="text-xs text-muted-foreground">{k.vontato ?? k.kod}{k.potkocsi ? ` + ${k.potkocsi}` : ""} · {k.sofor} · {k.menetForras === "javaslat" ? "javaslat" : k.menetForras === "jovahagyott" ? "jóváhagyott menet" : "menet nélkül"}</p>
        </div>
        <button type="button" onClick={onBezar} aria-label="Részletek bezárása" className={cn("rounded-md px-2 py-1 text-sm hover:bg-muted", FOKUSZ)}>×</button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip className={cn("border", TIPUS_SZIN[f.tipus])}>{FELADAT_TIPUS_CIMKE[f.tipus]}</Chip>
        <Chip className={f.allapot === "kesz" ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" : f.allapot === "folyamatban" ? "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : undefined}>
          <span aria-hidden>{ALLAPOT_JEL[f.allapot]}</span> {FELADAT_ALLAPOT_CIMKE[f.allapot]}
        </Chip>
        {kes ? <Chip className="bg-[var(--f2-red-l)] text-[var(--f2-red)]">⛔ késésveszély</Chip> : null}
      </div>

      {sajatProbl.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {sajatProbl.map((p) => (
            <li key={p.kulcs} className={cn("rounded-md px-2 py-1 text-xs", p.sulyos ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]")}>
              {p.sulyos ? "⛔" : "⚠"} <b>{PROBLEMA_CIMKE[p.tipus]}:</b> {p.szoveg.replace(/^.*?: /, "")}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="divide-y divide-foreground/5">
        <Sor cimke="Honnan → hová">{f.honnan ?? "?"} → {f.hova ?? "?"}</Sor>
        {f.partner ? <Sor cimke="Partner">{f.partner}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</Sor> : null}
        <Sor cimke="Felrakási ablak">{ablak(f.felrakasAblak)}</Sor>
        <Sor cimke="Lerakási ablak">{ablak(f.lerakasAblak)}</Sor>
        <Sor cimke="Tervezett">{oraPerc(f.tervIndulas) ?? "?"} → {oraPerc(f.tervErkezes) ?? "?"}</Sor>
        <Sor cimke="Tény">{f.tenyIndulas || f.tenyErkezes ? `${oraPerc(f.tenyIndulas) ?? "?"} → ${oraPerc(f.tenyErkezes) ?? "még nem"}` : "még nincs"}</Sor>
        <Sor cimke="ETA">{f.eta ? `${oraPerc(f.eta)}${f.etaCel ? ` (${f.etaCel})` : ""} · élő GPS-becslés` : f.allapot === "kesz" ? "—" : "nem számolható"}</Sor>
        <Sor cimke="Raklap / kapacitás">
          {f.raklapDb != null ? `${f.raklapDb} db` : f.tipus === "ures_pozicionalas" ? "üres" : "?"} / {f.kapacitasRaklap != null ? `${f.kapacitasRaklap} db` : "nincs megadva"}
          {f.raklapDb != null && f.kapacitasRaklap != null && f.raklapDb > f.kapacitasRaklap ? <span className="ml-1 font-semibold text-[var(--f2-red)]">⛔ túl sok</span> : null}
        </Sor>
        <Sor cimke="Üres km">
          {f.uresKm != null ? `${f.uresKm} km` : "—"}{f.uresKm != null && f.kmForras === "becsles" ? <span className="ml-1 rounded bg-[var(--f2-amb-l)] px-1 text-[10px] text-[var(--f2-amb)]">becslés</span> : null}
        </Sor>
        <Sor cimke="Rakott km">
          {f.rakottKm != null ? `${f.rakottKm} km` : "—"}{f.rakottKm != null && f.kmForras === "becsles" ? <span className="ml-1 rounded bg-[var(--f2-amb-l)] px-1 text-[10px] text-[var(--f2-amb)]">becslés</span> : null}
          {km > 0 ? <span className="ml-1 text-muted-foreground">(össz. {km} km)</span> : null}
        </Sor>
        <Sor cimke="Költség">
          {f.koltseg ? <>{formatFt(f.koltseg.ft)} <ForrasJel forras={f.koltseg.forras} /></> : f.megbizasId ? "még nincs számolva (óránként frissül)" : "a megbízás költségében"}
        </Sor>
        <Sor cimke="GPS">
          <GpsJel k={k} mostMs={mostMs} b={adat.beallitas} />
          {k.gps?.cim ? <span className="mt-0.5 block text-muted-foreground">{k.gps.cim}</span> : null}
        </Sor>
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        {f.megbizasId ? (
          <>
            <Link href={`/fuvarozas2/megbizasok/${f.megbizasId}`} className={cn("rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold hover:bg-muted", FOKUSZ)}>Megbízás #{f.megbizasId}</Link>
            <Link href={`/fuvarozas2/megbizasok/${f.megbizasId}`} title="A dokumentumok a megbízás lapján"  className={cn("rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold hover:bg-muted", FOKUSZ)}>Dokumentumok ({f.dokDb})</Link>
          </>
        ) : null}
        <Link href={tervezesLink} className={cn("rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-semibold hover:bg-muted", FOKUSZ)}>Átrendezés a Tervezésben</Link>
      </div>

      {adat.szerkeszthet ? (
        <div className="flex flex-col gap-1 border-t border-foreground/10 pt-2">
          {menetZarhato ? (
            megerosit ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lezárás megerősítése">
                <span className="text-xs">Biztosan kész ez a feladat?</span>
                <button type="button" disabled={pending} onClick={lezar} className={cn("rounded-lg bg-[var(--f2-mint)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50", FOKUSZ)}>✓ Igen, lezárom</button>
                <button type="button" disabled={pending} onClick={() => setMegerosit(false)} className={cn("rounded-lg border border-foreground/15 px-3 py-1.5 text-xs", FOKUSZ)}>Mégsem</button>
              </div>
            ) : (
              <button type="button" onClick={() => setMegerosit(true)} className={cn("self-start rounded-lg bg-[var(--f2-dark)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90", FOKUSZ)}>✓ Feladat lezárása</button>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {f.allapot === "kesz" ? "A feladat már kész." : k.menetForras === "jovahagyott" ? "Ez a feladat nem zárható le innen." : "Lezárni csak jóváhagyott menet feladatát lehet — a jóváhagyás a Tervezésben van."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
