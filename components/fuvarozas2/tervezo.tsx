import Link from "next/link";
import { cn } from "@/lib/utils";
import { varosNev } from "@/lib/fuvarozas/varos";
import { formatFt, formatIdo } from "@/components/fuvarozas2/kozos";
import type { BejovoSor, KocsiHet, Tervezo } from "@/lib/fuvarozas2/tervezo";

// A Tervezés három oszlopa (2026-09-30, az 1-es terv): bejövő · döntés · hét.

const MINOSITES: Record<string, { nev: string; szin: string }> = {
  veszteseges: { nev: "veszteséges", szin: "bg-[var(--f2-red-l)] text-[var(--f2-red)]" },
  hatareset: { nev: "határeset", szin: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" },
  ajanlott: { nev: "ajánlott", szin: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" },
};
const szam = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n));
const elojel = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${szam(Math.abs(n))}`;
const NAP = ["V", "H", "K", "Sz", "Cs", "P", "Szo"];
const napBetu = (iso: string) => NAP[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const hoNap = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}.`;

export const tervezoLink = (p: { m?: string; kocsi?: string }) => {
  const q = new URLSearchParams();
  if (p.m) q.set("m", p.m);
  if (p.kocsi) q.set("kocsi", p.kocsi);
  const s = q.toString();
  return `/fuvarozas2/tervezes${s ? `?${s}` : ""}`;
};

function Chip({ children, szin }: { children: React.ReactNode; szin?: string }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", szin ?? "bg-muted text-muted-foreground")}>{children}</span>;
}

function Sor({ cim, ertek, al, kiemelt }: { cim: string; ertek: string; al?: string; kiemelt?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-foreground/5 py-1.5 text-sm", kiemelt && "border-0 pt-2 text-base font-bold")}>
      <span className={kiemelt ? "" : "text-muted-foreground"}>{cim}{al ? <span className="block text-[11px] font-normal text-muted-foreground">{al}</span> : null}</span>
      <span className="shrink-0 font-mono tabular-nums">{ertek}</span>
    </div>
  );
}

export function BejovoLista({ sorok, valasztott }: { sorok: BejovoSor[]; valasztott: string | null }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-foreground/10 bg-card" aria-label="Bejövő megbízások">
      <div className="flex items-baseline justify-between border-b border-foreground/5 px-4 py-3">
        <h2 className="text-base font-semibold">Bejövő</h2>
        <span className="text-xs text-muted-foreground">{sorok.length} megbízás</span>
      </div>
      {sorok.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nincs döntésre váró megbízás.</p> : null}
      <ul>
        {sorok.map((s) => {
          const m = s.magaban?.minosites ? MINOSITES[s.magaban.minosites] : null;
          return (
            <li key={s.id}>
              <Link href={tervezoLink({ m: s.id })} scroll={false}
                className={cn("block border-b border-foreground/5 px-4 py-2.5 hover:bg-muted/50", valasztott === s.id && "bg-[var(--f2-blue-l)]")}>
                <div className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-sm">{s.partner ?? "(nincs megbízó)"}</b>
                  <span className="shrink-0 font-mono text-xs tabular-nums">{s.fuvardij ? formatFt(s.fuvardij, s.penznem) : "nincs díj"}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {varosNev(s.felrako ?? "") || "?"} → {varosNev(s.lerako ?? "") || "?"} · {napBetu(s.felrakasNap)} {hoNap(s.felrakasNap)}
                  {s.allapot === "tervezett" ? " · kocsi nélkül" : ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m ? <Chip szin={m.szin}>magában {m.nev}</Chip> : s.magaban ? <Chip>önköltség {szam(s.magaban.onkoltsegFt / 1000)}e</Chip> : <Chip>számolás…</Chip>}
                  {s.legjobb ? <Chip szin={s.legjobb.hatas >= 0 ? MINOSITES.ajanlott.szin : MINOSITES.veszteseges.szin}>hét {elojel(s.legjobb.hatas)} · {s.legjobb.sofor}</Chip> : <Chip>minden kocsinál ütközik</Chip>}
                  {s.elozmeny?.eltere != null ? <Chip szin={s.elozmeny.eltere <= -10 ? MINOSITES.veszteseges.szin : undefined}>előzmény {s.elozmeny.eltere > 0 ? "+" : ""}{s.elozmeny.eltere}%</Chip> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DontesOszlop({ k, param }: { k: NonNullable<Tervezo["kivalasztott"]>; param: Tervezo["becslesParam"] }) {
  const e = k.kalk?.eredmeny;
  const o = e?.onkoltseg;
  const kalkUrl = `/fuvarozas2/kalkulator?honnan=${encodeURIComponent(k.sor.felrako ?? "")}&hova=${encodeURIComponent(k.sor.lerako ?? "")}`;
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4" aria-label="Döntés">
      <div>
        <h2 className="text-base font-bold">{k.sor.partner ?? "(nincs megbízó)"}{k.sor.hivatkozas ? <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{k.sor.hivatkozas}</span> : null}</h2>
        <p className="text-sm text-muted-foreground">{k.sor.felrako ?? "?"} → {k.sor.lerako ?? "?"}</p>
      </div>
      {e && o ? (
        <div>
          <Sor cim="Rakott táv" ertek={`${szam(e.rakottKm)} km`} al={`menetidő ${Math.floor(e.menetidoPerc / 60)} ó ${e.menetidoPerc % 60} p · útdíj ${formatFt(e.rakottUtdijFt)}`} />
          <Sor cim="Üres táv" ertek={`${szam(e.uresKm)} km`} al={e.uresReszletek} />
          <Sor cim="Üzemanyag" ertek={formatFt(o.uzemanyagFt)} al={`${szam(e.literek)} l · ${e.fogyasztasL100} l/100 · ${e.gazolaj.ar} Ft/l`} />
          <Sor cim="Útdíj (rakott + üres)" ertek={formatFt(o.utdijFt)} />
          <Sor cim="Napi költség" ertek={formatFt(o.napiFt)} al={`${e.napok} nap`} />
          <Sor cim="Önköltség magában" ertek={formatFt(o.osszesenFt)} al={o.ftPerRakottKm != null ? `${szam(o.ftPerRakottKm)} Ft / rakott km — telephelyről, hazaúttal` : undefined} kiemelt />
          {e.megbizoiAjanlat ? (
            <div className={cn("mt-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm", MINOSITES[e.megbizoiAjanlat.minosites].szin)}>
              <span>A megbízó ajánlata: <b className="font-mono">{formatFt(e.megbizoiAjanlat.dijFt)}</b></span>
              <b>{elojel(e.megbizoiAjanlat.eredmenyFt)} Ft · {MINOSITES[e.megbizoiAjanlat.minosites].nev}</b>
            </div>
          ) : <p className="text-xs text-muted-foreground">Nincs Ft-os díj a megbízáson — a minősítéshez díj kell.</p>}
          {k.celarFt ? <p className="mt-1 text-xs text-muted-foreground">8% árréshez legalább <b className="font-mono text-foreground">{formatFt(k.celarFt)}</b> kellene (magában számolva).</p> : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Számolva: {formatIdo(k.kalk!.szamolvaAt)}{k.kalk!.elavult ? " · frissítés alatt (a megbízás vagy a hónap változott)" : ""} · <Link href={kalkUrl} className="underline">megnyitás a Kalkulátorban</Link>
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
          {k.kalk?.hiba ? `A kalkuláció nem készült el: ${k.kalk.hiba}` : "A kalkuláció készül a háttérben — frissítsd az oldalt egy perc múlva."}
        </p>
      )}

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ár-előzmény (saját archívum)</h3>
        {k.figyelmeztetes ? <p className="mt-1 rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm font-semibold text-[var(--f2-amb)]">⚠ {k.figyelmeztetes}</p> : null}
        {k.elozmenyek.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Ezen az úton és ennél a partnernél nincs korábbi fuvar az elmúlt évben.</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <thead><tr className="text-left text-[11px] text-muted-foreground"><th className="py-1 font-medium">Nap</th><th className="font-medium">Partner</th><th className="font-medium">Út</th><th className="text-right font-medium">Díj</th><th className="text-right font-medium">Ft/km</th></tr></thead>
            <tbody>
              {k.elozmenyek.map((x) => (
                <tr key={x.id} className="border-t border-foreground/5">
                  <td className="py-1 font-mono text-xs">{hoNap(x.nap)}</td>
                  <td className="truncate">{x.partner ?? "—"}</td>
                  <td className="truncate text-xs">{x.ut}{x.egyezes === "partner" ? <span className="text-muted-foreground"> (más út)</span> : null}</td>
                  <td className="text-right font-mono text-xs">{szam(x.dij)}</td>
                  <td className="text-right font-mono text-xs">{x.ftKm ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">Ft/km csak ott, ahol a rakott km ki van számolva (kb. az utolsó két hónap).</p>
      </div>
      <p className="text-[11px] text-muted-foreground">A heti becslés: {param.fogyasztasL100} l/100 · {param.gazolajFt} Ft/l · útdíj ~{param.utdijPerKm} Ft/km · üres utak légvonalból ×1,3.</p>
    </section>
  );
}

export function HetOszlop({ k }: { k: NonNullable<Tervezo["kivalasztott"]> }) {
  const v = k.valasztott;
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4" aria-label="A kocsi hete">
      <div className="flex flex-wrap gap-1.5">
        {k.kocsik.map((j: KocsiHet) => (
          <Link key={j.kod} href={tervezoLink({ m: k.sor.id, kocsi: j.kod })} scroll={false}
            className={cn("flex-1 rounded-xl border px-2.5 py-1.5 text-center text-sm", v?.kod === j.kod ? "border-[var(--f2-blue)] bg-[var(--f2-blue-l)]" : "border-foreground/10 hover:bg-muted")}>
            <b>{j.sofor}</b>
            <span className={cn("block font-mono text-[11px]", j.utkozik ? "text-[var(--f2-amb)]" : j.hatas >= 0 ? "text-[var(--f2-mint)]" : "text-[var(--f2-red)]")}>
              {j.utkozik ? "ütközik" : `hét ${elojel(j.hatas)}`}
            </span>
          </Link>
        ))}
      </div>
      {v ? (
        <>
          <h2 className="text-base font-semibold">{v.sofor} · {v.kod} · a hét {hoNap(k.hetKezdet)}-tól</h2>
          <ol className="flex flex-col gap-1.5">
            {v.napok.map((n) => (
              <li key={n.nap} className="grid grid-cols-[28px_1fr] items-start gap-2">
                <span className="pt-1.5 text-xs font-bold text-muted-foreground">{napBetu(n.nap)}</span>
                <div className="flex flex-col gap-1">
                  {n.fuvarok.length === 0 ? <span className="rounded-lg border border-dashed border-foreground/15 px-2.5 py-1.5 text-xs text-muted-foreground">szabad</span> : null}
                  {n.fuvarok.map((f) => (
                    <span key={f.id} className={cn("flex items-baseline justify-between gap-2 rounded-lg border border-l-4 px-2.5 py-1.5 text-xs",
                      f.uj ? "border-dashed border-[#f97316] bg-[#fff7ed]" : f.sajat ? "border-foreground/10 border-l-[var(--f2-mint)]" : "border-foreground/10 border-l-[var(--f2-blue)]")}>
                      <span className="min-w-0 truncate"><b>{f.ut}</b> <span className="text-muted-foreground">· {f.cim}{f.uj ? " · ÚJ" : ""}</span></span>
                      <span className="shrink-0 font-mono">{f.dij ? szam(f.dij) : "—"}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div>
            <Sor cim="Bevétel a héten" ertek={`${szam(v.vele.bevetel)} Ft`} al={`${v.vele.fuvarDb} fuvar (a saját fuvar nem bevétel)`} />
            <Sor cim="Km" ertek={`${szam(v.vele.rakottKm)} + ${szam(v.vele.uresKm)} üres`} al={`üres arány ${v.vele.uresArany}%`} />
            <Sor cim="Önköltség (5 munkanap)" ertek={`${szam(v.vele.onkoltseg)} Ft`} al={`üzemanyag ${szam(v.vele.uzemanyagFt)} · útdíj ${szam(v.vele.utdijFt)} · napi ${szam(v.vele.napiFt)}`} />
            <Sor cim="A hét eredménye" ertek={`${elojel(v.vele.eredmeny)} Ft`} kiemelt />
          </div>
          <p className={cn("rounded-lg px-3 py-2 text-sm", v.utkozik ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : v.hatas >= 0 ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" : "bg-[var(--f2-red-l)] text-[var(--f2-red)]")}>
            {v.utkozik ? "⚠ Ezen a kocsin aznap már van fuvar — ütközik. " : ""}
            A fuvar nélkül a hét <b className="font-mono">{elojel(v.nelkule.eredmeny)} Ft</b> → a fuvar <b className="font-mono">{elojel(v.hatas)} Ft</b>-ot {v.hatas >= 0 ? "hoz" : "visz el"} a hétnek.
          </p>
          <p className="text-[11px] text-muted-foreground">Becslés: a napi költség a hét 5 munkanapjára fix (a kocsi akkor is költ, ha áll), ezért a fuvar hatása a díja mínusz a pluszban elmenő üzemanyag és útdíj.</p>
        </>
      ) : <p className="text-sm text-muted-foreground">Nincs aktív kocsi.</p>}
    </section>
  );
}
