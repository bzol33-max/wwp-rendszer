"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { varosNev } from "@/lib/fuvarozas/varos";
import { atrendez, feladatLezaras, javaslatFrissites, jovahagy, visszaJavaslatba, type MenettervKocsi } from "@/lib/menet/akciok";
import { elfogad, elutasit, optimalizalas } from "@/lib/menet/optimalizalo-akciok";
import type { OptimalizalasEredmeny } from "@/lib/menet/optimalizalo-szerver";
import { CELFUGGVENY_CIMKE, type Celfuggveny } from "@/lib/menet/optimalizalo";
import { FELADAT_TIPUS_CIMKE, MENET_ALLAPOT_CIMKE, type FeladatTipus, type MenetEsemeny, type MenetFeladat } from "@/lib/menet/tipusok";

// A Tervezés „Menetterv” panelje (3. fázis, 2026-10-10): kocsinként a nap
// feladatai sorrendben (a jóváhagyott menet a sorrend egyetlen forrása —
// a Ma oldal, a GPS lap, a sofőr app és a GPS-figyelő is ezt követi).
// Átrendezés ▲/▼ gombokkal (billentyűzettel is), indokkal.

const TIPUS_SZIN: Record<FeladatTipus, string> = {
  berfuvar: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
  sajat_aru: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  ures_pozicionalas: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  telephelyi_rakodas: "bg-muted text-muted-foreground",
  varakozas: "bg-muted text-muted-foreground",
};

const ESEMENY_CIMKE: Record<string, string> = {
  javaslat_letrehozva: "javaslat készült",
  javaslat_frissitve: "javaslat frissült",
  jovahagyas: "jóváhagyva",
  atrendezes: "átrendezve",
  feladat_lezarva: "feladat kész",
  vissza_javaslatba: "visszavonva javaslatba",
  optimalizalo_elfogadva: "optimalizáló javaslat elfogadva",
};

const FT = (x: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(x))} Ft`;

/** Postgres „2026-10-12 08:00:00+02” → Date. */
function ido(t: string | null): Date | null {
  if (!t) return null;
  let s = t.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const ORA = (d: Date | null) => (d ? d.toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }) : null);
const MIKOR = (t: string) => {
  const d = ido(t);
  return d ? d.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : t;
};
const varos = (cim: string | null) => (cim ? varosNev(cim) || cim : "?");

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", className ?? "bg-muted text-muted-foreground")}>{children}</span>;
}

export function MenettervPanel({ nap, napCimke, kocsik, hiba, szerkeszthet, linkek }: {
  nap: string;
  napCimke: string;
  kocsik: MenettervKocsi[];
  hiba: string | null;
  szerkeszthet: boolean;
  linkek: { elozo: string; kovetkezo: string; ma: string };
}) {
  return (
    <section id="menetterv" className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4" aria-label="Menetterv">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Menetterv · {napCimke}</h2>
          <p className="text-xs text-muted-foreground">
            Kocsinként a nap feladatai sorrendben. A jóváhagyott menet sorrendjét követi a Ma oldal, a GPS lap, a sofőr app és a GPS-figyelő; a javaslatot a rendszer óránként frissíti.
          </p>
        </div>
        <nav className="flex items-center gap-1 text-sm" aria-label="Nap választása">
          <Link href={linkek.elozo} scroll={false} className="rounded-lg border border-foreground/15 px-2.5 py-1 hover:bg-muted" aria-label="Előző nap">‹</Link>
          <Link href={linkek.ma} scroll={false} className="rounded-lg border border-foreground/15 px-2.5 py-1 hover:bg-muted">ma</Link>
          <Link href={linkek.kovetkezo} scroll={false} className="rounded-lg border border-foreground/15 px-2.5 py-1 hover:bg-muted" aria-label="Következő nap">›</Link>
        </nav>
      </div>
      {hiba ? <p className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">{hiba}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {kocsik.map((k) => (
          <KocsiMenet key={`${k.jarmuId}-${k.menet?.id ?? "nincs"}-${k.menet?.verzio ?? 0}`} k={k} nap={nap} szerkeszthet={szerkeszthet} />
        ))}
      </div>
    </section>
  );
}

function KocsiMenet({ k, nap, szerkeszthet }: { k: MenettervKocsi; nap: string; szerkeszthet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mozgatas, setMozgatas] = useState<{ ujSorrend: string[]; leiras: string } | null>(null);
  const [indok, setIndok] = useState("");
  // Az utolsó „Optimalizálás” eredménye — a kártyán marad (nem csak toast), főleg ha nincs megengedett sorrend.
  const [optValasz, setOptValasz] = useState<OptimalizalasEredmeny | null>(null);
  const m = k.menet;
  const optDobozId = m ? `optimalizalo-${m.id}` : undefined;
  const jovahagyott = m != null && m.allapot !== "javaslat";
  const rendezheto = szerkeszthet && m != null && (m.allapot === "jovahagyott" || m.allapot === "folyamatban");
  const feladatok = m ? [...m.feladatok].sort((a, b) => a.sorszam - b.sorszam) : [];
  const munkaIndexek = feladatok.flatMap((f, i) => (f.megbizasId ? [i] : []));
  const optimalizalhato = szerkeszthet && m != null && m.allapot !== "lezart" && munkaIndexek.length >= 2;

  /** A meglévő nyitott javaslat dobozához görget (nem számol újra). */
  function mutasdAJavaslatot() {
    const el = optDobozId ? document.getElementById(optDobozId) : null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el?.focus({ preventScroll: true });
  }

  function optimalizal() {
    if (!m) return;
    // Van már nyitott javaslat: azt mutatjuk, nem hibát.
    if (k.optimalizalo) { setOptValasz(null); mutasdAJavaslatot(); return; }
    start(async () => {
      try {
        const r = await optimalizalas(m.id);
        if (!r.ok) { toast.error(r.hiba); setOptValasz(null); return; }
        setOptValasz(r.eredmeny === "uj" || r.eredmeny === "meglevo" ? null : r);
        if (r.eredmeny === "uj" || r.eredmeny === "meglevo") toast.success(r.uzenet);
        else if (r.eredmeny !== "nincs_megengedett") toast.message(r.uzenet);
        router.refresh();
        if (r.eredmeny === "meglevo") setTimeout(mutasdAJavaslatot, 300);
      } catch {
        toast.error("Nem sikerült az optimalizálás — próbáld újra.");
      }
    });
  }

  function futtat(fn: () => Promise<{ ok: true } | { ok: false; hiba: string }>, siker: string) {
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { toast.error(r.hiba); router.refresh(); return; }
        toast.success(siker);
        setMozgatas(null);
        setIndok("");
        router.refresh();
      } catch {
        toast.error("Nem sikerült — próbáld újra.");
      }
    });
  }

  function mozgat(i: number, irany: -1 | 1) {
    const p = munkaIndexek.indexOf(i);
    const j = munkaIndexek[p + irany];
    if (j == null) return;
    const ids = feladatok.map((f) => f.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setMozgatas({ ujSorrend: ids, leiras: `${varos(feladatok[i].kiinduloCim)} → ${varos(feladatok[i].celCim)} ${irany < 0 ? "feljebb" : "lejjebb"}` });
  }

  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-xl border border-foreground/10 p-3" aria-label={`${k.sofor} menete`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <b className="text-sm">{k.sofor}</b> <span className="font-mono text-xs text-muted-foreground">{k.kod}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {m ? (
            <Chip className={jovahagyott ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" : undefined}>
              {MENET_ALLAPOT_CIMKE[m.allapot]}{jovahagyott ? ` v${m.verzio}` : ""}
            </Chip>
          ) : <Chip>nincs menet</Chip>}
          {szerkeszthet && (!m || m.allapot === "javaslat") ? (
            <button type="button" disabled={pending} onClick={() => futtat(() => javaslatFrissites(k.jarmuId, nap), "Javaslat frissítve.")}
              className="rounded-lg border border-foreground/15 px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-45">
              Javaslat frissítése
            </button>
          ) : null}
          {szerkeszthet && m?.allapot === "javaslat" && feladatok.length > 0 ? (
            <button type="button" disabled={pending} onClick={() => futtat(() => jovahagy(m.id, m.verzio), `Jóváhagyva — ${k.sofor}.`)}
              className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-bold text-background disabled:opacity-45">
              ✓ Jóváhagyás
            </button>
          ) : null}
          {optimalizalhato ? (
            <button type="button" disabled={pending} onClick={optimalizal}
              title={k.optimalizalo ? "Van nyitott javaslat — megmutatja" : "Jobb sorrend keresése (csak javaslat — semmit nem ír át)"}
              aria-controls={k.optimalizalo ? optDobozId : undefined}
              className="rounded-lg border border-foreground/15 px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-45">
              {k.optimalizalo ? `Javaslat #${k.optimalizalo.id}` : "Optimalizálás"}
            </button>
          ) : null}
          {szerkeszthet && m?.allapot === "jovahagyott" ? (
            <button type="button" disabled={pending} onClick={() => futtat(() => visszaJavaslatba(m.id), "Visszavonva javaslatba.")}
              className="rounded-lg border border-foreground/15 px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-45">
              Vissza javaslatba
            </button>
          ) : null}
        </div>
      </div>

      {k.vezetes?.figyelmeztetes ? (
        <p className="rounded-lg bg-[var(--f2-amb-l)] px-2.5 py-1.5 text-xs font-semibold text-[var(--f2-amb)]" role="status">⚠ {k.vezetes.figyelmeztetes.szoveg}</p>
      ) : null}
      {optValasz ? (
        optValasz.eredmeny === "nincs_megengedett" ? (
          <div className="flex flex-col gap-1 rounded-lg bg-[var(--f2-amb-l)] px-2.5 py-2 text-xs text-[var(--f2-amb)]" role="status">
            <b>Nincs a kemény korlátoknak megfelelő sorrend — egyik sorrendben sem teljesül:</b>
            <ul className="list-disc pl-4">
              {(optValasz.korlatok ?? []).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
            {optValasz.mostaniSerulesek?.length && (optValasz.mostaniSerulesek.join("|") !== (optValasz.korlatok ?? []).join("|")) ? (
              <span>A mostani terv: {optValasz.mostaniSerulesek.join(" · ")}</span>
            ) : null}
            <span className="font-normal">A feladatokat el kell osztani (másik kocsi vagy nap), vagy az ablakot egyeztetni — a sorrend átrakása ezt nem oldja meg.</span>
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground" role="status">{optValasz.uzenet}</p>
        )
      ) : null}

      {feladatok.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 px-2.5 py-2 text-xs text-muted-foreground">
          {m ? "Ezen a napon nincs feladat." : "Erre a napra még nincs javaslat — nincs fuvar, vagy a következő óránkénti kör készíti el."}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {feladatok.map((f, i) => (
            <FeladatSor key={f.id} f={f}
              fel={rendezheto && f.megbizasId && !f.lezarvaAt && munkaIndexek.indexOf(i) > 0 && !feladatok[munkaIndexek[munkaIndexek.indexOf(i) - 1]].lezarvaAt ? () => mozgat(i, -1) : null}
              le={rendezheto && f.megbizasId && !f.lezarvaAt && munkaIndexek.indexOf(i) < munkaIndexek.length - 1 ? () => mozgat(i, 1) : null}
              kesz={rendezheto && !f.lezarvaAt ? () => futtat(() => feladatLezaras(f.id), "Feladat kész.") : null}
              pending={pending}
            />
          ))}
        </ol>
      )}

      {k.optimalizalo && m ? (
        <OptimalizaloDoboz id={optDobozId} j={k.optimalizalo} javaslatAllapot={m.allapot === "javaslat"} szerkeszthet={szerkeszthet} pending={pending}
          elfogad={() => futtat(() => elfogad(k.optimalizalo!.id), "Optimalizáló javaslat elfogadva.")}
          elutasit={() => futtat(() => elutasit(k.optimalizalo!.id), "Javaslat elutasítva.")} />
      ) : null}

      {mozgatas && m ? (
        <form className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5"
          onSubmit={(e) => { e.preventDefault(); futtat(() => atrendez(m.id, m.verzio, mozgatas.ujSorrend, indok), "Átrendezve."); }}>
          <label className="flex flex-col gap-1 text-xs">
            <span>Átrendezés: <b>{mozgatas.leiras}</b>. Indok (kötelező):</span>
            <input autoFocus required minLength={3} value={indok} onChange={(e) => setIndok(e.target.value)}
              className="rounded-lg border border-foreground/15 bg-background px-2.5 py-1.5 text-sm" placeholder="pl. a vevő reggelre kérte" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pending || indok.trim().length < 3} className="rounded-lg bg-foreground px-3 py-1 text-xs font-bold text-background disabled:opacity-45">Mentés</button>
            <button type="button" onClick={() => { setMozgatas(null); setIndok(""); }} className="rounded-lg border border-foreground/15 px-3 py-1 text-xs hover:bg-muted">Mégse</button>
          </div>
        </form>
      ) : null}

      {k.esemenyek.length > 0 ? <Naplo esemenyek={k.esemenyek} /> : null}
    </article>
  );
}

function FeladatSor({ f, fel, le, kesz, pending }: { f: MenetFeladat; fel: (() => void) | null; le: (() => void) | null; kesz: (() => void) | null; pending: boolean }) {
  const indul = ORA(ido(f.tervezettIndulas));
  const erk = ORA(ido(f.tervezettErkezes));
  const km = f.feladatTipus === "ures_pozicionalas" ? f.uresKm : f.rakottKm;
  const ut = `${varos(f.kiinduloCim)} → ${varos(f.celCim)}`;
  return (
    <li className={cn("flex items-start gap-2 rounded-lg border border-foreground/10 px-2.5 py-1.5 text-xs", f.lezarvaAt && "opacity-60")}>
      <span className="pt-0.5 font-mono text-muted-foreground">{f.sorszam}.</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className={TIPUS_SZIN[f.feladatTipus]}>{FELADAT_TIPUS_CIMKE[f.feladatTipus]}</Chip>
          <b className="truncate" title={`${f.kiinduloCim ?? "?"} → ${f.celCim ?? "?"}`}>{ut}</b>
          {f.lezarvaAt ? <Chip className="bg-[var(--f2-mint-l)] text-[var(--f2-mint)]">kész</Chip> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground">
          {f.partner ? <span className="truncate">{f.partner}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</span> : null}
          {indul || erk ? <span className="font-mono">{indul ?? "?"}–{erk ?? "?"}</span> : null}
          {km != null ? (
            <span className="font-mono">
              {km} km{f.feladatTipus === "ures_pozicionalas" ? " üres" : ""}
              {f.kmForras === "becsles" ? <span className="ml-1 font-sans text-[10px] font-bold text-[var(--f2-amb)]">becslés</span> : null}
            </span>
          ) : null}
          {f.raklapDb != null ? <span>{f.raklapDb} raklap</span> : null}
        </div>
        {f.figyelmeztetesek.map((w, i) => (
          <p key={i} className="mt-0.5 font-semibold text-[var(--f2-amb)]">⚠ {w.szoveg}</p>
        ))}
      </div>
      {fel || le || kesz ? (
        <div className="flex shrink-0 items-center gap-1">
          {fel || le ? (
            <>
              <button type="button" disabled={pending || !fel} onClick={fel ?? undefined} aria-label={`Feljebb: ${ut}`}
                className="rounded-md border border-foreground/15 px-1.5 py-0.5 hover:bg-muted disabled:opacity-30">▲</button>
              <button type="button" disabled={pending || !le} onClick={le ?? undefined} aria-label={`Lejjebb: ${ut}`}
                className="rounded-md border border-foreground/15 px-1.5 py-0.5 hover:bg-muted disabled:opacity-30">▼</button>
            </>
          ) : null}
          {kesz ? (
            <button type="button" disabled={pending} onClick={kesz} aria-label={`Kész: ${ut}`}
              className="rounded-md border border-foreground/15 px-1.5 py-0.5 hover:bg-muted disabled:opacity-30">✓</button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function OptimalizaloDoboz({ id, j, javaslatAllapot, szerkeszthet, pending, elfogad, elutasit }: {
  id?: string;
  j: NonNullable<MenettervKocsi["optimalizalo"]>;
  javaslatAllapot: boolean;
  szerkeszthet: boolean;
  pending: boolean;
  elfogad: () => void;
  elutasit: () => void;
}) {
  const tagok = Object.keys(CELFUGGVENY_CIMKE) as (Exclude<keyof Celfuggveny, "osszesen">)[];
  const kmOssz = (x: { ures: number; rakott: number; haza: number }) => x.ures + x.rakott + x.haza;
  return (
    <div id={id} tabIndex={-1} className="flex scroll-mt-4 flex-col gap-2 rounded-lg border border-foreground/10 bg-[var(--f2-blue-l)] p-2.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--f2-blue)]" aria-label="Optimalizáló javaslat">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-[var(--f2-blue)]">Optimalizáló javaslat #{j.id}</b>
        <span className="font-semibold">
          {j.megtakaritasFt > 0 ? `−${FT(j.megtakaritasFt)}` : "korlát-javítás"}{j.megtakaritasKm !== 0 ? ` · ${j.megtakaritasKm > 0 ? "−" : "+"}${Math.abs(j.megtakaritasKm)} km` : ""}
        </span>
      </div>
      {j.elavult ? <p className="font-semibold text-[var(--f2-amb)]">A menet azóta változott — elfogadáskor ellenőrizzük; ha elavult, futtasd újra.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {([["Most", j.jelenlegi, j.km.jelenlegi], ["Javasolt", j.javasolt, j.km.javasolt]] as const).map(([cim, lista, km]) => (
          <div key={cim} className="min-w-0">
            <div className="font-semibold text-muted-foreground">{cim} · {kmOssz(km)} km <span className="font-normal">({km.ures} üres, {km.rakott} rakott, {km.haza} haza)</span></div>
            <ol className="mt-0.5 flex flex-col gap-0.5">
              {lista.map((x, i) => (
                <li key={x.id} className="truncate" title={`#${x.id} ${x.ut}`}><span className="font-mono text-muted-foreground">{i + 1}.</span> {x.ut}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground"><th className="text-left font-normal">J tagjai</th><th className="text-right font-normal">most</th><th className="text-right font-normal">javasolt</th></tr>
        </thead>
        <tbody className="font-mono">
          {tagok.filter((t) => j.celfuggveny.jelenlegi[t] !== 0 || j.celfuggveny.javasolt[t] !== 0).map((t) => (
            <tr key={t}><td className="font-sans">{CELFUGGVENY_CIMKE[t]}</td><td className="text-right">{FT(j.celfuggveny.jelenlegi[t])}</td><td className="text-right">{FT(j.celfuggveny.javasolt[t])}</td></tr>
          ))}
          <tr className="border-t border-foreground/10 font-bold"><td className="font-sans">összesen (J)</td><td className="text-right">{FT(j.celfuggveny.jelenlegi.osszesen)}</td><td className="text-right">{FT(j.celfuggveny.javasolt.osszesen)}</td></tr>
        </tbody>
      </table>
      {j.megjegyzesek.map((x, i) => <p key={`m${i}`} className="text-muted-foreground">• {x}</p>)}
      {j.figyelmeztetesek.map((x, i) => <p key={`f${i}`} className="font-semibold text-[var(--f2-amb)]">⚠ {x}</p>)}
      {szerkeszthet ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={elfogad} className="rounded-lg bg-foreground px-3 py-1 text-xs font-bold text-background disabled:opacity-45">Elfogadás</button>
          <button type="button" disabled={pending} onClick={elutasit} className="rounded-lg border border-foreground/15 px-3 py-1 text-xs hover:bg-muted disabled:opacity-45">Elutasítás</button>
          <span className="text-[11px] text-muted-foreground">
            {javaslatAllapot ? "A javaslat ebben a sorrendben készül újra; a jóváhagyás külön lépés." : "Átrendezés a menet verziójával, „optimalizáló javaslat” indokkal, naplózva."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Naplo({ esemenyek }: { esemenyek: MenetEsemeny[] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Napló ({esemenyek.length})</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {esemenyek.map((e) => {
          const r = e.reszletek as { regi?: unknown; uj?: unknown };
          return (
            <li key={e.id} className="border-t border-foreground/5 pt-1">
              <span className="font-mono text-muted-foreground">{MIKOR(e.mikor)}</span>{" "}
              <b>{ESEMENY_CIMKE[e.esemeny] ?? e.esemeny}</b>
              {e.verzio != null ? <span className="text-muted-foreground"> · v{e.verzio}</span> : null}
              {e.ki ? <span className="text-muted-foreground"> · {e.ki}</span> : null}
              {e.ok ? <span> — „{e.ok}”</span> : null}
              {e.esemeny === "atrendezes" && Array.isArray(r.regi) && Array.isArray(r.uj) ? (
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {r.regi.filter((x) => /^\d+$/.test(String(x))).map((x) => `#${x}`).join(" ")} → {r.uj.filter((x) => /^\d+$/.test(String(x))).map((x) => `#${x}`).join(" ")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
