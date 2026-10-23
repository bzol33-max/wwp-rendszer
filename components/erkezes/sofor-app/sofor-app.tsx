"use client";

// A sofőr app (/erkezes, „sofor” szerepkör) — Budaházi Zoltán 2026-10-21-i
// döntése a 6. tervkörből („a 9-es terv”, gyorsgombos kezdőlap):
//
//  Ma         — nagyban a soros cél és a becsült km, alatta négy kerek gomb
//               (Megérkeztem → Lepakoltam/Felpakoltam, Navi, Papír, Hívás),
//               az átlagfogyasztás csíkja és a teendők (Papír vár,
//               Megbízásaim, Kész fuvarok).
//  Lerakás után a papír NEM tartja fel a sofőrt: a fuvar a „Papír vár”
//               listába kerül (napokon át megmarad), a gombsor pedig már a
//               következő megbízásé. Pihenőkor / este fotóz (fotozas.tsx).
//  Megbízások — kártyák (Előttem / Kész), rákoppintva a részletek: megállók
//               címmel, időponttal, kóddal, Navi és hívás megállónként.
//  Profil     — a meglévő Profil képernyő, változatlanul.
//
// Ami szándékosan NEM jelenik meg (a korábbi döntések szerint): pénz
// (fuvardíj, költség, ár), raklapcsere, tachó, a megbízók szabad szöveges
// utasításai. A sorrend és a kész/nem kész állapot a GPS lapról jön, ahogy
// eddig (lib/fuvarozas/sofor.ts getSoforNap).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Droplet,
  FileText,
  LocateFixed,
  MessageSquareWarning,
  Navigation,
  Phone,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PullToRefresh } from "@/components/mobil/pull-to-refresh";
import { useSzelHuzas } from "@/components/mobil/use-szel-huzas";
import {
  getSoforNap,
  getSoforNapokElore,
  jelezGondot,
  jelolMegerkeztem,
  jelolVarakozast,
  markMegalloKesz,
  rogzitMegalloHelyet,
  visszavonMegalloKesz,
  type SoforFuvarBlokk,
  type SoforMegalloSor,
  type SoforNap,
} from "@/lib/fuvarozas/sofor";
import {
  getSoforFogyasztas,
  getSoforKesz,
  getSoforPapirVaro,
  type SoforFogyasztas,
  type SoforLezartTetel,
} from "@/lib/fuvarozas/sofor-app";
import { napCimke, papirNeve, tizedes } from "@/lib/fuvarozas/sofor-app-alap";
import { budapestNapISO, kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";
import { kontaktNev, kontaktTelefon } from "@/lib/fuvarozas/sofor-adatok";
import { SOFOR_THEME } from "./tema";
import { Fotozas, type FotoFuvar } from "./fotozas";
import { sorAllapot, sorFeldolgoz } from "./papir-sor";

// ------------------------------------------------------------- segédek

const IDO: Intl.DateTimeFormatOptions = { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" };
const ido = (d: Date | string) => new Date(d).toLocaleTimeString("hu-HU", IDO);

function navigacio(cim: string) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cim)}`, "_blank", "noopener,noreferrer");
}

function iratMegnyitasa(id: string) {
  window.open(`/api/fuvarozas/dokumentum/${id}`, "_blank", "noopener,noreferrer");
}

/** A megállók városai, az egymás utáni ismétlés nélkül. */
function utvonal(b: SoforFuvarBlokk): string {
  return b.megallok
    .filter((m, i, t) => i === 0 || t[i - 1].varos !== m.varos)
    .map((m) => m.varos)
    .join(" → ");
}

function megrendeloCimke(b: { megrendelo: string | null; sajatFuvar: boolean }): string {
  return b.megrendelo ?? (b.sajatFuvar ? "saját fuvar" : "megbízás");
}

/** "08:40" vagy "csüt · 06:00" — a megálló ideje a megbízás szerint. */
function megalloIdo(m: SoforMegalloSor, maNap: string): string | null {
  const nap = m.nap && m.nap !== maNap ? napCimke(m.nap, maNap) : null;
  return [nap, m.ido].filter(Boolean).join(" · ") || null;
}

function papirraVar(b: SoforFuvarBlokk): boolean {
  return b.megallok.length > 0 && b.megallok.every((m) => m.kesz) && !b.dokumentumok.some((d) => d.tipus === "fuvarlevel");
}

function utolsoVisszavonhato(b: SoforFuvarBlokk): SoforMegalloSor | null {
  return (
    b.megallok
      .filter((m) => m.visszavonhato && m.keszAt)
      .sort((x, y) => new Date(y.keszAt!).getTime() - new Date(x.keszAt!).getTime())[0] ?? null
  );
}

function hivhato(b: SoforFuvarBlokk, m: SoforMegalloSor | null): { szam: string; nev: string } | null {
  const t = kontaktTelefon(m?.kontakt);
  if (t) return { szam: t, nev: kontaktNev(m?.kontakt) ?? "Helyszín" };
  if (b.kapcsolat?.telefon) return { szam: b.kapcsolat.telefon, nev: b.kapcsolat.nev ?? "Megbízó" };
  return null;
}

const PAPIR_NEM_KELL_KULCS = "sofor-papir-nem-kaptam";

function nemKaptamOlvas(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(PAPIR_NEM_KELL_KULCS) ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function nemKaptamIr(idk: string[]) {
  try {
    window.localStorage.setItem(PAPIR_NEM_KELL_KULCS, JSON.stringify(idk.slice(-50)));
  } catch {
    // privát mód — legfeljebb újra megjelenik
  }
}

type PapirTetel = SoforLezartTetel;

function blokkbolPapir(b: SoforFuvarBlokk): PapirTetel {
  const fel = b.megallok.find((m) => m.tipus === "felrako");
  const le = [...b.megallok].reverse().find((m) => m.tipus === "lerako");
  const utolso = [...b.megallok].reverse().find((m) => m.keszAt);
  return {
    fuvarId: b.fuvarId,
    megrendelo: b.megrendelo,
    honnan: fel?.varos ?? null,
    hova: le?.varos ?? null,
    nap: le?.nap ?? fel?.nap ?? null,
    lezarvaAt: utolso?.keszAt ? new Date(utolso.keszAt).toISOString() : null,
    sajatFuvar: b.sajatFuvar,
    papirMegvan: false,
  };
}

function fotoFuvar(p: PapirTetel): FotoFuvar {
  return {
    fuvarId: p.fuvarId,
    cim: [p.honnan, p.hova].filter(Boolean).join(" → ") || "Fuvar",
    alcim: megrendeloCimke(p),
    papirNev: papirNeve(p.sajatFuvar),
    sajatFuvar: p.sajatFuvar,
  };
}

// ------------------------------------------------------------- építőkövek

function Kor({
  label,
  onClick,
  fo,
  disabled,
  jelveny,
  children,
}: {
  label: string;
  onClick: () => void;
  fo?: boolean;
  disabled?: boolean;
  jelveny?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 text-[13px] font-bold disabled:opacity-40"
    >
      <span
        className={`relative flex h-[62px] w-[62px] items-center justify-center rounded-full shadow-[0_1px_2px_rgba(11,18,32,.06)] ${fo ? "bg-[var(--sa-blue)] text-white" : "bg-[var(--sa-card)] text-[var(--sa-ink)]"}`}
      >
        {children}
        {jelveny ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FFC20E] px-1.5 text-xs font-extrabold text-[var(--sa-ink)]">
            {jelveny}
          </span>
        ) : null}
      </span>
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

function Sor({
  jel,
  jelSzin,
  cim,
  al,
  jobb,
  onClick,
}: {
  jel: ReactNode;
  jelSzin: "amber" | "blue" | "green" | "gray";
  cim: ReactNode;
  al?: ReactNode;
  jobb?: ReactNode;
  onClick?: () => void;
}) {
  const szin = {
    amber: "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]",
    blue: "bg-[var(--sa-blue-soft)] text-[var(--sa-blue)]",
    green: "bg-[var(--sa-green-soft)] text-[var(--sa-green)]",
    gray: "bg-[#F1F2F6] text-[#4B5563]",
  }[jelSzin];
  const belso = (
    <>
      <span className={`flex h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-full px-1 text-[15px] font-extrabold ${szin}`}>{jel}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{cim}</span>
        {al ? <span className="block truncate text-sm text-[var(--sa-muted)]">{al}</span> : null}
      </span>
      {jobb ?? (onClick ? <ChevronRight className="h-5 w-5 shrink-0 text-[#9CA3AF]" /> : null)}
    </>
  );
  const osztaly = "flex w-full items-center gap-3.5 border-b border-[var(--sa-line)] py-3.5 text-left last:border-b-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={osztaly}>
      {belso}
    </button>
  ) : (
    <div className={osztaly}>{belso}</div>
  );
}

function Doboz({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="rounded-3xl bg-[var(--sa-card)] px-[18px] py-1">
      {children}
    </section>
  );
}

function Fejlec({ cim, al, onVissza }: { cim: string; al?: string | null; onVissza: () => void }) {
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Vissza"
        onClick={onVissza}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--sa-card)]"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="line-clamp-2 text-[23px] font-extrabold leading-tight tracking-tight">{cim}</h1>
        {al ? <p className="truncate text-sm text-[var(--sa-muted)]">{al}</p> : null}
      </div>
    </header>
  );
}

function Keret({ children, onVissza, onFrissit, alul }: { children: ReactNode; onVissza?: () => void; onFrissit: () => Promise<void>; alul?: ReactNode }) {
  const huzas = useSzelHuzas(onVissza);
  return (
    <div
      style={SOFOR_THEME}
      className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-[linear-gradient(180deg,var(--sa-bg-top)_0%,var(--sa-bg)_320px)] text-[var(--sa-ink)]"
      {...huzas}
    >
      <PullToRefresh className="flex-1 overflow-y-auto" indicatorClassName="text-[var(--sa-muted)]" onRefresh={onFrissit}>
        <div className="flex flex-col gap-4 px-[18px] pb-6 pt-4">{children}</div>
      </PullToRefresh>
      {alul}
    </div>
  );
}

function AlsoMenu({ aktiv, onMa, onMegbizasok, onProfil }: { aktiv: "ma" | "megbizasok"; onMa: () => void; onMegbizasok: () => void; onProfil: () => void }) {
  const gomb = (cimke: string, ez: boolean, fn: () => void) => (
    <button
      type="button"
      onClick={fn}
      aria-current={ez ? "page" : undefined}
      className={`h-11 rounded-[14px] text-sm font-bold ${ez ? "bg-[var(--sa-blue-soft)] text-[var(--sa-blue)]" : "text-[var(--sa-muted)]"}`}
    >
      {cimke}
    </button>
  );
  return (
    <nav aria-label="Fő menü" className="mx-[18px] mb-[max(14px,env(safe-area-inset-bottom))] grid grid-cols-3 gap-1 rounded-[20px] bg-[var(--sa-card)] p-1.5 shadow-[0_2px_10px_rgba(11,18,32,.06)]">
      {gomb("Ma", aktiv === "ma", onMa)}
      {gomb("Megbízások", aktiv === "megbizasok", onMegbizasok)}
      {gomb("Profil", false, onProfil)}
    </nav>
  );
}

// ------------------------------------------------------------- a gombsor

type Muveletek = {
  pending: boolean;
  erkezes: (m: SoforMegalloSor) => void;
  kesz: (m: SoforMegalloSor) => void;
  hely: (m: SoforMegalloSor) => void;
  visszavon: (fuvarId: string, megalloIndex: number, leiras: string) => void;
  gond: (fuvarId: string) => void;
};

function Gombsor({
  blokk,
  aktiv,
  mv,
  papirDb,
  onPapir,
}: {
  blokk: SoforFuvarBlokk;
  aktiv: SoforMegalloSor;
  mv: Muveletek;
  papirDb: number;
  onPapir: () => void;
}) {
  const erkezett = Boolean(aktiv.keziErkezes);
  const tel = hivhato(blokk, aktiv);
  return (
    <div role="group" aria-label="Gyorsgombok" className="grid grid-cols-4 gap-2">
      {erkezett ? (
        <Kor fo label={aktiv.tipus === "lerako" ? "Lepakoltam" : "Felpakoltam"} disabled={mv.pending} onClick={() => mv.kesz(aktiv)}>
          <ArrowRight className="h-[26px] w-[26px]" strokeWidth={2.6} />
        </Kor>
      ) : (
        <Kor fo label="Megérkeztem" disabled={mv.pending} onClick={() => mv.erkezes(aktiv)}>
          <Check className="h-[26px] w-[26px]" strokeWidth={2.8} />
        </Kor>
      )}
      <Kor label="Navi" onClick={() => navigacio(aktiv.cim)}>
        <Navigation className="h-6 w-6" />
      </Kor>
      <Kor label="Papír" jelveny={papirDb} onClick={onPapir}>
        <Camera className="h-6 w-6" />
      </Kor>
      {tel ? (
        <Kor label="Hívás" onClick={() => (window.location.href = `tel:${tel.szam}`)}>
          <Phone className="h-6 w-6" />
        </Kor>
      ) : (
        <Kor label="Gond van" disabled={mv.pending} onClick={() => mv.gond(blokk.fuvarId)}>
          <MessageSquareWarning className="h-6 w-6" />
        </Kor>
      )}
    </div>
  );
}

function MegalloKiegeszitok({ blokk, aktiv, mv }: { blokk: SoforFuvarBlokk; aktiv: SoforMegalloSor | null; mv: Muveletek }) {
  const v = utolsoVisszavonhato(blokk);
  const hely = aktiv && !aktiv.kesz && !aktiv.helyRogzitve && aktiv.helyBizonytalan;
  if (!v && !hely && !aktiv?.keziErkezes) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      {aktiv?.keziErkezes && (
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--sa-green-soft)] px-3 py-1 font-bold text-[var(--sa-green)]">
          <Check className="h-4 w-4" strokeWidth={3} />
          Megérkeztél {ido(aktiv.keziErkezes)}
        </span>
      )}
      {hely && (
        <button
          type="button"
          disabled={mv.pending}
          onClick={() => mv.hely(aktiv)}
          className="flex items-center gap-1.5 font-semibold text-[var(--sa-muted)] underline underline-offset-2"
          title="A rendszer nem találja pontosan ezt a címet. Ha a rakodóhelyen állsz, koppints: a kocsi mostani helyét jegyezzük fel a címhez."
        >
          <LocateFixed className="h-4 w-4" />
          Itt vagyok
        </button>
      )}
      {v && (
        <button
          type="button"
          disabled={mv.pending}
          onClick={() => mv.visszavon(v.fuvarId, v.megalloIndex, `${v.tipus === "felrako" ? "Felrakó" : "Lerakó"} · ${v.varos}${v.keszAt ? ` — kész ${ido(v.keszAt)}` : ""}`)}
          className="font-semibold text-[var(--sa-muted)] underline underline-offset-2"
        >
          Tévesen jelölted? Visszavonom
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Ma

function FogyasztasCsik({ f, onClick }: { f: SoforFogyasztas | null; onClick: () => void }) {
  if (!f || !f.merve || f.kep.het.l100 == null) return null;
  const v = f.kep.valtozas;
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-[20px] bg-[var(--sa-card)] px-4 py-3 text-left">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--sa-green-soft)] text-[var(--sa-green)]">
        <Droplet className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[var(--sa-muted)]">Átlagfogyasztás, 7 nap</span>
        <span className="block text-xl font-extrabold">
          {tizedes(f.kep.het.l100)} <span className="text-sm font-semibold text-[var(--sa-muted)]">l/100 km</span>
        </span>
      </span>
      {v != null && v !== 0 && (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold ${v < 0 ? "bg-[var(--sa-green-soft)] text-[var(--sa-green)]" : "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]"}`}
        >
          {v < 0 ? "▼" : "▲"} {tizedes(Math.abs(v))} l
        </span>
      )}
    </button>
  );
}

function MaKepernyo({
  nev,
  nap,
  maNap,
  aktivBlokk,
  aktiv,
  kovetkezoBlokk,
  kovetkezoCimke,
  papirok,
  elottemDb,
  sorDb,
  fogyasztas,
  mv,
  elolegSav,
  onReszlet,
  onPapir,
  onMegbizasok,
  onKesz,
  onFogyasztas,
  onSorUjra,
}: {
  nev: string;
  nap: SoforNap;
  maNap: string;
  aktivBlokk: SoforFuvarBlokk | null;
  aktiv: SoforMegalloSor | null;
  kovetkezoBlokk: SoforFuvarBlokk | null;
  kovetkezoCimke: string;
  papirok: PapirTetel[];
  elottemDb: number | null;
  sorDb: number;
  fogyasztas: SoforFogyasztas | null;
  mv: Muveletek;
  elolegSav: ReactNode;
  onReszlet: (b: SoforFuvarBlokk) => void;
  onPapir: () => void;
  onMegbizasok: () => void;
  onKesz: () => void;
  onFogyasztas: () => void;
  onSorUjra: () => void;
}) {
  const papirVarosok = papirok.map((p) => p.hova ?? p.honnan).filter(Boolean).slice(0, 3).join(", ");

  return (
    <>
      <header className="flex items-center justify-between">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[var(--sa-ink)] font-extrabold text-white">
          {nev.trim().split(/\s+/).at(-1)?.[0] ?? "?"}
        </span>
        <span className="rounded-full bg-[var(--sa-card)] px-3.5 py-2 text-sm font-bold">{nap.jarmuLabel}</span>
      </header>
      {elolegSav}
      {nap.hiba && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--sa-red)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          {nap.hiba}
        </p>
      )}

      {aktivBlokk && aktiv ? (
        <>
          <section aria-label="Most" className="mt-1 flex flex-col items-center gap-1 text-center">
            <span className="text-sm font-semibold text-[var(--sa-muted)]">{megrendeloCimke(aktivBlokk)} · {utvonal(aktivBlokk)}</span>
            <span className="text-base font-bold text-[#4B5563]">
              {[aktiv.tipus === "lerako" ? "Lerakás" : "Felrakás", megalloIdo(aktiv, maNap)].filter(Boolean).join(" · ")}
            </span>
            <span className="text-[44px] font-extrabold leading-[1.05] tracking-[-0.03em]">{aktiv.varos}</span>
            {aktiv.ceg && <span className="text-lg font-bold">{aktiv.ceg}</span>}
            <span className="text-[15px] text-[#4B5563]">{aktiv.cim}</span>
          </section>
          <Gombsor blokk={aktivBlokk} aktiv={aktiv} mv={mv} papirDb={papirok.length} onPapir={onPapir} />
          <MegalloKiegeszitok blokk={aktivBlokk} aktiv={aktiv} mv={mv} />
          <MegbizasInfo b={aktivBlokk} maNap={maNap} mv={mv} />
        </>
      ) : (
        <section className="mt-1 flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sa-green-soft)] text-[var(--sa-green)]">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <span className="text-2xl font-extrabold">{nap.fuvarok.length ? "Mára végeztél" : "Mára nincs fuvarod"}</span>
          {kovetkezoBlokk && (
            <button type="button" onClick={() => onReszlet(kovetkezoBlokk)} className="rounded-full bg-[var(--sa-card)] px-4 py-2 text-[15px] font-bold">
              {kovetkezoCimke}: {utvonal(kovetkezoBlokk)}
            </button>
          )}
        </section>
      )}

      {nap.nemregLezartak.map((l) => (
        <div key={l.fuvarId} className="flex items-center gap-3 rounded-[20px] bg-[var(--sa-card)] px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--sa-muted)]">Lezártad {ido(l.keszAt)}-kor</span>
            <span className="block truncate font-bold">{l.honnan ?? "—"} → {l.hova ?? "—"}</span>
          </span>
          <button
            type="button"
            disabled={mv.pending}
            onClick={() => mv.visszavon(l.fuvarId, l.megalloIndex, `${l.honnan ?? "—"} → ${l.hova ?? "—"} (${l.megrendelo ?? "megbízás"})`)}
            className="h-10 shrink-0 rounded-xl bg-[#F1F2F6] px-3 text-sm font-bold"
          >
            Visszavonom
          </button>
        </div>
      ))}

      {sorDb > 0 && (
        <button type="button" onClick={onSorUjra} className="flex items-center gap-3 rounded-[20px] bg-[var(--sa-blue-soft)] px-4 py-3 text-left text-[var(--sa-blue)]">
          <CloudUpload className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[15px] font-bold">{sorDb} oldal feltöltésre vár</span>
          <span className="text-sm font-bold underline underline-offset-2">Most</span>
        </button>
      )}

      <FogyasztasCsik f={fogyasztas} onClick={onFogyasztas} />

      <Doboz label="Teendők">
        {papirok.length > 0 && (
          <Sor jel={papirok.length} jelSzin="amber" cim="Papír vár" al={papirVarosok} onClick={onPapir} />
        )}
        <Sor
          jel={elottemDb ?? "…"}
          jelSzin="blue"
          cim="Megbízásaim"
          al={kovetkezoBlokk ? `${kovetkezoCimke.toLowerCase()}: ${utvonal(kovetkezoBlokk)}` : "a következő két hét"}
          onClick={onMegbizasok}
        />
        <Sor jel={<Check className="h-5 w-5" strokeWidth={3} />} jelSzin="green" cim="Kész fuvarok" al="az utolsó 10" onClick={onKesz} />
      </Doboz>
    </>
  );
}

// ------------------------------------------------------------- Megbízások

function MegbizasKartya({ b, most, maNap, onClick }: { b: SoforFuvarBlokk; most: boolean; maNap: string; onClick: () => void }) {
  const fel = b.megallok.find((m) => m.tipus === "felrako");
  const le = [...b.megallok].reverse().find((m) => m.tipus === "lerako");
  const lerakoDb = b.megallok.filter((m) => m.tipus === "lerako").length;
  const nap = napCimke(fel?.nap ?? le?.nap, maNap);
  const nyitott = b.sajatFuvar && !fel?.ido && !le?.ido;
  const sor = (m: SoforMegalloSor | undefined, tomor: boolean) =>
    m ? (
      <>
        <span className={`h-2.5 w-2.5 rounded-full ${tomor ? "bg-[var(--sa-ink)]" : "border-[3px] border-[var(--sa-ink)]"}`} />
        <span className={`truncate text-lg font-extrabold ${m.kesz ? "text-[var(--sa-muted)] line-through decoration-2" : ""}`}>{m.varos}</span>
        <span className="text-sm font-semibold text-[var(--sa-muted)]">{megalloIdo(m, maNap) ?? (m.nap ? napCimke(m.nap, maNap) : "")}</span>
      </>
    ) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-[22px] bg-[var(--sa-card)] px-[18px] py-4 text-left ${most ? "shadow-[inset_0_0_0_2px_var(--sa-blue)]" : ""}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-[var(--sa-muted)]">{megrendeloCimke(b)}</span>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-extrabold ${most ? "bg-[var(--sa-blue-soft)] text-[var(--sa-blue)]" : nyitott ? "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]" : "bg-[#F1F2F6] text-[#4B5563]"}`}
        >
          {most ? "Most" : nyitott ? `${nap ?? ""} · nyitott idő`.replace(/^ · /, "") : nap ?? "—"}
        </span>
      </span>
      <span className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1">
        {sor(fel, false)}
        {fel && le && (
          <>
            <span className="h-3.5 w-0.5 justify-self-center bg-[#D5DAE3]" />
            <span className="text-xs text-[var(--sa-muted)]">{lerakoDb > 1 ? `${lerakoDb} lerakó` : ""}</span>
            <span />
          </>
        )}
        {sor(le, true)}
      </span>
      <span className="flex justify-between gap-3 border-t border-[var(--sa-line)] pt-2.5 text-sm text-[var(--sa-muted)]">
        <span className="truncate">{[b.aru, b.mennyiseg].filter(Boolean).join(" · ") || "—"}</span>
        <span className="shrink-0">{papirNeve(b.sajatFuvar).replace("aláírt ", "")}</span>
      </span>
    </button>
  );
}

function MegbizasokKepernyo({
  elottem,
  aktivId,
  kesz,
  ful,
  maNap,
  onFul,
  onReszlet,
  onFoto,
}: {
  elottem: SoforFuvarBlokk[] | null;
  aktivId: string | null;
  kesz: SoforLezartTetel[] | null;
  ful: "elottem" | "kesz";
  maNap: string;
  onFul: (f: "elottem" | "kesz") => void;
  onReszlet: (b: SoforFuvarBlokk) => void;
  onFoto: (p: PapirTetel) => void;
}) {
  const fulGomb = (f: "elottem" | "kesz", cimke: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={ful === f}
      onClick={() => onFul(f)}
      className={`h-10 rounded-[10px] text-[15px] ${ful === f ? "bg-[var(--sa-card)] font-extrabold" : "font-bold text-[var(--sa-muted)]"}`}
    >
      {cimke}
    </button>
  );
  return (
    <>
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight">Megbízásaim</h1>
        <p className="text-sm text-[var(--sa-muted)]">a következő két hét és az utolsó 10 kész</p>
      </header>
      <div role="tablist" className="grid grid-cols-2 rounded-[14px] bg-[#E3E8F2] p-1">
        {fulGomb("elottem", `Előttem${elottem ? ` · ${elottem.length}` : ""}`)}
        {fulGomb("kesz", "Kész · 10")}
      </div>
      {ful === "elottem" ? (
        elottem == null ? (
          <p className="text-sm text-[var(--sa-muted)]">Betöltés…</p>
        ) : elottem.length === 0 ? (
          <p className="rounded-[22px] bg-[var(--sa-card)] px-4 py-5 text-center text-[15px] text-[var(--sa-muted)]">Nincs előtted megbízás a következő két hétben.</p>
        ) : (
          elottem.map((b) => <MegbizasKartya key={b.fuvarId} b={b} most={b.fuvarId === aktivId} maNap={maNap} onClick={() => onReszlet(b)} />)
        )
      ) : kesz == null ? (
        <p className="text-sm text-[var(--sa-muted)]">Betöltés…</p>
      ) : kesz.length === 0 ? (
        <p className="rounded-[22px] bg-[var(--sa-card)] px-4 py-5 text-center text-[15px] text-[var(--sa-muted)]">Még nincs lezárt fuvarod.</p>
      ) : (
        <Doboz label="Kész fuvarok">
          {kesz.map((k) => (
            <Sor
              key={k.fuvarId}
              jel={k.papirMegvan ? <Check className="h-5 w-5" strokeWidth={3} /> : <Camera className="h-5 w-5" />}
              jelSzin={k.papirMegvan ? "green" : "amber"}
              cim={[k.honnan, k.hova].filter(Boolean).join(" → ") || "Fuvar"}
              al={[napCimke(k.nap, maNap), k.papirMegvan ? "papír rendben" : "papír kell"].filter(Boolean).join(" · ")}
              onClick={k.papirMegvan ? undefined : () => onFoto(k)}
            />
          ))}
        </Doboz>
      )}
    </>
  );
}

// ------------------------------------------------------------- részletek

function MegalloBlokk({ m, sorszam, maNap }: { m: SoforMegalloSor; sorszam: number; maNap: string }) {
  const tel = kontaktTelefon(m.kontakt);
  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-x-3 border-b border-[var(--sa-line)] py-3.5 last:border-b-0">
      <span
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm font-extrabold ${m.kesz ? "bg-[var(--sa-green-soft)] text-[var(--sa-green)]" : m.tipus === "felrako" ? "bg-white text-[var(--sa-ink)] shadow-[inset_0_0_0_3px_var(--sa-ink)]" : "bg-[var(--sa-ink)] text-white"}`}
      >
        {m.kesz ? <Check className="h-4 w-4" strokeWidth={3} /> : sorszam}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex justify-between gap-2 text-sm">
          <span className="font-bold text-[var(--sa-muted)]">{m.tipus === "felrako" ? "Felrakás" : "Lerakás"}</span>
          <span className="font-extrabold">{m.kesz && m.keszAt ? `kész ${ido(m.keszAt)}` : megalloIdo(m, maNap)}</span>
        </span>
        <span className="text-lg font-extrabold">{m.ceg ?? m.varos}</span>
        <span className="text-[15px]">{m.cim}</span>
        {m.rakomany && <span className="text-sm">{m.tipus === "felrako" ? "Fel: " : "Le: "}<b>{m.rakomany}</b></span>}
        {m.kod && <span className="text-sm text-[var(--sa-muted)]">Kód: <b className="font-mono text-[var(--sa-ink)]">{m.kod}</b></span>}
        {!m.kesz && (
          <span className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => navigacio(m.cim)}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--sa-blue-soft)] font-bold text-[var(--sa-blue)]"
            >
              <Navigation className="h-[18px] w-[18px]" />
              Navi
            </button>
            {tel && (
              <a href={`tel:${tel}`} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F1F2F6] font-bold">
                <Phone className="h-[18px] w-[18px]" />
                <span className="truncate">{kontaktNev(m.kontakt) ?? "Hívás"}</span>
              </a>
            )}
          </span>
        )}
        {!tel && m.kontakt && !m.kesz && <span className="mt-1 text-sm text-[var(--sa-muted)]">Kontakt: {m.kontakt}</span>}
      </div>
    </div>
  );
}

function AdatSor({ cimke, ertek, mono }: { cimke: string; ertek: string | null | undefined; mono?: boolean }) {
  if (!ertek?.trim()) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--sa-line)] py-3.5 last:border-b-0">
      <span className="shrink-0 text-[var(--sa-muted)]">{cimke}</span>
      <span className={`min-w-0 break-words text-right font-bold ${mono ? "font-mono" : ""}`}>{ertek}</span>
    </div>
  );
}

/** A megbízás minden adata — a Ma oldalon az aktuálisé, a részleteknél bármelyiké. */
function MegbizasInfo({ b, maNap, mv }: { b: SoforFuvarBlokk; maNap: string; mv: Muveletek }) {
  const pdf = b.dokumentumok.find((d) => d.tipus === "megbizas") ?? b.dokumentumok.find((d) => d.tipus !== "fuvarlevel") ?? null;
  return (
    <>
      {b.masRendszam && (
        <p className="flex items-center gap-1.5 rounded-xl bg-[var(--sa-red-soft)] px-3 py-2 text-sm font-semibold text-[var(--sa-red)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />A megbízáson más rendszám áll: {b.masRendszam}
        </p>
      )}
      <section aria-label="Megállók" className="rounded-3xl bg-[var(--sa-card)] px-[18px] py-0.5">
        {b.megallok.map((m, i) => (
          <MegalloBlokk key={m.megalloIndex} m={m} sorszam={i + 1} maNap={maNap} />
        ))}
      </section>
      <section aria-label="Részletek" className="rounded-3xl bg-[var(--sa-card)] px-[18px] py-0.5">
        <AdatSor cimke="Áru" ertek={[b.aru, b.mennyiseg, b.suly].filter(Boolean).join(" · ")} />
        <AdatSor cimke="Pozíciószám" ertek={b.pozicioszam} mono />
        <AdatSor cimke="Referencia" ertek={b.referencia} mono />
        <AdatSor cimke="Út ID" ertek={b.reiseId} mono />
        <AdatSor cimke="Jármű" ertek={b.jarmuEloiras} />
        <AdatSor cimke="Papír a végén" ertek={papirNeve(b.sajatFuvar)} />
      </section>
      <div className="flex gap-2.5">
        {pdf && (
          <button
            type="button"
            onClick={() => iratMegnyitasa(pdf.id)}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-card)] font-bold"
          >
            <FileText className="h-5 w-5" />
            Megbízás PDF
          </button>
        )}
        <button
          type="button"
          disabled={mv.pending}
          onClick={() => mv.gond(b.fuvarId)}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-card)] font-bold"
        >
          <MessageSquareWarning className="h-5 w-5" />
          Gond van
        </button>
      </div>
    </>
  );
}

function ReszletKepernyo({
  b,
  aktiv,
  maNap,
  mv,
  papirDb,
  onPapir,
  onVissza,
}: {
  b: SoforFuvarBlokk;
  aktiv: SoforMegalloSor | null;
  maNap: string;
  mv: Muveletek;
  papirDb: number;
  onPapir: () => void;
  onVissza: () => void;
}) {
  const fel = b.megallok.find((m) => m.tipus === "felrako");
  return (
    <>
      <Fejlec cim={utvonal(b)} al={[megrendeloCimke(b), napCimke(fel?.nap, maNap)].filter(Boolean).join(" · ")} onVissza={onVissza} />
      {aktiv && (
        <>
          <Gombsor blokk={b} aktiv={aktiv} mv={mv} papirDb={papirDb} onPapir={onPapir} />
          <MegalloKiegeszitok blokk={b} aktiv={aktiv} mv={mv} />
        </>
      )}
      <MegbizasInfo b={b} maNap={maNap} mv={mv} />
    </>
  );
}

// ------------------------------------------------------------- papír, fogyasztás

function PapirKepernyo({
  papirok,
  sor,
  maNap,
  onFoto,
  onMind,
  onVissza,
}: {
  papirok: PapirTetel[];
  sor: Record<string, number>;
  maNap: string;
  onFoto: (p: PapirTetel) => void;
  onMind: () => void;
  onVissza: () => void;
}) {
  const fotozhato = papirok.filter((p) => !sor[p.fuvarId]);
  return (
    <>
      <Fejlec cim="Papír vár" al={papirok.length ? `${papirok.length} fuvar papírja hiányzik` : null} onVissza={onVissza} />
      {papirok.length === 0 ? (
        <p className="rounded-[22px] bg-[var(--sa-card)] px-4 py-5 text-center text-[15px] text-[var(--sa-muted)]">Minden papír megvan.</p>
      ) : (
        <Doboz label="Papírra váró fuvarok">
          {papirok.map((p) => (
            <Sor
              key={p.fuvarId}
              jel={<Camera className="h-5 w-5" />}
              jelSzin={sor[p.fuvarId] ? "blue" : "amber"}
              cim={[p.honnan, p.hova].filter(Boolean).join(" → ") || "Fuvar"}
              al={sor[p.fuvarId] ? `${sor[p.fuvarId]} oldal feltöltésre vár` : [napCimke(p.nap, maNap), papirNeve(p.sajatFuvar)].filter(Boolean).join(" · ")}
              jobb={sor[p.fuvarId] ? <CloudUpload className="h-5 w-5 text-[var(--sa-blue)]" /> : <span className="font-bold text-[var(--sa-blue)]">Fotó</span>}
              onClick={sor[p.fuvarId] ? undefined : () => onFoto(p)}
            />
          ))}
        </Doboz>
      )}
      <p className="px-1 text-sm leading-snug text-[var(--sa-muted)]">
        Bérfuvarnál az aláírt fuvarlevél nélkül nem tudunk számlázni, saját fuvarnál a szállítólevéltől zárul le a fuvar.
      </p>
      {fotozhato.length > 1 && (
        <button type="button" onClick={onMind} className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
          <Camera className="h-[22px] w-[22px]" />
          Mind a {fotozhato.length} sorban
        </button>
      )}
    </>
  );
}

const NAP_ROVID = ["v", "h", "k", "sze", "cs", "p", "szo"];

function FogyasztasKepernyo({ f, onVissza }: { f: SoforFogyasztas | null; onVissza: () => void }) {
  if (!f || !f.merve) {
    return (
      <>
        <Fejlec cim="Átlagfogyasztás" al={f?.rendszam} onVissza={onVissza} />
        <p className="rounded-[22px] bg-[var(--sa-card)] px-4 py-5 text-center text-[15px] text-[var(--sa-muted)]">
          Nincs mérés: a kocsi nyomkövetője nem küld üzemanyag-adatot.
        </p>
      </>
    );
  }
  const k = f.kep;
  const max = Math.max(...k.napok.map((n) => n.l100 ?? 0), 1);
  const min = Math.min(...k.napok.filter((n) => n.l100 != null).map((n) => n.l100!), max);
  const idoszak = (jel: string, cimke: string, e: { l100: number | null; km: number }) => (
    <Sor
      jel={jel}
      jelSzin="blue"
      cim={e.l100 != null ? `${tizedes(e.l100)} l/100 km` : "kevés adat"}
      al={`${e.km.toLocaleString("hu-HU")} km · ${cimke}`}
    />
  );
  return (
    <>
      <Fejlec cim="Átlagfogyasztás" al={`${f.rendszam} · a kocsi mérése`} onVissza={onVissza} />
      <section aria-label="7 napos átlag" className="text-center">
        <div className="text-[64px] font-extrabold leading-none tracking-[-0.04em]">{k.het.l100 != null ? tizedes(k.het.l100) : "—"}</div>
        <div className="text-base font-semibold text-[#4B5563]">l/100 km · utolsó 7 nap</div>
        {k.valtozas != null && k.valtozas !== 0 && (
          <span
            className={`mt-2.5 inline-block rounded-full px-3 py-1.5 text-sm font-extrabold ${k.valtozas < 0 ? "bg-[var(--sa-green-soft)] text-[var(--sa-green)]" : "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]"}`}
          >
            {tizedes(Math.abs(k.valtozas))} literrel {k.valtozas < 0 ? "jobb" : "több"}, mint az előző héten
          </span>
        )}
      </section>
      <section aria-label="Napok" className="flex h-[190px] items-end gap-1.5 rounded-3xl bg-[var(--sa-card)] px-3.5 py-4">
        {k.napok.map((n, i) => {
          const ma = i === k.napok.length - 1;
          const magas = n.l100 != null ? 30 + ((n.l100 - min * 0.9) / (max - min * 0.9 || 1)) * 80 : 6;
          return (
            <div key={n.nap} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`text-xs font-bold ${ma ? "" : "text-[var(--sa-muted)]"}`}>{n.l100 != null ? tizedes(n.l100) : "–"}</span>
              <span
                className={`w-full max-w-[30px] rounded-lg ${n.l100 == null ? "bg-[#EEF0F4]" : ma ? "bg-[var(--sa-blue)]" : "bg-[#C9D6FF]"}`}
                style={{ height: magas }}
              />
              <span className={`text-xs font-bold ${ma ? "" : "text-[var(--sa-muted)]"}`}>{NAP_ROVID[new Date(`${n.nap}T12:00:00Z`).getUTCDay()]}</span>
            </div>
          );
        })}
      </section>
      <Doboz label="Időszakok">
        {idoszak("ma", "ma", k.ma)}
        {idoszak("7", "7 nap", k.het)}
        {idoszak("14", "14 nap", k.ketHet)}
      </Doboz>
      <p className="px-1 text-[13px] leading-snug text-[var(--sa-muted)]">Üresen és rakottan együtt, a kocsi saját mérése szerint.</p>
    </>
  );
}

// ------------------------------------------------------------- a teljes app

type Reteg =
  | { t: "papir" }
  | { t: "foto"; fuvarok: FotoFuvar[]; fajlok: File[] }
  | { t: "reszlet"; fuvarId: string; tartalek: SoforFuvarBlokk }
  | { t: "fogyasztas" };

export function SoforApp({
  employeeId,
  employeeName,
  elolegSav,
  onProfil,
}: {
  employeeId: string;
  employeeName: string;
  /** Az elfogadásra váró előleg sávja (a szülő kontextusából), minden képernyő tetején. */
  elolegSav: ReactNode;
  onProfil: () => void;
}) {
  const maNap = budapestNapISO();
  const holnapNap = kovetkezoMunkanapISO(maNap);
  const holnapCimke = napCimke(holnapNap, maNap) === "holnap" ? "Holnap" : "Hétfő";

  const [nap, setNap] = useState<SoforNap | null>(null);
  const [holnap, setHolnap] = useState<SoforNap | null>(null);
  const [betoltve, setBetoltve] = useState(false);
  const [papirSzerver, setPapirSzerver] = useState<PapirTetel[]>([]);
  const [elore, setElore] = useState<SoforNap[] | null>(null);
  const [kesz, setKesz] = useState<SoforLezartTetel[] | null>(null);
  const [fogyasztas, setFogyasztas] = useState<SoforFogyasztas | null>(null);
  const [sor, setSor] = useState<Record<string, number>>({});
  const [nemKaptam, setNemKaptam] = useState<string[]>(() => (typeof window === "undefined" ? [] : nemKaptamOlvas()));

  const [ful, setFul] = useState<"ma" | "megbizasok">("ma");
  const [mbFul, setMbFul] = useState<"elottem" | "kesz">("elottem");
  const [reteg, setReteg] = useState<Reteg | null>(null);

  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    const [ma, holnapi, papir, s] = await Promise.all([
      getSoforNap(employeeId, maNap),
      getSoforNap(employeeId, holnapNap),
      getSoforPapirVaro(employeeId).catch(() => [] as PapirTetel[]),
      sorAllapot(),
    ]);
    setNap(ma);
    setHolnap(holnapi);
    setPapirSzerver(papir);
    setSor(s);
  }, [employeeId, maNap, holnapNap]);

  const loadElore = useCallback(async () => {
    setElore(await getSoforNapokElore(employeeId, 14));
  }, [employeeId]);

  const loadKesz = useCallback(async () => {
    setKesz(await getSoforKesz(employeeId));
  }, [employeeId]);

  const frissit = useCallback(async () => {
    await Promise.all([
      load(),
      elore ? loadElore() : Promise.resolve(),
      kesz ? loadKesz() : Promise.resolve(),
      getSoforFogyasztas(employeeId).then(setFogyasztas, () => undefined),
    ]);
  }, [load, loadElore, loadKesz, elore, kesz, employeeId]);

  // Első betöltés — minden setState await után (react-hooks/set-state-in-effect).
  useEffect(() => {
    let el = true;
    (async () => {
      try {
        await load();
      } catch {
        if (el) toast.error("Nem sikerült betölteni a fuvarokat.");
      } finally {
        if (el) setBetoltve(true);
      }
      const f = await getSoforFogyasztas(employeeId).catch(() => null);
      if (el) setFogyasztas(f);
      const e = await getSoforNapokElore(employeeId, 14).catch(() => null);
      if (el && e) setElore(e);
    })();
    return () => {
      el = false;
    };
  }, [load, employeeId]);

  // A telefonon várakozó papír-oldalak: induláskor, a hálózat visszatérésekor
  // és percenként újrapróbáljuk (papir-sor.ts).
  const sorUjra = useCallback(async () => {
    const e = await sorFeldolgoz();
    setSor(await sorAllapot());
    if (e.sikeres > 0) {
      toast.success(e.varakozik ? `${e.sikeres} oldal feltöltve, ${e.varakozik} még vár.` : `${e.sikeres} várakozó oldal feltöltve.`);
      await load().catch(() => undefined);
    }
  }, [load]);

  useEffect(() => {
    const online = () => void sorUjra();
    window.addEventListener("online", online);
    const id = window.setInterval(() => {
      if (navigator.onLine) void sorUjra();
    }, 60_000);
    const elso = window.setTimeout(() => void sorUjra(), 1500);
    return () => {
      window.removeEventListener("online", online);
      window.clearInterval(id);
      window.clearTimeout(elso);
    };
  }, [sorUjra]);

  // ---- származtatott adatok

  const blokkok = useMemo(() => nap?.fuvarok ?? [], [nap]);
  const kovetkezo = nap?.kovetkezo ?? null;
  const aktivIndex = kovetkezo ? blokkok.findIndex((b) => b.fuvarId === kovetkezo.fuvarId) : -1;
  const aktivBlokk = aktivIndex >= 0 ? blokkok[aktivIndex] : null;
  const aktiv = aktivBlokk?.megallok.find((m) => m.megalloIndex === kovetkezo?.megalloIndex) ?? null;
  const maiIdk = new Set(blokkok.map((b) => b.fuvarId));
  const holnapElso = (holnap?.fuvarok ?? []).find((b) => !maiIdk.has(b.fuvarId)) ?? null;
  const maiKovetkezo = aktivIndex >= 0 ? blokkok[aktivIndex + 1] ?? null : null;
  const kovetkezoBlokk = maiKovetkezo ?? holnapElso;
  const kovetkezoCimke = maiKovetkezo ? "Utána" : holnapCimke;

  const papirok = useMemo(() => {
    const lista = [...papirSzerver];
    const van = new Set(lista.map((p) => p.fuvarId));
    for (const b of blokkok) if (papirraVar(b) && !van.has(b.fuvarId)) lista.unshift(blokkbolPapir(b));
    return lista.filter((p) => !nemKaptam.includes(p.fuvarId));
  }, [papirSzerver, blokkok, nemKaptam]);

  /** Előttem: a mai, még nyitott megbízások, majd a következő napokéi — fuvaronként egyszer. */
  const elottem = useMemo(() => {
    if (!nap) return null;
    const out: SoforFuvarBlokk[] = [];
    const van = new Set<string>();
    const tesz = (b: SoforFuvarBlokk) => {
      if (van.has(b.fuvarId) || b.megallok.every((m) => m.kesz)) return;
      van.add(b.fuvarId);
      out.push(b);
    };
    blokkok.forEach(tesz);
    (holnap?.fuvarok ?? []).forEach(tesz);
    (elore ?? []).forEach((n) => n.fuvarok.forEach(tesz));
    return out;
  }, [nap, blokkok, holnap, elore]);

  const blokkKeres = (fuvarId: string): SoforFuvarBlokk | null =>
    blokkok.find((b) => b.fuvarId === fuvarId) ??
    holnap?.fuvarok.find((b) => b.fuvarId === fuvarId) ??
    elore?.flatMap((n) => n.fuvarok).find((b) => b.fuvarId === fuvarId) ??
    null;

  // ---- műveletek (ugyanazok a szerver-akciók, mint a régi nézetben)

  const mv: Muveletek = {
    pending,
    erkezes: (m) =>
      startTransition(async () => {
        try {
          await jelolMegerkeztem(m.fuvarId, m.megalloIndex);
          await load();
          toast.success("Érkezés rögzítve.");
        } catch {
          toast.error("Nem sikerült rögzíteni.");
        }
      }),
    kesz: (m) =>
      startTransition(async () => {
        try {
          if (m.varakozasKezdete && !m.varakozasVege) await jelolVarakozast(m.fuvarId, m.megalloIndex, "befejez");
          const { fuvarLezarva } = await markMegalloKesz(m.fuvarId, m.megalloIndex);
          await load();
          toast.success(fuvarLezarva ? "Lerakva. A papírt pihenőkor is lefotózhatod — a Papír vár listán megvan." : "Rögzítve, mehetsz tovább.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni.");
        }
      }),
    hely: async (m) => {
      if (!(await confirm(`A kocsi mostani helyét jegyezzük fel ehhez a címhez?\n\n${m.cim}\n\nCsak akkor koppints Igent, ha a rakodóhelyen állsz.`))) return;
      startTransition(async () => {
        try {
          await rogzitMegalloHelyet(m.fuvarId, m.megalloIndex);
          await load();
          toast.success("Hely rögzítve. Mostantól a rendszer ide várja ezt a címet.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Nem sikerült rögzíteni a helyet.");
        }
      });
    },
    visszavon: async (fuvarId, megalloIndex, leiras) => {
      if (
        !(await confirm(`${leiras}\n\nA megálló újra nyitott lesz, a fuvar visszakerül a napodba.`, {
          title: "Visszavonod a Kész jelölést?",
          confirmLabel: "Visszavonom",
        }))
      )
        return;
      startTransition(async () => {
        try {
          const { fuvarVisszanyitva } = await visszavonMegalloKesz(fuvarId, megalloIndex);
          await load();
          toast.success(fuvarVisszanyitva ? "Visszavonva — a fuvar újra folyamatban." : "Visszavonva.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Nem sikerült visszavonni.");
        }
      });
    },
    gond: (fuvarId) => {
      const szoveg = window.prompt("Mi a gond? Röviden, a diszpécser ezt kapja meg:");
      if (!szoveg?.trim()) return;
      startTransition(async () => {
        try {
          await jelezGondot(fuvarId, szoveg);
          toast.success("Elküldve a diszpécsernek.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Nem sikerült elküldeni.");
        }
      });
    },
  };

  const papirNemKaptam = (fuvarId: string) => {
    const uj = [...nemKaptam.filter((id) => id !== fuvarId), fuvarId];
    setNemKaptam(uj);
    nemKaptamIr(uj);
  };

  // A „Fotó” koppintás AZONNAL a telefon saját kameráját nyitja (2026-10-23):
  // a böngésző csak a koppintáson belül engedi megnyitni, ezért a rejtett
  // kamera-mező itt van, nem a Fotozas-ban; a kész kép(ek)kel nyílik a réteg.
  const kameraMezo = useRef<HTMLInputElement>(null);
  const varoFoto = useRef<PapirTetel[]>([]);
  const fotoNyit = (lista: PapirTetel[]) => {
    if (!lista.length) return;
    varoFoto.current = lista;
    kameraMezo.current?.click();
  };
  const kameraKep = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fajlok.length && varoFoto.current.length) setReteg({ t: "foto", fuvarok: varoFoto.current.map(fotoFuvar), fajlok });
  };
  const papirLista = () => (papirok.length === 1 && !sor[papirok[0].fuvarId] ? fotoNyit(papirok) : setReteg({ t: "papir" }));

  // ---- megjelenítés

  if (!betoltve && !nap) {
    return (
      <div style={SOFOR_THEME} className="mx-auto flex h-dvh max-w-md items-center justify-center bg-[var(--sa-bg)] text-sm text-[var(--sa-muted)]">
        Betöltés…
      </div>
    );
  }
  if (!nap) {
    return (
      <Keret onFrissit={frissit} alul={<AlsoMenu aktiv="ma" onMa={() => setFul("ma")} onMegbizasok={() => setFul("megbizasok")} onProfil={onProfil} />}>
        {elolegSav}
        <p className="rounded-[22px] bg-[var(--sa-card)] px-4 py-5 text-center text-[15px] text-[var(--sa-muted)]">
          Nincs hozzád rendelt jármű. Szólj az irodának.
        </p>
      </Keret>
    );
  }

  if (reteg?.t === "foto") {
    return (
      <div style={SOFOR_THEME}>
        <Fotozas
          fuvarok={reteg.fuvarok}
          elsoFajlok={reteg.fajlok}
          onBezar={() => setReteg(null)}
          onNemKaptam={papirNemKaptam}
          onBekuldve={(fuvarId, e) => {
            if (e.varakozik === 0 && e.hibas === 0) setPapirSzerver((t) => t.filter((p) => p.fuvarId !== fuvarId));
            void sorAllapot().then(setSor);
            void load().catch(() => undefined);
            if (kesz) void loadKesz().catch(() => undefined);
          }}
        />
      </div>
    );
  }

  const vissza = () => setReteg(null);
  const menu = (
    <AlsoMenu
      aktiv={ful}
      onMa={() => {
        setReteg(null);
        setFul("ma");
      }}
      onMegbizasok={() => {
        setReteg(null);
        setFul("megbizasok");
      }}
      onProfil={onProfil}
    />
  );

  let tartalom: ReactNode;
  if (reteg?.t === "papir") {
    tartalom = (
      <PapirKepernyo
        papirok={papirok}
        sor={sor}
        maNap={maNap}
        onFoto={(p) => fotoNyit([p])}
        onMind={() => fotoNyit(papirok.filter((p) => !sor[p.fuvarId]))}
        onVissza={vissza}
      />
    );
  } else if (reteg?.t === "reszlet") {
    const b = blokkKeres(reteg.fuvarId) ?? reteg.tartalek;
    tartalom = (
      <ReszletKepernyo
        b={b}
        aktiv={aktivBlokk?.fuvarId === b.fuvarId ? aktiv : null}
        maNap={maNap}
        mv={mv}
        papirDb={papirok.length}
        onPapir={papirLista}
        onVissza={vissza}
      />
    );
  } else if (reteg?.t === "fogyasztas") {
    tartalom = <FogyasztasKepernyo f={fogyasztas} onVissza={vissza} />;
  } else if (ful === "megbizasok") {
    tartalom = (
      <MegbizasokKepernyo
        elottem={elore ? elottem : null}
        aktivId={aktivBlokk?.fuvarId ?? null}
        kesz={kesz}
        ful={mbFul}
        maNap={maNap}
        onFul={(f) => {
          setMbFul(f);
          if (f === "kesz" && !kesz) void loadKesz().catch(() => toast.error("Nem sikerült betölteni."));
        }}
        onReszlet={(b) => setReteg({ t: "reszlet", fuvarId: b.fuvarId, tartalek: b })}
        onFoto={(p) => fotoNyit([p])}
      />
    );
  } else {
    tartalom = (
      <MaKepernyo
        nev={employeeName}
        nap={nap}
        maNap={maNap}
        aktivBlokk={aktivBlokk}
        aktiv={aktiv}
        kovetkezoBlokk={kovetkezoBlokk}
        kovetkezoCimke={kovetkezoCimke}
        papirok={papirok}
        elottemDb={elore ? elottem?.length ?? 0 : null}
        sorDb={Object.values(sor).reduce((a, b) => a + b, 0)}
        fogyasztas={fogyasztas}
        mv={mv}
        elolegSav={elolegSav}
        onReszlet={(b) => setReteg({ t: "reszlet", fuvarId: b.fuvarId, tartalek: b })}
        onPapir={papirLista}
        onMegbizasok={() => {
          setMbFul("elottem");
          setFul("megbizasok");
        }}
        onKesz={() => {
          setMbFul("kesz");
          setFul("megbizasok");
          if (!kesz) void loadKesz().catch(() => toast.error("Nem sikerült betölteni."));
        }}
        onFogyasztas={() => setReteg({ t: "fogyasztas" })}
        onSorUjra={() => void sorUjra()}
      />
    );
  }

  return (
    <Keret onVissza={reteg ? vissza : undefined} onFrissit={frissit} alul={reteg ? null : menu}>
      {ful === "megbizasok" && !reteg ? elolegSav : null}
      {tartalom}
      <input ref={kameraMezo} type="file" accept="image/*" capture="environment" className="hidden" onChange={kameraKep} />
      {confirmDialog}
      {pending && <span className="sr-only" role="status">Mentés…</span>}
    </Keret>
  );
}
