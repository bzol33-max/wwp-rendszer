"use client";

import { useState } from "react";
import type { BerOsszesito, KmDij } from "@/lib/fuvarozas2/ma-vaszon";
import type { KihasznaltsagAdat, KihasznaltsagSor } from "@/lib/fuvarozas2/kihasznaltsag";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";

// Csempesor a fejléc alatt. Eredetileg (1-es látványterv, 2026-09-29) tíz
// hely egy sorban; az 1. hullámban (docs/fuvarozas-1-hullam-terv.md B,
// 2026-10-16) a 4–10. üres hely megszűnt, a helyükön kocsinként egy
// kihasználtság-sor áll (Fedezet/nap · Bevétel/nap · Üres km % · Fizetős
// napok, hét | hónap váltóval). Megmaradt: 1. havi, 2. heti bérfuvar (a havira
// kattintva alatta lenyílnak a hónap hetei), 3. havi átlag km-díj. Telefonon
// nincs oldalra húzás: a csempék két oszlopba törnek, a kocsisorok egymás alá.
// Kliens-komponens a lenyitás és a hét/hónap váltó miatt.
const CSEMPE_OSZT = "flex min-h-[76px] min-w-0 flex-col rounded-xl";

const rovidFt = (n: number): string =>
  n < 0 ? `−${rovidFt(-n)}` : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace(".", ",")} M` : n >= 1000 ? `${Math.round(n / 1000)} e` : String(Math.round(n));
const eur = (n: number) => `${new Intl.NumberFormat("hu-HU").format(Math.round(n))} €`;

/** 1–2. csempe: a hónapban / héten kezdett bérfuvarok nettó díja, kocsinként; az euró külön. */
function BerCsempe({ b, onClick, nyitva }: { b: BerOsszesito; onClick?: () => void; nyitva?: boolean }) {
  const max = Math.max(...b.kocsik.map((k) => k.ft), 1);
  const belso = (
    <>
      <div className="flex flex-col bg-primary px-2.5 py-1 text-primary-foreground">
        <span className="truncate text-[10px] leading-tight opacity-90">Bérfuvar · {b.cim}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
          <b className="text-base font-bold tabular-nums">{rovidFt(b.ft)} Ft</b>
          {b.eur > 0 ? <span className="text-[10px] font-semibold tabular-nums">+ {eur(b.eur)}</span> : null}
        </span>
      </div>
      <div className="flex flex-col gap-px px-2.5 py-1">
        {b.kocsik.map((k, i) => {
          const ures = k.ft === 0 && k.eur === 0;
          return (
            <div key={i} className={`flex items-center gap-1 text-[10px] leading-tight ${ures ? "text-muted-foreground" : ""}`} title={k.eur > 0 ? `${k.nev}: ${rovidFt(k.ft)} Ft + ${eur(k.eur)}` : undefined}>
              <span className="w-8 shrink-0 truncate">{k.nev}</span>
              <span className="h-[4px] min-w-0 flex-1 rounded-full bg-foreground/10">
                {k.ft > 0 ? (
                  <span className={`block h-[4px] rounded-full ${k.szin ? JARMU_SZIN_DOT_CLASS[k.szin] : "bg-foreground/40"}`} style={{ width: `${Math.max(4, Math.round((k.ft / max) * 100))}%` }} />
                ) : null}
              </span>
              <b className="shrink-0 font-semibold tabular-nums">{ures ? "—" : k.ft > 0 ? rovidFt(k.ft) : ""}{k.eur > 0 ? " +€" : ""}</b>
            </div>
          );
        })}
      </div>
    </>
  );
  const oszt = `${CSEMPE_OSZT} overflow-hidden border bg-card text-left`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={nyitva} className={`${oszt} ${nyitva ? "border-primary ring-1 ring-primary" : "border-foreground/10 hover:border-primary"}`}>
      {belso}
    </button>
  ) : (
    <div className={`${oszt} border-foreground/10`}>{belso}</div>
  );
}

const ftKm = (k: KmDij) => (k.kmFtKm > 0 ? Math.round(k.kmFt / k.kmFtKm) : null);
const eurKm = (k: KmDij) => (k.kmEurKm > 0 ? (k.kmEur / k.kmEurKm).toFixed(2).replace(".", ",") : null);

/** 3. csempe: a hónapban kezdett díjas bérfuvarok átlag km-díja (összes díj ÷ összes rakott km), kocsinként. */
function KmDijCsempe({ b }: { b: BerOsszesito }) {
  const flotta = ftKm(b.km);
  const flottaEur = eurKm(b.km);
  const max = Math.max(...b.kocsik.map((k) => ftKm(k.km) ?? 0), 1);
  return (
    <div className={`${CSEMPE_OSZT} overflow-hidden border border-foreground/10 bg-card`}>
      <div className="flex flex-col bg-primary px-2.5 py-1 text-primary-foreground">
        <span className="truncate text-[10px] leading-tight opacity-90">Km-díj · {b.cim}</span>
        <span className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
          <b className="text-base font-bold tabular-nums">{flotta != null ? `${flotta} Ft/km` : "—"}</b>
          {flottaEur ? <span className="text-[10px] font-semibold tabular-nums">{flottaEur} €/km</span> : null}
        </span>
      </div>
      <div className="flex flex-col gap-px px-2.5 py-1">
        {b.kocsik.map((k, i) => {
          const ertek = ftKm(k.km);
          const eu = eurKm(k.km);
          return (
            <div key={i} className={`flex items-center gap-1 text-[10px] leading-tight ${ertek == null && !eu ? "text-muted-foreground" : ""}`} title={eu ? `${k.nev}: ${ertek ?? "—"} Ft/km, ${eu} €/km` : undefined}>
              <span className="w-8 shrink-0 truncate">{k.nev}</span>
              <span className="h-[4px] min-w-0 flex-1 rounded-full bg-foreground/10">
                {ertek != null ? (
                  <span className={`block h-[4px] rounded-full ${k.szin ? JARMU_SZIN_DOT_CLASS[k.szin] : "bg-foreground/40"}`} style={{ width: `${Math.max(4, Math.round((ertek / max) * 100))}%` }} />
                ) : null}
              </span>
              <b className="shrink-0 font-semibold tabular-nums">{ertek ?? (eu ? "" : "—")}{eu ? " +€" : ""}</b>
            </div>
          );
        })}
        {b.kmNelkul > 0 ? <span className="text-[10px] leading-tight text-muted-foreground">{b.kmNelkul} fuvar még km nélkül</span> : null}
      </div>
    </div>
  );
}

const tized = (n: number) => n.toFixed(1).replace(".", ",");
const ezres = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n));

/** Egy mutató a kocsisorban: kis felirat, alatta az érték. */
function Mutato({ cimke, ertek, szin, title }: { cimke: string; ertek: string; szin?: "amber" | "red"; title?: string }) {
  const szinOszt = szin === "red" ? "text-[var(--f2-red)]" : szin === "amber" ? "text-[var(--f2-amb)]" : "text-foreground";
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className="truncate text-[10px] leading-tight text-muted-foreground">{cimke}</span>
      <b className={`truncate text-sm font-semibold leading-tight tabular-nums ${szinOszt}`}>{ertek}</b>
    </div>
  );
}

function KocsiSor({ nev, szin, s }: { nev: string; szin: string | null; s: KihasznaltsagSor }) {
  const fedezetSzin = s.fedezetPerNap != null && s.fedezetPerNap < 0 ? "red" : undefined;
  const uresSzin = s.uresKmSzazalek != null && s.uresKmSzazalek > 30 ? "amber" : undefined;
  const eurMegj = s.atvaltatlanEur > 0 ? ` (+ ${eur(s.atvaltatlanEur)} árfolyam nélkül, nincs benne)` : "";
  return (
    <div className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex w-24 shrink-0 items-center gap-1.5 truncate text-xs font-semibold">
        <span className={`inline-block size-2 shrink-0 rounded-full ${szin ?? "bg-foreground/40"}`} />
        <span className="truncate">{nev}</span>
      </span>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-2">
        <Mutato
          cimke="Fedezet/nap"
          ertek={s.fedezetPerNap != null ? `${rovidFt(s.fedezetPerNap)} Ft` : "—"}
          szin={fedezetSzin}
          title={`Fedezet: ${ezres(s.fedezetFt)} Ft = bérbevétel ${ezres(s.berBevetelFt)} Ft + saját fuvar belső díja ${ezres(s.sajatBevetelFt)} Ft − km-költség ${ezres(s.kmKoltsegFt)} Ft − napi fix × ${s.munkanapok} munkanap${eurMegj}`}
        />
        <Mutato
          cimke="Bevétel/nap"
          ertek={s.bevetelPerNap != null ? `${rovidFt(s.bevetelPerNap)} Ft` : "—"}
          title={`Bérbevétel: ${ezres(s.berBevetelFt)} Ft (${s.berDb} bérfuvar) + saját fuvar belső díja: ${ezres(s.sajatBevetelFt)} Ft (${s.sajatDb} saját fuvar, ${ezres(s.sajatRakottKm)} rakott km × a bérfuvarok átlag Ft/km-e), ${s.munkanapok} munkanap${eurMegj}`}
        />
        <Mutato
          cimke="Üres km"
          ertek={s.uresKmSzazalek != null ? `${tized(s.uresKmSzazalek)} %` : "—"}
          szin={uresSzin}
          title={`Üres ${ezres(s.uresKm)} km, rakott ${ezres(s.rakottKm)} km (fuvarláncból — becslés)`}
        />
        <Mutato
          cimke="Fizetős nap"
          ertek={s.munkanapok > 0 ? `${s.fizetosNapok}/${s.munkanapok}` : "—"}
          title={`${s.fizetosNapok} nap bérfuvarral, ${s.sajatNapok} csak saját fuvarral, ${s.munkanapok} munkanap`}
        />
      </div>
    </div>
  );
}

/** Kocsinkénti kihasználtság (1. hullám B): a szerver mindkét időszakot küldi, a váltó csak kliensoldali. */
function KihasznaltsagSav({ k }: { k: KihasznaltsagAdat }) {
  const [idoszak, setIdoszak] = useState<"het" | "honap">("het");
  const fejlec = idoszak === "het" ? k.het : k.honap;
  const p = k.param;
  return (
    <div className="flex flex-col rounded-xl border border-foreground/10 bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={`Km-költség: ${p.fogyasztasL100} l/100 km × ${ezres(p.uzemanyagFtL)} Ft/l + ${ezres(p.utdijFtKm)} Ft/km útdíj; napi fix ${ezres(p.napiFixFt)} Ft/munkanap`}
        >
          <b className="font-semibold text-foreground">Kihasználtság</b> · {fejlec.cim}
        </span>
        <div role="group" aria-label="Időszak" className="flex shrink-0 rounded-lg border border-foreground/10 p-0.5 text-xs">
          {([["het", "Hét"], ["honap", "Hónap"]] as const).map(([kulcs, felirat]) => (
            <button
              key={kulcs}
              type="button"
              aria-pressed={idoszak === kulcs}
              onClick={() => setIdoszak(kulcs)}
              className={`min-h-8 rounded-md px-3 ${idoszak === kulcs ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {felirat}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-foreground/10">
        {k.kocsik.map((x) => (
          <KocsiSor key={x.kod} nev={x.nev} szin={x.szin ? JARMU_SZIN_DOT_CLASS[x.szin] : null} s={idoszak === "het" ? x.het : x.honap} />
        ))}
      </div>
    </div>
  );
}

export function Csempesor({ berHavi, berHeti, berHonapHetei, kihasznaltsag }: {
  berHavi: BerOsszesito; berHeti: BerOsszesito; berHonapHetei: BerOsszesito[]; kihasznaltsag: KihasznaltsagAdat | null;
}) {
  const [hetekNyitva, setHetekNyitva] = useState(false);
  const vanSav = !!kihasznaltsag && kihasznaltsag.kocsik.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className={`grid items-start gap-2 ${vanSav ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]" : ""}`}>
        <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3">
          <BerCsempe b={berHavi} onClick={() => setHetekNyitva((x) => !x)} nyitva={hetekNyitva} />
          <BerCsempe b={berHeti} />
          <KmDijCsempe b={berHavi} />
        </div>
        {vanSav ? <KihasznaltsagSav k={kihasznaltsag} /> : null}
      </div>
      {hetekNyitva ? (
        <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3 md:grid-cols-5">
          {berHonapHetei.map((h) => <BerCsempe key={h.cim} b={h} />)}
        </div>
      ) : null}
    </div>
  );
}
