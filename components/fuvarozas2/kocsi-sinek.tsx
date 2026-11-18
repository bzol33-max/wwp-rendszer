import Link from "next/link";
import { formatFt } from "@/components/fuvarozas2/kozos";
import { megbizasCim, utolsoVaros, varos } from "@/lib/megbizasok/megjelenites";
import { munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import { JovahagyasGomb } from "@/components/fuvarozas2/ma-het-gombok";
import { HaviSzerkeszto, HuzhatoJegy, SinCel } from "@/components/fuvarozas2/kocsi-sinek-gombok";
import { PECSET_NEVEK, eFt, type Pecset } from "@/lib/fuvarozas2/kocsi-sinek-alap";
import type { Jegy, KocsiSinekAdat, Sin } from "@/lib/fuvarozas2/kocsi-sinek";
import { cn } from "@/lib/utils";

// Megbízások asztali nézete: „Kocsi-sínek” (2026-11-18, Budaházi Zoltán, Q5b-F
// terv — claude/megbizasok-kocsi-sinek-terv.md). Fent a hónap 5 száma, alatta
// kereső, az Elvinni-tálca, majd kocsinként egy sín pecsétes jegyekkel.
// 4 pecsét: beérkezés · felvétel · lerakás · számla (saját fuvarnál 3).

const SZIN: Record<Jegy["szin"], string> = {
  piros: "var(--f2-red)", sarga: "var(--f2-amb)", beerkezes: "#8e8e93", felvetel: "var(--f2-blue)",
  lerakas: "var(--f2-blue)", szamla: "#6a3bc4", kesz: "var(--f2-mint)",
};

function PecsetSor({ pecsetek }: { pecsetek: Pecset[] }) {
  return (
    <span className="flex gap-1">
      {pecsetek.map((p, i) => {
        const cim = `${PECSET_NEVEK[i]}${p.nap ? ` · ${p.nap}` : p.keso !== "nem" ? " · késik" : ""}`;
        const alap = "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums";
        if (p.nap) return <span key={p.kulcs} title={cim} className={cn(alap, "-rotate-6 bg-[var(--f2-mint)] text-white")}>{p.nap.slice(5).replace("-", ".")}</span>;
        if (p.keso === "piros") return <span key={p.kulcs} title={cim} className={cn(alap, "text-[var(--f2-red)] ring-2 ring-inset ring-[var(--f2-red)]")}>!</span>;
        if (p.keso === "sarga") return <span key={p.kulcs} title={cim} className={cn(alap, "text-[var(--f2-amb)] ring-2 ring-inset ring-[var(--f2-amb)]")}>…</span>;
        return <span key={p.kulcs} title={cim} className={cn(alap, "text-muted-foreground/40 ring-1 ring-inset ring-foreground/15")}>—</span>;
      })}
    </span>
  );
}

function Dij({ j }: { j: Jegy }) {
  const s = j.sor;
  if (s.jelleg === "sajat") return <span className="rounded-full bg-[#1d7a2a] px-2 py-0.5 text-[10px] font-semibold text-white">saját</span>;
  if (s.fuvardij == null) return <span className="text-xs text-muted-foreground">nincs díj</span>;
  const eur = (s.fuvardij_penznem || "").toUpperCase() === "EUR";
  return (
    <span className="block text-right">
      <b className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatFt(Number(s.fuvardij), s.fuvardij_penznem || "Ft")}</b>
      {eur ? (
        <span className="block whitespace-nowrap text-[11px] text-muted-foreground" title={j.arfolyamElozetes ? "Előzetes: a mai MNB-árfolyamon; a számla napján érvényes árfolyamra vált." : `MNB ${j.arfolyamNap}`}>
          {j.dijFt != null ? `≈ ${formatFt(Math.round(j.dijFt))}` : "árfolyam nincs"}{j.arfolyam ? ` · ${j.arfolyam.toFixed(1).replace(".", ",")}` : ""}{j.arfolyamElozetes ? " · előzetes" : ""}
        </span>
      ) : null}
    </span>
  );
}

function JegyKartya({ j, szuro, huzhatoNap, szerkesztheto }: { j: Jegy; szuro: MunkaasztalSzuro; /** Tálcán: húzható, ezzel a nappal kerül kocsira. */ huzhatoNap?: string; szerkesztheto: boolean }) {
  const s = j.sor;
  const href = munkaasztalLink(szuro, { reszlet: s.id, elvinni: undefined, uj: false, ujBer: false, szerk: false });
  const sajat = s.jelleg === "sajat";
  const belso = (
    <>
      <Link href={href} scroll={false} className={cn("lift block rounded-xl p-2.5 text-sm", sajat ? "bg-[#e3f6e4] ring-1 ring-[#1d7a2a]/25" : "bg-card")} style={{ borderTop: `3px solid ${sajat && j.szin !== "piros" && j.szin !== "sarga" ? "#1d7a2a" : SZIN[j.szin]}`, boxShadow: "var(--shadow-card)" }}>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-semibold">{megbizasCim(s)}</strong>
            <span className="block truncate text-xs text-muted-foreground">#{s.id} · {varos(s.felrako)} → {utolsoVaros(s.lerako)}</span>
          </span>
          <Dij j={j} />
        </span>
        <span className="mt-2 flex items-center gap-2">
          <PecsetSor pecsetek={j.pecsetek} />
          <span className={cn("text-xs tabular-nums", j.szin === "piros" ? "font-semibold text-[var(--f2-red)]" : "text-muted-foreground")}>{j.lepesbenNap} nap</span>
        </span>
      </Link>
      {szerkesztheto && s.jelleg === "ber" && s.allapot === "ellenorzesre_var" ? <div className="mt-1 flex justify-end"><JovahagyasGomb megbizasId={s.id} /></div> : null}
    </>
  );
  return szerkesztheto && huzhatoNap
    ? <HuzhatoJegy id={s.id} jelleg={s.jelleg} nap={huzhatoNap}>{belso}</HuzhatoJegy>
    : <li className="w-56 shrink-0">{belso}</li>;
}

function Csempe({ cim, ertek, alatta, szin }: { cim: string; ertek: string; alatta: string; szin: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-card)]" style={{ borderTop: `3px solid ${szin}` }}>
      <div className="text-xs text-muted-foreground">{cim}</div>
      <div className="truncate text-xl font-semibold tabular-nums">{ertek}</div>
      <div className="text-xs leading-tight text-muted-foreground">{alatta}</div>
    </div>
  );
}

const HONAP = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];

function HaviSav({ adat, szerkesztheto }: { adat: KocsiSinekAdat; szerkesztheto: boolean }) {
  const h = adat.havi;
  const ber = h.berFt + h.berEurFt;
  const napSzazalek = Math.round((h.napMa / h.napokSzama) * 100);
  const elo = h.elozoSzazalek == null ? "nincs előző havi adat" : `előző hó ${h.napMa}-ig: ${h.elozoSzazalek >= 0 ? "+" : ""}${h.elozoSzazalek}%`;
  return (
    <>
      <div className="flex gap-3">
        <Csempe cim="Bevétel · bér" ertek={eFt(ber)} szin="var(--f2-mint)"
          alatta={`${h.berDb} fuvar${h.berEur ? ` · ebből ${Math.round(h.berEur).toLocaleString("hu-HU")} EUR${h.berElozetesEur ? " (részben előzetes árf.)" : ""}` : ""} · számlázatlan ${eFt(h.szamlazatlanFt)}`} />
        <Csempe cim="Saját fuvar · belső díj" ertek={eFt(h.sajatBelsoFt)} szin="#1d7a2a"
          alatta={`${h.sajatDb} fuvar · ${Math.round(h.sajatKm).toLocaleString("hu-HU")} rakott km${h.atlagFtKm ? ` × ${Math.round(h.atlagFtKm)} Ft` : ""}`} />
        <Csempe cim="Kiadás · havi (kézi)" ertek={eFt(h.kiadasFt)} szin="var(--f2-red)" alatta={h.kiadasFt == null ? "még nincs beírva — ✎ lent" : "egy összeg, te írod be · részletezés később"} />
        <Csempe cim="Eredmény" ertek={h.eredmenyFt == null ? "—" : `${h.eredmenyFt >= 0 ? "+" : ""}${eFt(h.eredmenyFt)}`} szin="var(--f2-dark)" alatta={h.eredmenyFt == null ? "kiadás nélkül nem számolható" : `${HONAP[h.ho - 1]} ${h.napMa}-ig · bér + belső díj − kiadás`} />
        <Csempe cim="Hol tartunk" ertek={`${h.celSzazalek == null ? "—" : `${h.celSzazalek}%`}${h.elozoSzazalek == null ? "" : ` · ${h.elozoSzazalek >= 0 ? "+" : ""}${h.elozoSzazalek}%`}`} szin="var(--f2-blue)"
          alatta={`${h.celFt ? `cél ${eFt(h.celFt)}` : "nincs havi cél"} · ${elo}`} />
      </div>
      <div className="flex items-center gap-4 rounded-xl bg-card px-4 py-2 shadow-[var(--shadow-card)]">
        <b className="text-sm font-semibold capitalize">{HONAP[h.ho - 1]}</b>
        <div className="relative h-2 flex-1 rounded-full bg-muted" title={`A hónap ${napSzazalek}%-a telt el${h.celSzazalek != null ? `, a bevétel a cél ${h.celSzazalek}%-a` : ""}`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--f2-blue)]" style={{ width: `${napSzazalek}%` }} />
          {h.celSzazalek != null ? <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${Math.min(100, h.celSzazalek)}%` }} /> : null}
        </div>
        <span className="text-xs text-muted-foreground">{h.napMa} / {h.napokSzama} nap{h.celSzazalek != null ? ` · bevétel a cél ${h.celSzazalek}%-ánál` : ""}</span>
        {szerkesztheto ? <HaviSzerkeszto ev={h.ev} ho={h.ho} kiadasFt={adat.beallitas.kiadasFt} celFt={adat.beallitas.celFt} /> : null}
      </div>
    </>
  );
}

function SinSor({ sin, szuro, szerkesztheto }: { sin: Sin; szuro: MunkaasztalSzuro; szerkesztheto: boolean }) {
  const h = sin.havi;
  return (
    <SinCel kod={sin.kod} engedett={szerkesztheto}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{sin.cimke} <span className="font-normal text-muted-foreground">· {sin.sofor} · {sin.jegyek.length} nyitott</span></h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {h ? (<>
            <span>bevétel <b className="font-semibold text-[var(--f2-mint)]">{eFt(h.berFt)}</b></span>
            <span>bér {h.berDb} · saját {h.sajatDb}</span>
            <span>km <b className="font-semibold text-foreground">{Math.round(h.km).toLocaleString("hu-HU")}</b></span>
            <span>Ft/km <b className="font-semibold text-foreground">{h.ftKm ? Math.round(h.ftKm).toLocaleString("hu-HU") : "—"}</b></span>
          </>) : <span>e hónapban még nincs fuvar</span>}
        </div>
      </div>
      <ul className="flex gap-2.5 overflow-x-auto pb-1">
        {sin.jegyek.map((j) => <JegyKartya key={j.sor.id} j={j} szuro={szuro} szerkesztheto={szerkesztheto} />)}
        {szerkesztheto ? (
          <li className="w-36 shrink-0">
            <Link href={`${munkaasztalLink(szuro, { uj: true, reszlet: undefined })}&kocsi=${encodeURIComponent(sin.kod)}`} scroll={false}
              className="flex h-full min-h-20 items-center justify-center rounded-xl border-2 border-dashed border-[#1d7a2a]/40 text-xs font-semibold text-[#1d7a2a] hover:bg-[#e3f6e4]">
              + saját fuvar
            </Link>
          </li>
        ) : null}
      </ul>
    </SinCel>
  );
}

export function KocsiSinek({ adat, szuro, szerkesztheto, kereso, fejlecJobb }: {
  adat: KocsiSinekAdat;
  szuro: MunkaasztalSzuro;
  szerkesztheto: boolean;
  kereso: React.ReactNode;
  /** Frissítés / + Új bérfuvar gombok (szerver oldalon összerakva). */
  fejlecJobb?: React.ReactNode;
}) {
  const talca = [...adat.talca, ...adat.kocsiNelkul];
  return (
    <div className="flex flex-col gap-3">
      <HaviSav adat={adat} szerkesztheto={szerkesztheto} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{kereso}</div>
        {fejlecJobb}
      </div>
      <section className="rounded-2xl bg-[var(--f2-amb-l)]/60 p-3 ring-1 ring-[var(--f2-amb)]/15" aria-label="Elvinni való">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Elvinni való · kocsira vár <span className="font-normal text-muted-foreground">· {talca.length}</span></h3>
          <span className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">fogd meg a jegyet, és húzd a kocsi sínjére</span>
            {szerkesztheto ? <Link href={munkaasztalLink(szuro, { uj: true, reszlet: undefined })} scroll={false} className="rounded-lg bg-[#1d7a2a] px-3 py-1.5 text-sm font-bold text-white hover:opacity-90">+ Saját fuvar</Link> : null}
          </span>
        </div>
        {talca.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">Nincs kocsira váró fuvar.</p> : (
          <ul className="flex gap-2.5 overflow-x-auto pb-1">
            {talca.map((j) => <JegyKartya key={j.sor.id} j={j} szuro={szuro} huzhatoNap={j.sor.felrakas_nap ?? j.sor.legkorabban ?? adat.ma} szerkesztheto={szerkesztheto} />)}
          </ul>
        )}
      </section>
      {adat.sinek.map((s) => <SinSor key={s.kod} sin={s} szuro={szuro} szerkesztheto={szerkesztheto} />)}
      <p className="text-xs text-muted-foreground">
        Pecsétek: {PECSET_NEVEK.join(" · ")} (saját fuvarnál az első három). A jegy a számla pecsétje után lekerül a sínről.{" "}
        <Link href="/fuvarozas2/megbizasok?nezet=regi" className="text-primary hover:underline">Régi táblás nézet →</Link>
      </p>
    </div>
  );
}
