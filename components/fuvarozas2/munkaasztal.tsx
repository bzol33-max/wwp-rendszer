import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { varosNev } from "@/lib/fuvarozas/varos";
import { formatFt, formatIdo, formatNap } from "@/components/fuvarozas2/kozos";
import { SZAKASZOK, utSzakaszai, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { kovetkezoTeendo } from "@/lib/fuvarozas2/megbizas-szuro";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";

// A Megbízások oldal (2026-09-30, Budaházi Zoltán: 1-es terv): két oszlop,
// balra a bérfuvarok, jobbra a saját fuvarok, mindkettő szakaszonként. A
// saját oszlop tetején lenyíló „+ Új saját fuvar”; egy sorra kattintva a
// részlet jobbról becsúszó lapon nyílik (reszlet-lap.tsx).

export type MunkaasztalSzuro = { q?: string; reszlet?: string; uj?: boolean };

export function munkaasztalLink(alap: MunkaasztalSzuro, valtozas: Partial<MunkaasztalSzuro>): string {
  const p = new URLSearchParams();
  const e = { ...alap, ...valtozas };
  if (e.q) p.set("q", e.q);
  if (e.reszlet) p.set("reszlet", e.reszlet);
  if (e.uj) p.set("uj", "1");
  const q = p.toString();
  return `/fuvarozas2/megbizasok${q ? `?${q}` : ""}`;
}

const SZAKASZ_SZIN: Record<Szakasz, string> = {
  beerkezett: "text-[var(--f2-amb)]",
  elokeszites: "text-muted-foreground",
  folyamatban: "text-[var(--f2-blue)]",
  szamlazasra: "text-[var(--f2-mint)]",
  postara: "text-[var(--f2-mint)]",
  archiv: "text-muted-foreground",
};

/** Rövid útvonal: az első felrakó és az utolsó lerakó városa. */
function varos(cim: string | null): string {
  if (!cim) return "—";
  const elso = cim.split(/;|\s\+\s/)[0].trim();
  const v = varosNev(elso).trim();
  if (v && v.length <= 32) return v;
  return elso.length > 32 ? `${elso.slice(0, 31)}…` : elso;
}
function utolsoVaros(cim: string | null): string {
  if (!cim) return "—";
  const reszek = cim.split(/;|\s\+\s/);
  return varos(reszek[reszek.length - 1]);
}
function megalloDb(cim: string | null): number {
  return cim ? cim.split(/;|\s\+\s/).filter((x) => x.trim()).length : 0;
}

function Csik({ s }: { s: MunkaasztalSor }) {
  const ut = utSzakaszai(s.jelleg, s.szakasz);
  const hol = ut.indexOf(s.szakasz);
  return (
    <span className="mt-1 flex gap-0.5" aria-hidden>
      {ut.map((sz, i) => (
        <i
          key={sz}
          className={cn(
            "h-1.5 w-5 rounded-full",
            i < hol || s.szakasz === "archiv" ? "bg-[var(--f2-mint)]" : i === hol ? "bg-[var(--f2-blue)]" : "bg-foreground/10"
          )}
        />
      ))}
    </span>
  );
}

function Sor({ s, ma, szuro }: { s: MunkaasztalSor; ma: string; szuro: MunkaasztalSzuro }) {
  const t = s.elokeszites
    ? (() => {
        const h = [!s.elokeszites_jarmu && "kocsi", !s.felrako?.trim() && "honnan", !s.lerako?.trim() && "hová"].filter(Boolean);
        return h.length ? { szoveg: `előkészítés · hiányzik: ${h.join(", ")}`, surgos: true } : { szoveg: "kocsira adható", surgos: false };
      })()
    : kovetkezoTeendo(s, ma);
  const kijelolt = szuro.reszlet === s.id;
  const db = megalloDb(s.felrako) + megalloDb(s.lerako);
  return (
    <li>
      <Link
        href={munkaasztalLink(szuro, { reszlet: s.id, uj: false })}
        scroll={false}
        className={cn(
          "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto] items-start gap-3 border-b border-foreground/5 px-3 py-2.5 text-sm hover:bg-muted/50",
          kijelolt && "bg-[var(--f2-blue-l)]"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{s.kitol ? `${s.kitol} → ${s.partner_nev ?? "?"}` : s.partner_nev ?? (s.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)")}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{s.hivatkozas ?? (s.jelleg === "sajat" ? "saját" : "—")}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{varos(s.felrako)} → {utolsoVaros(s.lerako)}</span>
          <span className={cn("block truncate text-xs", t.surgos ? "font-semibold text-[var(--f2-red)]" : "text-muted-foreground")}>
            {[
              s.jarmu_kod ?? (s.elokeszites ? s.elokeszites_jarmu ?? "—" : "kocsi nélkül"),
              db > 2 ? `${db} megálló` : null,
              s.szamla_szam && s.szakasz !== "szamlazasra" ? s.szamla_szam : null,
              s.kieg_szamla_szamok?.length ? `+ kieg. ${s.kieg_szamla_szamok.join(", ")}` : null,
              s.szallitolevel ? `szállító ${s.szallitolevel}` : null,
              s.szakasz === "archiv" && s.postazva_at ? `feladva ${formatIdo(s.postazva_at).slice(0, 6)}` : null,
              s.szakasz !== "archiv" ? t.szoveg : null,
            ].filter(Boolean).join(" · ")}
          </span>
          <Csik s={s} />
        </span>
        <span className="text-right">
          <span className="block font-mono text-xs tabular-nums text-muted-foreground">{formatNap(s.felrakas_nap)}{s.lerakas_nap && s.lerakas_nap !== s.felrakas_nap ? `→${formatNap(s.lerakas_nap)}` : ""}</span>
          <span className="block font-mono text-xs tabular-nums">{s.jelleg === "ber" ? formatFt(s.fuvardij, s.fuvardij_penznem) : ""}</span>
        </span>
      </Link>
    </li>
  );
}

/** Egy oszlop (Bérfuvarok / Saját fuvarok): a sorok szakaszonként, fejléccel és darabszámmal. */
export function OszlopLista({ cim, sorok, ma, szuro, felso, ures }: {
  cim: string;
  sorok: MunkaasztalSor[];
  ma: string;
  szuro: MunkaasztalSzuro;
  /** Az oszlop tetején (a saját oszlopban a lenyíló „+ Új saját fuvar”). */
  felso?: ReactNode;
  ures: string;
}) {
  const csoportok = SZAKASZOK.map((sz) => ({ sz, sorok: sorok.filter((s) => s.szakasz === sz.kulcs) })).filter((c) => c.sorok.length > 0);
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-foreground/10 bg-card" aria-label={cim}>
      <div className="flex items-baseline justify-between gap-2 border-b border-foreground/5 px-4 py-3">
        <h2 className="text-base font-semibold">{cim}</h2>
        <span className="text-xs text-muted-foreground">{sorok.length === 300 ? "az első 300" : szuro.q ? `${sorok.length} találat` : `${sorok.length} nyitott`}</span>
      </div>
      {felso ? <div className="p-3 pb-1">{felso}</div> : null}
      {csoportok.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{ures}</p> : null}
      {csoportok.map(({ sz, sorok: cs }) => (
        <div key={sz.kulcs}>
          <h3 className={cn("px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide", SZAKASZ_SZIN[sz.kulcs])}>
            {sz.cimke} <span className="font-mono opacity-75">{cs.length}</span>
          </h3>
          <ul className="flex flex-col">
            {cs.map((s) => <Sor key={s.id} s={s} ma={ma} szuro={szuro} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}
