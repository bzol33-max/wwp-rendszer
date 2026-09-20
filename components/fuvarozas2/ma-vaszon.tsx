import Link from "next/link";
import type { MaVaszon, Csempe, Elteres, MaKocsi, CsempeSzin } from "@/lib/fuvarozas2/ma-vaszon";

// A „Ma" képernyő a tervvászon (D1) elrendezésében: hat mérőszám, alatta az
// eltérések, majd kocsinként a nap, és a jobb oldali hasábon a teendők,
// holnap, rendszer. Szerver-komponens — nincs benne interakció, minden
// kattintás a megfelelő listára visz.

const SZIN_ERTEK: Record<CsempeSzin, string> = {
  normal: "text-foreground",
  amber: "text-[var(--f2-amb)]",
  red: "text-[var(--f2-red)]",
  mint: "text-[var(--f2-mint)]",
};

function Doboz({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-foreground/10 bg-card ${className}`}>{children}</div>;
}

function SzakaszCim({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function CsempeKartya({ cs }: { cs: Csempe }) {
  const belso = (
    <>
      <div className="text-xs font-semibold text-muted-foreground">{cs.cimke}</div>
      <div className={`text-2xl font-bold ${SZIN_ERTEK[cs.szin]}`}>{cs.ertek}</div>
      <div className="text-xs text-muted-foreground">{cs.also ?? " "}</div>
    </>
  );
  const oszt = "flex min-w-[9rem] flex-1 flex-col gap-1 rounded-2xl border border-foreground/10 bg-card px-4 py-3";
  return cs.href ? (
    <Link href={cs.href} className={`${oszt} transition-colors hover:border-[var(--f2-mint)]`}>{belso}</Link>
  ) : (
    <div className={oszt}>{belso}</div>
  );
}

function ElteresKartya({ e }: { e: Elteres }) {
  const szin = e.szin === "red"
    ? "border-[var(--f2-red)]/30 bg-[var(--f2-red-l)]"
    : "border-[var(--f2-amb)]/30 bg-[var(--f2-amb-l)]";
  const badge = e.szin === "red" ? "bg-[var(--f2-red)] text-white" : "bg-[var(--f2-amb)] text-white";
  const belso = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold">{e.cim}</div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>{e.badge}</span>
      </div>
      {e.sorok.map((s, i) => (
        <div key={i} className="text-xs text-muted-foreground">{s}</div>
      ))}
    </>
  );
  const oszt = `flex flex-col gap-1 rounded-2xl border px-4 py-3 ${szin}`;
  return e.href ? <Link href={e.href} className={`${oszt} hover:ring-1 hover:ring-foreground/20`}>{belso}</Link> : <div className={oszt}>{belso}</div>;
}

function KocsiKartya({ k }: { k: MaKocsi }) {
  return (
    <Doboz className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-bold">{k.cimke}</div>
          <div className="text-xs text-muted-foreground">{k.sofor ?? "nincs sofőr"}</div>
        </div>
        {k.etaSor ? <div className="text-xs text-muted-foreground">{k.etaSor}</div> : null}
      </div>

      {k.blokkok.length === 0 ? (
        <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Ma és holnap nincs fuvar ezen a kocsin.</div>
      ) : (
        k.blokkok.map((b) => (
          <div key={b.id} className="flex flex-col gap-1.5">
            <Link href={`/fuvarozas2/megbizasok/${b.id}`} className="flex items-baseline justify-between gap-2 hover:underline">
              <span className="truncate text-sm font-semibold">{b.partner}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{b.hivatkozas ?? (b.jelleg === "sajat" ? "saját fuvar" : "—")}</span>
            </Link>
            {b.megallok.map((m, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 border-l-2 pl-2.5 text-xs"
                style={{ borderColor: m.kiemelt === "varakozik" ? "var(--f2-red)" : m.kiemelt === "kesik" ? "var(--f2-amb)" : "var(--border)" }}>
                <span className="min-w-0 truncate">
                  <b className="font-semibold">{m.tipus === "felrako" ? "Felrakó" : "Lerakó"}</b>
                  <span className="text-muted-foreground"> · {m.varos}{m.allapot ? ` · ${m.allapot}` : ""}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{m.ido}</span>
              </div>
            ))}
          </div>
        ))
      )}

      {k.vezetesSor ? (
        <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {k.vezetesSor} <span className="opacity-70">· GPS-becslés, nem tachográf</span>
        </div>
      ) : null}
    </Doboz>
  );
}

export function MaVaszonNezet({ adat }: { adat: MaVaszon }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {adat.csempek.map((cs) => <CsempeKartya key={cs.kulcs} cs={cs} />)}
      </div>

      <div className="flex flex-col gap-2">
        <SzakaszCim>Eltérések — ami nem terv szerint megy</SzakaszCim>
        {adat.elteresek.length === 0 ? (
          <div className="rounded-2xl border border-[var(--f2-mint)]/30 bg-[var(--f2-mint-l)] px-4 py-3 text-sm text-[var(--f2-mint)]">
            Minden terv szerint megy — nincs késés, várakozás vagy jóváhagyásra váró import.
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {adat.elteresek.map((e) => <ElteresKartya key={e.kulcs} e={e} />)}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          {adat.kocsik.map((k) => <KocsiKartya key={k.kod} k={k} />)}
          {adat.kocsiNelkul.length > 0 ? (
            <Doboz className="flex flex-col gap-2 p-4">
              <SzakaszCim>Kocsi nélkül — ma/holnap ({adat.kocsiNelkul.length})</SzakaszCim>
              {adat.kocsiNelkul.map((s) => (
                <Link key={s.id} href={`/fuvarozas2/megbizasok/${s.id}`} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                  <span className="min-w-0 truncate">{s.partner}<span className="text-muted-foreground"> · {s.utvonal}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.nap ?? "—"}</span>
                </Link>
              ))}
            </Doboz>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Doboz className="flex flex-col gap-2 p-4">
            <SzakaszCim>Teendők (iroda)</SzakaszCim>
            {adat.teendok.map((t) => (
              <Link key={t.cimke} href={t.href} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
                <span className="text-muted-foreground">{t.cimke}</span>
                <span className="shrink-0 text-right">
                  <b className="tabular-nums">{t.ertek}</b>
                  {t.also ? <span className="ml-1 text-xs text-muted-foreground">{t.also}</span> : null}
                </span>
              </Link>
            ))}
            <div className="text-[11px] text-muted-foreground">Szabina ugyanezt látja a Teendők nézetében.</div>
          </Doboz>

          <Doboz className="flex flex-col gap-2 p-4">
            <SzakaszCim>Holnap</SzakaszCim>
            {adat.holnapDoboz.map((h) => (
              <div key={h.cimke} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{h.cimke}</span>
                <b className={`tabular-nums ${SZIN_ERTEK[h.szin]}`}>{h.ertek}</b>
              </div>
            ))}
            <Link href="/fuvarozas2/tervezes" className="text-xs underline">Tervezés →</Link>
          </Doboz>

          {adat.rendszer.length > 0 ? (
            <Doboz className="flex flex-col gap-1.5 p-4">
              <SzakaszCim>Rendszer</SzakaszCim>
              {adat.rendszer.map((r) => (
                <div key={r.cimke} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">{r.cimke}</span>
                  <span className="shrink-0">
                    {r.ertek} <span className={r.rendben ? "text-[var(--f2-mint)]" : "text-[var(--f2-amb)]"}>{r.rendben ? "✓" : "!"}</span>
                  </span>
                </div>
              ))}
              <Link href="/fuvarozas2/rendszer" className="text-xs underline">Rendszer →</Link>
            </Doboz>
          ) : null}
        </div>
      </div>
    </div>
  );
}
