import { Fragment } from "react";
import Link from "next/link";
import type { KocsiLap } from "@/lib/fuvarozas2/kocsi-lap";
import type { KihasznaltsagSor } from "@/lib/fuvarozas2/kihasznaltsag";
import { fuvarJel, type NapCella, type Res } from "@/lib/fuvarozas2/tervezes-het-alap";
import { pihenoNapE } from "@/lib/fuvarozas2/ma-het";
import { KocsiOszlop } from "@/components/fuvarozas2/ma-vaszon";
import { ForrasJel } from "@/components/fuvarozas2/forras-jel";
import { formatFt, formatNap } from "@/components/fuvarozas2/kozos";
import { cn } from "@/lib/utils";

// Fuvarozás 2 · Kocsi lapja — egy kocsi fentről lefelé: fej, Ma (a Ma lap
// kocsi-kártyája), a hét (a Tervezés sora listaként), kihasználtság,
// telemetria. Szerver-komponens; minden blokk magában kezeli, ha az adata
// most nem elérhető.

const ALLAPOT_PONT = {
  mint: "bg-[var(--f2-mint)]",
  amber: "bg-[var(--f2-amb)]",
  red: "bg-[var(--f2-red)]",
  normal: "bg-foreground/40",
} as const;

const szam = (n: number, tizedes = 0) =>
  new Intl.NumberFormat("hu-HU", { minimumFractionDigits: tizedes, maximumFractionDigits: tizedes }).format(n);

function napCimke(nap: string): string {
  const d = new Date(`${nap}T12:00:00Z`);
  const het = new Intl.DateTimeFormat("hu-HU", { weekday: "short", timeZone: "UTC" }).format(d);
  return `${het} ${formatNap(nap)}`;
}

function Doboz({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-foreground/10 bg-card ${className}`}>{children}</section>;
}

function SzakaszCim({ children, jobbra }: { children: React.ReactNode; jobbra?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {jobbra}
    </div>
  );
}

function NemElerheto() {
  return <div className="text-xs text-muted-foreground">most nem elérhető</div>;
}

function Fej({ adat }: { adat: KocsiLap }) {
  const k = adat.maBlokk?.kocsi ?? null;
  const sofor = k?.sofor ?? adat.het?.sofor ?? null;
  const rendszam = [adat.jarmu.vontato, adat.jarmu.potkocsi].filter(Boolean).join(" / ") || adat.jarmu.cimke;
  const tachoFriss = k?.hetiForras === "tacho" && k.hetiSor ? k.hetiSor : adat.het?.tacho ?? null;
  const gpsHet = !tachoFriss && k?.hetiSor ? k.hetiSor : null;
  return (
    <Doboz className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-lg font-bold">{sofor ?? (adat.maBlokk ? "nincs sofőr" : adat.jarmu.kod)}</span>
        <span className="text-sm text-muted-foreground">{rendszam}</span>
      </div>
      {adat.maBlokk === null ? (
        <div className="text-xs text-muted-foreground">Állapot és hely most nem elérhető</div>
      ) : k?.helykitolto ? (
        <div className="text-sm text-muted-foreground">{k.helykitolto}</div>
      ) : (
        <>
          {k?.allapot ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span className={`size-2 shrink-0 rounded-full ${ALLAPOT_PONT[k.allapot.szin]}`} />
              <span className={k.allapot.szin === "amber" ? "font-semibold text-[var(--f2-amb)]" : "font-semibold"}>{k.allapot.szoveg}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Nincs GPS-állapot</div>
          )}
          {k?.allapot?.hely ? <div className="break-words text-xs text-muted-foreground">{k.allapot.hely}</div> : null}
        </>
      )}
      {tachoFriss ? (
        <div className="text-xs font-medium" title={k?.tacho?.reszletek}>
          {tachoFriss} <ForrasJel forras="teny" cimke="tachó" title={`Ecofleet tachográf-adat${k?.tacho?.reszletek ? `\n${k.tacho.reszletek}` : ""}`} />
        </div>
      ) : gpsHet ? (
        <div className="text-xs text-muted-foreground">
          {gpsHet} <ForrasJel forras="becsles" cimke="GPS-becslés" title="GPS-ből számolt becslés, nem tachográf" />
        </div>
      ) : null}
    </Doboz>
  );
}

function MaBlokk({ adat }: { adat: KocsiLap }) {
  if (!adat.maBlokk) {
    return (
      <Doboz className="flex flex-col gap-2 p-4">
        <SzakaszCim>Ma</SzakaszCim>
        <NemElerheto />
      </Doboz>
    );
  }
  if (!adat.maBlokk.kocsi) {
    return (
      <Doboz className="flex flex-col gap-2 p-4">
        <SzakaszCim>Ma</SzakaszCim>
        <div className="text-sm text-muted-foreground">Ez a kocsi nem szerepel a Ma lapon.</div>
      </Doboz>
    );
  }
  return <KocsiOszlop k={adat.maBlokk.kocsi} holnapCimke={adat.maBlokk.holnapCimke} piheno={pihenoNapE(adat.ma)} />;
}

function ResSor({ r }: { r: Res }) {
  return (
    <Link
      href={`/fuvarozas2/tervezes?res=${encodeURIComponent(r.kulcs)}#res`}
      className="block rounded-lg border border-dashed border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/60 px-2 py-1 text-xs hover:bg-[var(--f2-amb-l)]"
    >
      <span className="text-[#5a3806]">{r.honnan} → {r.haza ? "haza" : r.hova}</span>
      <span className="font-semibold text-[var(--f2-amb)]"> · {szam(r.km)} km üres</span>
    </Link>
  );
}

function NapSor({ c, ma }: { c: NapCella; ma: string }) {
  const elotte = c.resek.filter((r) => !r.haza && !c.fuvarok.some((f) => f.id === r.elott));
  const haza = c.resek.filter((r) => r.haza);
  return (
    <div className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-t border-foreground/10 py-2 first:border-t-0", c.nap === ma && "-mx-2 rounded-lg border-t-0 bg-muted/40 px-2")}>
      <div className={cn("pt-1 text-xs tabular-nums", c.nap === ma ? "font-semibold" : "text-muted-foreground")}>{napCimke(c.nap)}</div>
      <div className="flex min-w-0 flex-col gap-1">
        {elotte.map((r) => <ResSor key={r.kulcs} r={r} />)}
        {c.fuvarok.map((f) => (
          <Fragment key={f.id}>
            {c.resek.filter((r) => !r.haza && r.elott === f.id).map((r) => <ResSor key={r.kulcs} r={r} />)}
            <Link
              href={`/fuvarozas2/megbizasok?reszlet=${f.id}`}
              className={cn(
                "block rounded-lg px-2 py-1 text-xs",
                f.sajat ? "bg-muted text-foreground/80" : "bg-primary/10 text-primary",
                fuvarJel(f.allapot) === "kesz" && "opacity-55"
              )}
            >
              <div className="truncate font-semibold">
                {fuvarJel(f.allapot) === "kesz" ? "✓ " : fuvarJel(f.allapot) === "uton" ? <span className="mr-1 inline-block size-1.5 rounded-full bg-current align-middle" title="úton" /> : null}
                {f.cim}
              </div>
              <div className="truncate">{f.felVaros} → {f.leVaros}</div>
            </Link>
          </Fragment>
        ))}
        {haza.map((r) => <ResSor key={r.kulcs} r={r} />)}
        {c.szabad ? <div className="px-2 py-1 text-xs text-muted-foreground/70">szabad</div> : null}
        {!c.szabad && c.fuvarok.length === 0 && c.resek.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground/70">—</div> : null}
      </div>
    </div>
  );
}

function HetBlokk({ adat }: { adat: KocsiLap }) {
  const h = adat.het;
  return (
    <Doboz className="flex flex-col gap-2 p-4">
      <SzakaszCim jobbra={<Link href="/fuvarozas2/tervezes" className="text-xs font-semibold text-primary hover:underline">Teljes hét →</Link>}>
        A hét
      </SzakaszCim>
      {!h ? (
        <NemElerheto />
      ) : !h.cellak ? (
        <div className="text-sm text-muted-foreground">Ez a kocsi nincs a heti tervben.</div>
      ) : (
        <div className="flex flex-col">
          {h.cellak.map((c) => <NapSor key={c.nap} c={c} ma={h.ma} />)}
        </div>
      )}
    </Doboz>
  );
}

function Mutato({ cimke, ertek, szin, title }: { cimke: string; ertek: string; szin?: "amber" | "red"; title?: string }) {
  const szinOszt = szin === "red" ? "text-[var(--f2-red)]" : szin === "amber" ? "text-[var(--f2-amb)]" : "text-foreground";
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className="truncate text-[11px] text-muted-foreground">{cimke}</span>
      <b className={`text-sm font-semibold tabular-nums ${szinOszt}`}>{ertek}</b>
    </div>
  );
}

function KihasznaltsagOszlop({ cim, s }: { cim: string; s: KihasznaltsagSor }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-xs font-semibold">{cim}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Mutato cimke="Bevétel / nap" ertek={formatFt(s.bevetelPerNap)} title={`Bér: ${formatFt(s.berBevetelFt)} + saját fuvar belső díja: ${formatFt(s.sajatBevetelFt)} (${szam(s.sajatRakottKm)} rakott km)`} />
        <Mutato cimke="Fedezet / nap" ertek={formatFt(s.fedezetPerNap)} szin={s.fedezetPerNap != null && s.fedezetPerNap < 0 ? "red" : undefined} />
        <Mutato
          cimke="Üres km"
          ertek={s.uresKmSzazalek != null ? `${szam(s.uresKmSzazalek, 1)} %` : "—"}
          szin={s.uresKmSzazalek != null && s.uresKmSzazalek > 30 ? "amber" : undefined}
          title={`${szam(s.uresKm)} km üres, ${szam(s.rakottKm)} km rakott`}
        />
        <Mutato
          cimke="Fizetős napok"
          ertek={s.munkanapok > 0 ? `${s.fizetosNapok}/${s.munkanapok}` : "—"}
          title={`${s.fizetosNapok} nap bérfuvarral, ${s.sajatNapok} csak saját fuvarral, ${s.munkanapok} munkanap`}
        />
      </div>
    </div>
  );
}

function KihasznaltsagBlokk({ adat }: { adat: KocsiLap }) {
  const k = adat.kihasznaltsag;
  return (
    <Doboz className="flex flex-col gap-2 p-4">
      <SzakaszCim>Kihasználtság</SzakaszCim>
      {!k ? (
        <NemElerheto />
      ) : !k.kocsi ? (
        <div className="text-sm text-muted-foreground">Ehhez a kocsihoz nincs kihasználtsági adat.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <KihasznaltsagOszlop cim={k.het.cim} s={k.kocsi.het} />
          <KihasznaltsagOszlop cim={k.honap.cim} s={k.kocsi.honap} />
        </div>
      )}
    </Doboz>
  );
}

function TelemetriaBlokk({ adat }: { adat: KocsiLap }) {
  const t = adat.telemetria;
  const szerviz = t ? [...t].reverse().find((s) => s.szervizHatraKm != null && s.szervizHatraKm > 0 && s.szervizMegbizhato) ?? null : null; // 0 / bizonytalan érték nem jelenik meg
  return (
    <Doboz className="flex flex-col gap-2 p-4">
      <SzakaszCim>Telemetria · elmúlt 7 nap</SzakaszCim>
      {!t ? (
        <NemElerheto />
      ) : t.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nincs CAN-adat erre az időszakra.</div>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="py-1 text-left font-medium">Nap</th>
              <th className="py-1 text-right font-medium">km</th>
              <th className="py-1 text-right font-medium">liter</th>
              <th className="py-1 text-right font-medium">l/100</th>
            </tr>
          </thead>
          <tbody>
            {t.map((s) => (
              <tr key={s.nap} className={cn("border-t border-foreground/10", s.nap === adat.ma && "font-semibold")}>
                <td className="py-1">{napCimke(s.nap)}</td>
                <td className="py-1 text-right">{s.kmCan != null ? szam(s.kmCan) : "—"}</td>
                <td className="py-1 text-right">{s.literCan != null ? szam(s.literCan) : "—"}</td>
                <td className="py-1 text-right">{s.l100 != null ? szam(s.l100, 1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {szerviz?.szervizHatraKm != null ? (
        <div className="text-xs text-muted-foreground">
          Szervizig: <b className={cn("tabular-nums", szerviz.szervizHatraKm < 2000 ? "text-[var(--f2-amb)]" : "text-foreground")}>{szam(szerviz.szervizHatraKm)} km</b>
          {" "}({formatNap(szerviz.nap)}{szerviz.szervizMegbizhato ? "" : ", bizonytalan"})
        </div>
      ) : null}
    </Doboz>
  );
}

export function KocsiLapNezet({ adat }: { adat: KocsiLap }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Link href="/fuvarozas2" className="self-start text-sm text-muted-foreground hover:text-foreground hover:underline">← Kocsik</Link>
      {/* A mai kártya fejében ugyanez van — külön fej csak, ha a mai kártya nincs meg. */}
      {adat.maBlokk?.kocsi ? null : <Fej adat={adat} />}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <MaBlokk adat={adat} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <HetBlokk adat={adat} />
          <KihasznaltsagBlokk adat={adat} />
          <TelemetriaBlokk adat={adat} />
        </div>
      </div>
    </div>
  );
}
