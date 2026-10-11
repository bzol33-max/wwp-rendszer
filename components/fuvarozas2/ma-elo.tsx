"use client";

// Ma oldal — élő nézet (az új terv 1. oldala, 2026-10-11). Felül csak a
// sürgős teendő, középen a térkép a két kocsival és kocsinként nagy betűvel
// „MEGY 84 km/h” / „ÁLL 59 p”, hol van, hova tart, mikorra; alatta a mai
// idősáv „most” vonallal. Pénz és papír nincs rajta (az a Megbízásoké).

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAutoFrissites } from "@/components/fuvarozas2/auto-frissites";
import type { MaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { savAblak, idoTartam, type SavElem } from "@/lib/fuvarozas2/ma-elo";
import { KOCSI_SZINEK_LISTA } from "@/components/fuvarozas2/ma-elo-szinek";

const MaEloTerkep = dynamic(() => import("@/components/fuvarozas2/ma-elo-terkep").then((m) => m.MaEloTerkep), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">Térkép betöltése…</div>,
});

const ALLAPOT_OSZTALY = {
  kek: "text-[var(--f2-blue)]",
  borostyan: "text-[var(--f2-amb)]",
  szurke: "text-muted-foreground",
} as const;

const SAV_OSZTALY: Record<SavElem["tipus"], string> = {
  vezetes: "bg-[var(--f2-blue)]",
  rakodas: "bg-[var(--f2-mint)]",
  allas: "bg-foreground/25",
  piheno: "bg-foreground/10",
};

function hhmm(perc: number) {
  const n = ((Math.round(perc) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function budapestMostPerc() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
  const ora = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const perc = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return ora * 60 + perc;
}

export function MaEloNezet({ adat }: { adat: MaVaszon }) {
  // Az oldal egyetlen frissítője (percenként, csak látható fülön); a GPS-lánc szerveroldali.
  useAutoFrissites(60_000);
  const [mostPerc, setMostPerc] = useState<number | null>(null);
  useEffect(() => {
    const frissit = () => setMostPerc(budapestMostPerc());
    frissit();
    const t = setInterval(frissit, 30000);
    return () => clearInterval(t);
  }, []);

  const kocsik = adat.kocsik.filter((k) => k.kod && !k.helykitolto);
  const elok = kocsik.map((k, i) => ({ k, elo: k.elo, szin: KOCSI_SZINEK_LISTA[i % KOCSI_SZINEK_LISTA.length] }));
  const terkepre = elok.filter((x) => x.elo).map(({ k, elo, szin }) => ({
    kod: k.kod!, nev: k.sofor ?? k.cimke, lat: elo!.lat, lon: elo!.lon, irany: elo!.irany, allapot: elo!.allapot, szam: elo!.szam, szin: elo!.szin,
    nyomvonal: elo!.nyomvonal, hatraVan: elo!.hatraVan, kovetkezoCim: elo!.kovetkezo?.cel ?? null, vonalSzin: szin,
  }));

  const teendok = adat.elteresek.slice(0, 3);
  const most = mostPerc ?? 12 * 60;
  const ablak = savAblak(elok.flatMap((x) => x.elo?.sav ?? []), elok.flatMap((x) => x.elo?.pontok ?? []), most);
  const hossz = Math.max(60, ablak.ig - ablak.tol);
  const poz = (p: number) => `${Math.min(100, Math.max(0, ((p - ablak.tol) / hossz) * 100))}%`;
  const szel = (a: number, b: number) => `${Math.max(0.4, ((Math.min(b, ablak.ig) - Math.max(a, ablak.tol)) / hossz) * 100)}%`;
  const orak: number[] = [];
  for (let o = ablak.tol; o <= ablak.ig; o += 120) orak.push(o);

  return (
    <div className="flex flex-col gap-4">
      {/* Teendő-sáv: csak ami most beavatkozást kér. */}
      {teendok.length ? (
        <div className="flex flex-col gap-2 md:flex-row">
          {teendok.map((t) => (
            <div key={t.kulcs} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm ${t.szin === "red" ? "bg-[var(--f2-red-l)] text-[var(--f2-red)]" : "bg-[var(--f2-amb-l)] text-[#5a3806]"}`}>
              <b className="max-w-[45%] shrink-0 truncate">{t.badge}</b>
              <span className="min-w-0 flex-1 truncate">{t.cim}</span>
              {t.href ? <Link href={t.href} className="shrink-0 rounded-lg border border-current/30 bg-card px-3 py-1.5 text-xs font-semibold text-foreground">Megnézem →</Link> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--f2-mint-l)] px-3 py-2 text-sm font-medium text-[var(--f2-mint)]">Nincs sürgős teendő.</div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-foreground/10 md:min-h-[560px]">
          {terkepre.length ? <MaEloTerkep kocsik={terkepre} /> : <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">Nincs élő GPS-adat.</div>}
        </div>

        <div className="flex flex-col divide-y rounded-2xl border border-foreground/10 bg-card">
          {elok.map(({ k, elo, szin }) => (
            <section key={k.kod} className="flex flex-col gap-2 p-5" aria-label={`${k.sofor ?? k.cimke} élő állapota`}>
              <div className="flex items-baseline gap-2">
                <span className="inline-block size-3 rounded-full" style={{ background: szin }} aria-hidden />
                <b className="text-base">{k.sofor ?? k.cimke}</b>
                <span className="text-xs text-muted-foreground">{k.kod}</span>
                {elo ? <span className="ml-auto text-xs tabular-nums text-muted-foreground">jel {elo.gpsKoraPerc <= 1 ? "most" : `${idoTartam(elo.gpsKoraPerc)} ezelőtt`}</span> : null}
              </div>
              {elo ? (
                <>
                  <div className={`flex items-baseline gap-3 font-bold tabular-nums ${ALLAPOT_OSZTALY[elo.szin]}`}>
                    <span className="text-3xl tracking-tight">{elo.allapot}</span>
                    <span className="text-3xl">{elo.szam}</span>
                  </div>
                  <p className="text-sm">
                    {elo.hely ?? "ismeretlen hely"}
                    {elo.allapot === "ÁLL" ? ` · motor ${elo.motorJar ? "jár" : "ki"}` : ""}
                    {elo.allapot === "MEGY" && elo.ota != null ? ` · ${idoTartam(elo.ota)} óta megy` : ""}
                  </p>
                  <div className="mt-1 flex flex-col gap-1 border-t pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Következő</span>
                    {elo.kovetkezo ? (
                      <div className="flex items-baseline gap-2">
                        <b className="min-w-0 truncate">{elo.kovetkezo.cel}</b>
                        <span className="text-xs text-muted-foreground">{elo.kovetkezo.tipus === "felrako" ? "felrakó" : "lerakó"}</span>
                        <b className="ml-auto text-xl tabular-nums">{elo.kovetkezo.eta ? `${elo.kovetkezo.etaNap > 0 ? "holnap " : ""}~${elo.kovetkezo.eta}` : "—"}</b>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Mára nincs több megálló.{k.holnap[0] ? ` ${adat.holnapCimke}: ${k.holnap[0].utvonal}` : ""}</span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{elo.vezetesPerc != null ? <>Vezetés ma <b className="text-foreground">{idoTartam(elo.vezetesPerc)}</b> / 9:00</> : null}</span>
                    <span>{elo.szunetigPerc != null ? (elo.szunetigPerc === 0 ? "szünet esedékes" : `szünet ${idoTartam(elo.szunetigPerc)} múlva`) : null} · becslés</span>
                  </div>
                  {elo.napiKm != null ? <span className="text-xs tabular-nums text-muted-foreground">ma {elo.napiKm} km</span> : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{k.allapot?.szoveg ?? "Nincs élő GPS-adat."}</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Idősáv: ma, kocsinként — tény (GPS) színes sáv, tervezett megállók pöttyel, „most” vonal. */}
      <section className="rounded-2xl border border-foreground/10 bg-card px-4 pb-3 pt-4" aria-label="Mai idősáv">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <span />
          <div className="relative h-4 text-[11px] tabular-nums text-muted-foreground">
            {orak.map((o) => <span key={o} className="absolute -translate-x-1/2" style={{ left: poz(o) }}>{hhmm(o).slice(0, 2)}</span>)}
          </div>
          {elok.map(({ k, elo, szin }) => (
            <div key={k.kod} className="contents">
              <b className="truncate text-sm">{k.sofor ?? k.cimke}</b>
              <div className="relative h-10 rounded-lg bg-muted/60">
                {(elo?.sav ?? []).filter((e) => e.ig > ablak.tol && e.tol < ablak.ig).map((e, i) => (
                  <span key={i} title={`${hhmm(e.tol)}–${hhmm(e.ig)} ${e.tipus === "vezetes" ? "vezetés" : e.tipus === "rakodas" ? "rakodás" : e.tipus === "piheno" ? "pihenő" : "állás"}${e.cimke ? ` · ${e.cimke}` : ""}`}
                    className={`absolute top-2 h-6 rounded ${SAV_OSZTALY[e.tipus]}`} style={{ left: poz(e.tol), width: szel(e.tol, e.ig) }} />
                ))}
                {(elo?.pontok ?? []).filter((p) => p.perc >= ablak.tol && p.perc <= ablak.ig).map((p, i) => (
                  <span key={`p${i}`} title={`${p.tipus === "felrako" ? "Felrakó" : "Lerakó"}: ${p.cimke} · ${hhmm(p.perc)}`}
                    className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${p.kesz ? "border-[var(--f2-mint)] bg-[var(--f2-mint)]" : "bg-card"}`}
                    style={{ left: poz(p.perc), borderColor: p.kesz ? undefined : szin }} />
                ))}
                {mostPerc != null ? <span className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--f2-red)]" style={{ left: poz(most) }} aria-hidden /> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 pl-[84px] text-[11px] text-muted-foreground">
          <span><i className="mr-1 inline-block h-2 w-4 rounded bg-[var(--f2-blue)] align-middle" />vezetés</span>
          <span><i className="mr-1 inline-block h-2 w-4 rounded bg-[var(--f2-mint)] align-middle" />rakodás</span>
          <span><i className="mr-1 inline-block h-2 w-4 rounded bg-foreground/25 align-middle" />állás</span>
          <span>○ tervezett megálló · ● kész</span>
          <span className="text-[var(--f2-red)]">│ most</span>
          <span className="ml-auto">frissítve {adat.frissitve} · percenként magától</span>
        </div>
      </section>
    </div>
  );
}
