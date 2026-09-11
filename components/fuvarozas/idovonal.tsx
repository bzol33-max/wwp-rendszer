"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { getIdovonalak, type JarmuIdovonalEredmeny } from "@/lib/fuvarozas/actions";
import { setFuvarTeljesitve } from "@/lib/fuvarozas/megbizasok";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import type { IdovonalSzakasz, TervezettFuvarSzakasz, TervezettMegallo } from "@/lib/fuvarozas/idovonal";

// Egy csempe = egy saját jármű: fent egy kompakt, a jármű színével
// kiemelt infó-doboz (jelenlegi hely, sebesség, utolsó adat, óraállás),
// alatta az aznapi saját megbízások időrendben, egy vízszintes idővonalon.
// Az idővonal 0 pontja NEM éjfél, hanem amikor a jármű ténylegesen elindult
// (motor be + mozgás) — nincs AETR-szabály, csak egy fix, tájékoztató
// jellegű maximális munkanap-hossz szabja meg a csík végét.

const SZIN_BAR: Record<JarmuSzin, string> = {
  blue: "bg-blue-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
};

const SZIN_DOT_RING: Record<JarmuSzin, string> = {
  blue: "ring-blue-300",
  yellow: "ring-yellow-300",
  green: "ring-green-300",
};

const SZIN_DOBOZ: Record<JarmuSzin, string> = {
  blue: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40",
  yellow: "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40",
  green: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
};

/** A csík ennyi órát ölel fel az indulástól — tisztán megjelenítési korlát, nem jogi szabály. */
const MAX_MUNKANAP_ORA = 15;

function percTolIndulastol(d: Date, indulas: Date): number {
  return (d.getTime() - indulas.getTime()) / 60000;
}

function pctFromMinutes(min: number): number {
  return Math.max(0, Math.min(100, (min / (MAX_MUNKANAP_ORA * 60)) * 100));
}

function formatIdo(d: Date): string {
  return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function formatIdotartam(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} perc`;
  if (m === 0) return `${h} óra`;
  return `${h} óra ${m} perc`;
}

function AllasStilus(kategoria: Extract<IdovonalSzakasz, { tipus: "allas" }>["kategoria"]): string {
  switch (kategoria) {
    case "piheno":
      return "bg-neutral-300 dark:bg-neutral-600";
    case "rakodas":
      return "bg-orange-200 dark:bg-orange-900/50 border border-orange-400";
    default:
      return "bg-neutral-200 dark:bg-neutral-700";
  }
}

/** Egy fuvar minden megállója "elhagyva" (kész), és van legalább egy megálló — ekkor a lista-sorban zöld pipa jár. */
function fuvarKesz(f: TervezettFuvarSzakasz): boolean {
  return f.megallok.length > 0 && f.megallok.every((m) => m.elhagyva);
}

/** Egy megálló idővonalon való elhelyezéséhez: elhagyott pontnál a tényleges (GPS szerinti) idő, egyébként a tervezett/becsült. */
function megalloIdopontja(f: TervezettFuvarSzakasz, m: TervezettMegallo): Date {
  if (m.elhagyva && m.tenylegesIdo) return m.tenylegesIdo;
  return m.tipus === "felrako" ? f.kezdet : f.veg;
}

function MegalloPont({
  f,
  m,
  indulas,
}: {
  f: TervezettFuvarSzakasz;
  m: TervezettMegallo;
  indulas: Date;
}) {
  const idopont = megalloIdopontja(f, m);
  const left = pctFromMinutes(percTolIndulastol(idopont, indulas));
  const cimke = m.tipus === "felrako" ? "Felrakó" : "Lerakó";
  return (
    <span
      title={`${cimke}: ${m.cim}${f.megrendelo ? ` — ${f.megrendelo}` : ""}${f.pozicioszam ? ` (${f.pozicioszam})` : ""}\n${
        m.elhagyva ? `Elhagyva: ${formatIdo(idopont)}` : `Tervezett: ${formatIdo(idopont)}`
      }`}
      className={`absolute top-1/2 z-20 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
        m.elhagyva ? "border-success bg-success" : "border-foreground/40 bg-background"
      }`}
      style={{ left: `${left}%` }}
    />
  );
}

function MegbizasSor({
  f,
  onKeszJelolve,
}: {
  f: TervezettFuvarSzakasz;
  onKeszJelolve: () => void;
}) {
  const [folyamatban, setFolyamatban] = useState(false);
  const kesz = fuvarKesz(f);
  const bizonytalan = f.idoBizonytalan || f.utvonalBizonytalan;

  async function handleKesz() {
    setFolyamatban(true);
    try {
      await setFuvarTeljesitve(f.id, true);
      toast.success("Fuvar készre jelölve — a Bér fuvarok listán a Számla/Posta fülre került.");
      onKeszJelolve();
    } catch {
      toast.error("Nem sikerült készre jelölni a fuvart.");
    } finally {
      setFolyamatban(false);
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[11px] ${
        kesz ? "bg-success/10" : ""
      }`}
    >
      <span className={`truncate ${bizonytalan ? "italic text-muted-foreground" : ""}`} title={`${f.honnan ?? "?"} → ${f.hova}`}>
        {f.honnan ?? "?"} → {f.hova}
        <span className="ml-1.5 text-muted-foreground">
          {formatIdo(f.kezdet)}–{formatIdo(f.veg)}
        </span>
      </span>
      <button
        type="button"
        disabled={folyamatban || kesz}
        onClick={handleKesz}
        title={kesz ? "Készre jelölve" : "Kattintás: megjelölés készre"}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          kesz
            ? "border-success bg-success text-success-foreground"
            : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success disabled:cursor-wait"
        }`}
      >
        <Check className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

function JarmuInfoDoboz({
  jarmu,
  eredmeny,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
}) {
  const pos = eredmeny?.eloPozicio;
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${SZIN_DOBOZ[jarmu.szin]}`}>
      <div className="flex items-center gap-1.5 font-medium">
        <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        {jarmu.sofor} <span className="font-normal text-muted-foreground">{jarmu.label}</span>
      </div>
      {jarmu.ecofleetObjectId === null ? (
        <span className="text-muted-foreground">Nincs GPS-kapcsolat.</span>
      ) : eredmeny?.hiba ? (
        <span className="text-destructive">{eredmeny.hiba}</span>
      ) : pos ? (
        <>
          <span>{pos.cim ?? "ismeretlen hely"}</span>
          <span className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span>{pos.sebesseg} km/h</span>
            <span>·</span>
            <span>{formatIdo(pos.utolsoAdat)}</span>
            {pos.oraallasKm !== null && (
              <>
                <span>·</span>
                <span>{pos.oraallasKm.toLocaleString("hu-HU")} km</span>
              </>
            )}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">Nincs élő pozíció.</span>
      )}
    </div>
  );
}

function JarmuCsempe({
  jarmu,
  eredmeny,
  onKeszJelolve,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  onKeszJelolve: () => void;
}) {
  const szakaszok = eredmeny?.szakaszok;
  const tervezettFuvarok = eredmeny?.tervezettFuvarok ?? [];
  const napKezdete = eredmeny?.napKezdete ?? null;
  const eloEta = eredmeny?.eloEta;

  return (
    <div className="flex flex-col gap-3">
      <JarmuInfoDoboz jarmu={jarmu} eredmeny={eredmeny} />

      {eloEta && (
        <p className="text-[11px] text-muted-foreground" title="Élő GPS-pozícióból becsülve, a jelenlegi forgalommal/tempóval — a tényleges érkezés eltérhet.">
          Becsült érkezés ({eloEta.cel}): <span className="font-medium text-foreground">{formatIdo(eloEta.erkezes)}</span>
        </p>
      )}

      {jarmu.ecofleetObjectId !== null && !eredmeny?.hiba && (!napKezdete ? (
        <div className="flex h-6 w-full items-center rounded bg-muted px-2 text-[11px] text-muted-foreground">
          Ma még nem indult el.
        </div>
      ) : (
        <div className="relative h-6 w-full overflow-hidden rounded bg-muted">
          {szakaszok?.map((sz, i) => {
            if (sz.tipus === "indulas") {
              const left = pctFromMinutes(percTolIndulastol(sz.idopont, napKezdete));
              return (
                <span
                  key={i}
                  title={`Indulás ${formatIdo(sz.idopont)} — ${sz.cim ?? "ismeretlen hely"}`}
                  className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ${SZIN_DOT_RING[jarmu.szin]}`}
                  style={{ left: `${left}%` }}
                />
              );
            }
            const left = pctFromMinutes(percTolIndulastol(sz.kezdet, napKezdete));
            const right = pctFromMinutes(percTolIndulastol(sz.veg, napKezdete));
            const width = Math.max(0.3, right - left);
            if (sz.tipus === "vezetes") {
              return (
                <span
                  key={i}
                  title={`Vezetés ${formatIdo(sz.kezdet)}–${formatIdo(sz.veg)} (${sz.tavKm.toFixed(0)} km, ${formatIdotartam(sz.idotartamSec)})\n${sz.honnan ?? "?"} → ${sz.hova ?? "?"}${
                    sz.elo ? "\n(élő GPS-pozícióból becsülve — a fuvar még nem zárult le)" : ""
                  }`}
                  className={`absolute top-0 h-full ${SZIN_BAR[jarmu.szin]} ${sz.elo ? "animate-pulse opacity-80" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            }
            return (
              <span
                key={i}
                title={`Állás ${formatIdo(sz.kezdet)}–${formatIdo(sz.veg)} (${formatIdotartam(sz.idotartamSec)})\n${sz.cim ?? "ismeretlen hely"}${
                  sz.kategoria === "rakodas" ? "\n(valószínűleg rakodás/ügyintézés)" : sz.kategoria === "piheno" ? "\n(pihenő)" : ""
                }${sz.elo ? "\n(még tart — élő pozícióból meghosszabbítva)" : ""}`}
                className={`absolute top-0 h-full ${AllasStilus(sz.kategoria)} ${sz.elo ? "animate-pulse" : ""}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
          {tervezettFuvarok.flatMap((f) =>
            f.megallok
              .filter((m) => m.lat != null && m.lon != null)
              .map((m, i) => <MegalloPont key={`${f.id}-${i}`} f={f} m={m} indulas={napKezdete} />)
          )}
        </div>
      ))}

      {tervezettFuvarok.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {tervezettFuvarok.map((f) => (
            <MegbizasSor key={f.id} f={f} onKeszJelolve={onKeszJelolve} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GpsStatus() {
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getIdovonalak();
    setAdatok(res);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    const interval = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Járművek</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && adatok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {SAJAT_JARMUVEK.map((jarmu) => (
              <JarmuCsempe
                key={jarmu.sofor}
                jarmu={jarmu}
                eredmeny={adatok.find((a) => a.sofor === jarmu.sofor)}
                onKeszJelolve={load}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
