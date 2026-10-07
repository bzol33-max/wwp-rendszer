import Link from "next/link";
import type { MaHet } from "@/lib/fuvarozas2/ma-vaszon";
import type { HetKartya, HetMost, HetSzin } from "@/lib/fuvarozas2/ma-het";

// A Ma oldal heti rácsa (Budaházi Zoltán, 2026-10-05, „R2” terv): soronként
// egy kocsi, a „Most” oszlop a mostani fuvar haladásával (kör: kész
// megállók aránya, következő megálló, ETA), utána hétfőtől péntekig a
// megbízások. A kész fuvar a helyén marad, a több napos a következő napon
// „folytatódik”. Szerver-komponens; keskeny képernyőn vízszintesen görgethető.

const reszlet = (id: string) => `/fuvarozas2/megbizasok?reszlet=${id}`;
const RACS = "grid grid-cols-[150px_220px_repeat(5,minmax(0,1fr))] gap-2";

const KARTYA: Record<HetSzin, string> = {
  kesz: "border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)]/60",
  foto: "border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)]/60",
  uton: "border-[1.5px] border-[var(--f2-blue)] bg-[var(--f2-blue-l)]/60",
  ott: "border-[1.5px] border-[var(--f2-amb)] bg-[var(--f2-amb-l)]/60",
  terv: "border-foreground/10 bg-muted/40",
  ellenorzes: "border-dashed border-[var(--f2-amb)] bg-card",
};
const PILL: Record<HetSzin, string> = {
  kesz: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  foto: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  uton: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
  ott: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  terv: "bg-muted text-muted-foreground",
  ellenorzes: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
};
const ALLAPOT_PONT = { mint: "bg-[var(--f2-mint)]", amber: "bg-[var(--f2-amb)]", red: "bg-[var(--f2-red)]", normal: "bg-foreground/40" } as const;

function Kartya({ k }: { k: HetKartya }) {
  if (k.folytatodik && k.aznapKesz) {
    return (
      <Link href={reszlet(k.id)} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)]/60 px-2 py-1.5 text-xs hover:border-foreground/40">
        <b className="truncate">✓ #{k.id} {k.partner}</b>
        <span className="truncate text-[11px] text-muted-foreground">{k.aznap} ✓ · {k.cimke}</span>
      </Link>
    );
  }
  if (k.folytatodik) {
    return (
      <Link href={reszlet(k.id)} className="flex min-w-0 flex-col gap-0.5 rounded-lg border-[1.5px] border-dashed border-foreground/20 bg-card px-2 py-1.5 text-xs hover:border-foreground/40">
        <b className="truncate">#{k.id} {k.partner}</b>
        <span className="truncate text-[11px] text-muted-foreground">folytatódik · {k.aznap}</span>
      </Link>
    );
  }
  const kesz = k.szin === "kesz" || k.szin === "foto";
  return (
    <Link href={reszlet(k.id)} className={`flex min-w-0 flex-col gap-1 rounded-lg border px-2 py-1.5 text-xs hover:border-foreground/40 ${KARTYA[k.szin]}`}>
      <b className="truncate">{kesz ? "✓ " : ""}#{k.id} {k.partner}</b>
      <span className="truncate text-[11px] text-muted-foreground">{k.utvonal} · {k.jelleg === "sajat" ? "saját" : "bér"}</span>
      <span className={`self-start truncate rounded-full px-1.5 py-px text-[10px] font-semibold ${PILL[k.szin]}`}>{k.cimke}</span>
    </Link>
  );
}

function Most({ m, helykitolto }: { m: HetMost; helykitolto: string | null }) {
  if (helykitolto) return <div className="flex items-center rounded-xl border border-dashed border-foreground/15 px-3 text-xs text-muted-foreground">{helykitolto}</div>;
  if (m.tipus === "ures") {
    return (
      <Link href="/fuvarozas2/tervezes" className="flex flex-col justify-center rounded-xl border-[1.5px] border-dashed border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/60 px-3 py-2 text-xs font-semibold text-[var(--f2-amb)] hover:underline">
        Nincs mai fuvar<span className="font-normal">keress fuvart →</span>
      </Link>
    );
  }
  if (m.tipus === "kesz") {
    return <div className="flex items-center rounded-xl border border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)]/60 px-3 text-xs font-semibold text-[var(--f2-mint)]">✓ A mai fuvarok készek</div>;
  }
  const szin = m.szin === "amber" ? "var(--f2-amb)" : "var(--f2-blue)";
  return (
    <Link href={reszlet(m.fuvarId)} className="flex items-center gap-2.5 rounded-xl border border-foreground/10 bg-card px-2.5 py-2 hover:border-foreground/30">
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${szin} ${m.szazalek * 3.6}deg, var(--muted) 0)` }}
        aria-label={`${m.szazalek}% kész`}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-card text-[11px] font-bold tabular-nums">{m.szazalek}%</span>
      </span>
      <span className="flex min-w-0 flex-col text-xs">
        <b className="truncate">#{m.fuvarId} {m.partner}</b>
        <span className="truncate text-muted-foreground">következő: <b className="text-foreground">{m.kovetkezo}</b></span>
        {m.ido ? <span className="truncate font-mono text-[11px]" style={{ color: szin }}>{m.ido}</span> : null}
      </span>
    </Link>
  );
}

function Cella({ lista, ma, ures }: { lista: HetKartya[]; ma: boolean; ures: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 rounded-xl bg-card p-1.5 ${ma ? "border-2 border-foreground" : "border border-foreground/10"}`}>
      {lista.length > 0 ? lista.map((k) => <Kartya key={`${k.id}-${k.folytatodik}`} k={k} />) : ures}
    </div>
  );
}

export function HetRacs({ het }: { het: MaHet }) {
  const kocsiNelkulVan = het.kocsiNelkul.some((c) => c.length > 0);
  return (
    <div className="overflow-x-auto rounded-2xl border border-foreground/10 bg-muted/30 p-3">
      <div className="flex min-w-[1080px] flex-col gap-2">
        <div className={`${RACS} text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground`}>
          <span className="text-left normal-case tracking-normal text-foreground">{het.cim}</span>
          <span className="py-1 text-[var(--f2-blue)]">Most</span>
          {het.napok.map((n) => (
            <span key={n.nap} className={`rounded-lg py-1 ${n.ma ? "bg-foreground text-background" : ""}`}>{n.cimke}{n.ma ? " · ma" : ""}</span>
          ))}
        </div>

        {het.sorok.map((s, i) => (
          <div key={s.kod ?? `hely-${i}`} className={RACS}>
            <div className="flex min-w-0 flex-col justify-center gap-0.5 px-1 text-xs">
              <b className="truncate text-sm">{s.sofor ?? s.cimke}</b>
              {s.sofor ? <span className="truncate text-muted-foreground">{s.cimke}</span> : null}
              {s.allapot ? (
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className={`size-2 shrink-0 rounded-full ${ALLAPOT_PONT[s.allapot.szin]}`} />
                  <span className="truncate">{s.allapot.szoveg}</span>
                </span>
              ) : null}
            </div>
            <Most m={s.most} helykitolto={s.helykitolto} />
            {s.cellak.map((lista, d) => (
              <Cella
                key={het.napok[d].nap}
                lista={lista}
                ma={het.napok[d].ma}
                ures={
                  s.kod && !s.helykitolto ? (
                    <Link href="/fuvarozas2/tervezes" className="flex min-h-10 flex-1 items-center justify-center rounded-lg border-[1.5px] border-dashed border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/50 text-xs font-semibold text-[var(--f2-amb)] hover:underline">
                      Üres — keress →
                    </Link>
                  ) : <span className="min-h-10" />
                }
              />
            ))}
          </div>
        ))}

        {kocsiNelkulVan ? (
          <div className={RACS}>
            <b className="col-span-2 flex items-center px-1 text-xs text-[var(--f2-red)]">Kocsi nélkül</b>
            {het.kocsiNelkul.map((lista, d) =>
              lista.length > 0 ? (
                <Cella key={het.napok[d].nap} lista={lista} ma={het.napok[d].ma} ures={null} />
              ) : (
                <span key={het.napok[d].nap} className="rounded-xl border border-dashed border-foreground/10" />
              )
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
