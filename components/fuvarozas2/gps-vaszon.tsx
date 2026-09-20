import type { GpsVaszon, GpsKocsi, SavTipus } from "@/lib/fuvarozas2/gps-vaszon";

// Élő GPS a tervvászon (D4) szerint: kocsinként egy 24 órás sáv és a napi
// mutatók. A sáv színei = a négy állapot; a szaggatott minta a becsült
// (még le nem zárt, élő pozícióból kiegészített) szakaszt jelöli.

const SAV_SZIN: Record<SavTipus, string> = {
  vezetes: "var(--f2-mint)",
  rakodas: "var(--f2-blue)",
  szunet: "var(--f2-amb)",
  allas: "var(--muted-foreground)",
};
const SAV_NEV: Record<SavTipus, string> = { vezetes: "vezetés", rakodas: "rakodás / várakozás", szunet: "szünet", allas: "rövid állás" };
const ORAK = [5, 8, 11, 14, 17, 20];

function Sav({ k }: { k: GpsKocsi }) {
  return (
    <div className="relative h-9 w-full rounded-lg bg-muted/60">
      {ORAK.map((o) => (
        <div key={o} className="absolute top-0 h-full border-l border-foreground/10" style={{ left: `${(o / 24) * 100}%` }}>
          <span className="absolute -top-4 left-1 text-[10px] text-muted-foreground">{o}</span>
        </div>
      ))}
      {k.savok.map((s, i) => (
        <div
          key={i}
          title={`${SAV_NEV[s.tipus]} · ${s.cimke}${s.becsult ? " · becsült" : ""}`}
          className="absolute top-1.5 h-6 rounded-md"
          style={{
            left: `${(s.kezdet / 1440) * 100}%`,
            width: `${Math.max(0.4, (s.hossz / 1440) * 100)}%`,
            background: SAV_SZIN[s.tipus],
            opacity: s.becsult ? 0.45 : 1,
            border: s.becsult ? "1px dashed var(--foreground)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function GpsVaszonNezet({ adat }: { adat: GpsVaszon }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Élő · {adat.ido}</span>
        {(Object.keys(SAV_NEV) as SavTipus[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded" style={{ background: SAV_SZIN[t] }} /> {SAV_NEV[t]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-dashed border-foreground opacity-45" style={{ background: "var(--f2-mint)" }} /> becsült
        </span>
      </div>

      {adat.kocsik.map((k) => (
        <div key={k.kod} className="flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-sm font-bold">{k.cimke}</div>
              <div className="text-xs text-muted-foreground">{k.sofor ?? "nincs sofőr"}</div>
            </div>
            {k.fej ? <div className="text-xs font-semibold text-[var(--f2-mint)]">{k.fej}</div> : null}
          </div>

          {k.hiba ? (
            <div className="rounded-xl bg-[var(--f2-amb-l)] px-3 py-2 text-xs text-[var(--f2-amb)]">{k.hiba}</div>
          ) : k.savok.length === 0 ? (
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Ma még nincs GPS-szakasz erre a kocsira.</div>
          ) : (
            <div className="pt-4"><Sav k={k} /></div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3 lg:grid-cols-6">
            {k.mutatok.map((m) => (
              <div key={m.cimke}>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.cimke}</div>
                <div className={`text-sm font-semibold ${m.kiemelt ? "text-[var(--f2-red)]" : ""}`}>{m.ertek}</div>
                {m.also ? <div className="text-[11px] text-muted-foreground">{m.also}</div> : null}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">A vezetési idő és a szünet GPS-ből számolt becslés (561/2006/EK), nem tachográf-adat.</div>
        </div>
      ))}

      <div className="rounded-2xl border border-foreground/10 bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanult rakodási idők</div>
        {adat.tanult.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Még nincs elég mért megálló (helyenként legalább 3 kell).</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {adat.tanult.map((t) => (
              <span key={t.hely} className="rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
                {t.hely} <b>{t.perc} p</b> <span className="text-xs text-muted-foreground">({t.minta} minta)</span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{adat.pontossagMegjegyzes}</p>
      </div>
    </div>
  );
}
