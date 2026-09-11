"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import {
  getIdovonalak,
  getKovetkezoNapokElonezet,
  type JarmuIdovonalEredmeny,
  type KovetkezoNap,
  type MegalloBejegyzes,
} from "@/lib/fuvarozas/actions";
import { setFuvarTeljesitve } from "@/lib/fuvarozas/megbizasok";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import type { FuvarTipus } from "@/lib/fuvarozas/fuvar-constants";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

// Egy csempe = egy saját jármű: fent egy kompakt, a jármű színével
// kiemelt infó-doboz (jelenlegi hely, sebesség, utolsó adat, óraállás),
// alatta az aznapi (Bér fuvarok ÉS Saját fuvarok fülről egyaránt) tervezett
// fel-/lerakó pontok listája, csak városnévvel, időrendben — a jármű
// színével kiemelt kamion-ikon jelzi, hol tart most a listában (a
// legutóbb elhagyott pont alatt, a következő fölött), mellette a
// következő pontra becsült élő érkezés. A következő naptári napra csúszott
// pontok külön kis csemp[é]n jelennek meg alul.

const SZIN_DOBOZ: Record<JarmuSzin, string> = {
  blue: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40",
  yellow: "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40",
  green: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
};

const SZIN_KAMION: Record<JarmuSzin, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  yellow: "text-yellow-700 dark:text-yellow-500",
  green: "text-green-700 dark:text-green-500",
};

// FIGYELEM: fordított UI-címkézés (történelmi okokból, lásd megbizasok.ts):
// a DB tipus='sajat' sorok a "Bér fuvarok" fülön jelennek meg, tipus='ber' a "Saját fuvarok" fülön.
const FUVAR_TIPUS_CIMKE: Record<FuvarTipus, string> = {
  sajat: "Bér fuvar",
  ber: "Saját fuvar",
};

const FUVAR_TIPUS_BADGE: Record<FuvarTipus, string> = {
  sajat: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  ber: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
};

function formatIdo(d: Date): string {
  return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

/** Egy "YYYY-MM-DD" naptári naphoz `delta` nappal odébbi nap — dél (UTC) horgonnyal, hogy DST-váltás körül se csúszhasson el. */
function napEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatNapCim(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" });
}

function formatNapRovid(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function JarmuInfoDoboz({
  jarmu,
  eredmeny,
  maiNap,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
}) {
  const pos = eredmeny?.eloPozicio;
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${SZIN_DOBOZ[jarmu.szin]}`}>
      <div className="flex items-center gap-1.5 font-medium">
        <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        {jarmu.sofor} <span className="font-normal text-muted-foreground">{jarmu.label}</span>
      </div>
      {!maiNap ? (
        <span className="text-muted-foreground">Élő pozíció csak a mai napon.</span>
      ) : jarmu.ecofleetObjectId === null ? (
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

function KovetkezoNapokDoboz({ napok }: { napok: KovetkezoNap[] }) {
  const nemUresek = napok.filter((n) => n.megallok.length > 0);
  if (nemUresek.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-2">
      <span className="text-[10px] font-medium text-muted-foreground">Következő napok</span>
      {nemUresek.map((n) => (
        <div key={n.napISO} className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium">{formatNapRovid(n.napISO)}</span>
          {n.megallok.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 pl-2 text-[11px]">
              <span className="w-9 shrink-0 text-muted-foreground">{m.tipus === "felrako" ? "Fel:" : "Le:"}</span>
              <span className="truncate">{m.cim}</span>
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${FUVAR_TIPUS_BADGE[m.fuvarTipus]}`}>
                {FUVAR_TIPUS_CIMKE[m.fuvarTipus]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function KamionSor({ jarmu, eta }: { jarmu: (typeof SAJAT_JARMUVEK)[number]; eta: Date }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] font-medium">
      <Truck className={`h-3.5 w-3.5 shrink-0 ${SZIN_KAMION[jarmu.szin]}`} />
      <span className={SZIN_KAMION[jarmu.szin]}>Becsült érkezés: {formatIdo(eta)}</span>
    </div>
  );
}

function MegalloSor({
  b,
  aktiv,
  onKeszJelolve,
}: {
  b: MegalloBejegyzes;
  /** Igaz, ha ez a fuvar van éppen folyamatban (a kamion-ikon a hozzá tartozó ponthoz áll legközelebb). */
  aktiv: boolean;
  onKeszJelolve: () => void;
}) {
  const [folyamatban, setFolyamatban] = useState(false);

  async function handleKesz() {
    setFolyamatban(true);
    try {
      await setFuvarTeljesitve(b.fuvarId, true);
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
      className={`flex flex-col gap-0.5 rounded px-1.5 py-1 text-[11px] ${
        b.elhagyva ? "bg-success/10" : aktiv ? "bg-primary/10" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="w-9 shrink-0 text-muted-foreground">{b.tipus === "felrako" ? "Fel:" : "Le:"}</span>
          <span className="truncate font-medium">{b.cim}</span>
          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${FUVAR_TIPUS_BADGE[b.fuvarTipus]}`}>
            {FUVAR_TIPUS_CIMKE[b.fuvarTipus]}
          </span>
          {aktiv && !b.elhagyva && (
            <span className="shrink-0 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-medium text-primary">Folyamatban</span>
          )}
          <span className="shrink-0 text-muted-foreground">{formatIdo(b.idopont)}</span>
        </span>
        {b.tipus === "lerako" && (
          <button
            type="button"
            disabled={folyamatban || b.elhagyva}
            onClick={handleKesz}
            title={b.elhagyva ? "Készre jelölve" : "Kattintás: megjelölés készre"}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              b.elhagyva
                ? "border-success bg-success text-success-foreground"
                : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success disabled:cursor-wait"
            }`}
          >
            <Check className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      <span className="pl-11 text-muted-foreground">
        {b.megrendelo ?? "Megbízó ismeretlen"}
        {b.pozicioszam ? ` · ${b.pozicioszam}` : ""}
      </span>
    </div>
  );
}

function JarmuCsempe({
  jarmu,
  eredmeny,
  maiNap,
  kovetkezoNapok,
  onKeszJelolve,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
  kovetkezoNapok: KovetkezoNap[];
  onKeszJelolve: () => void;
}) {
  const maiMegallok = eredmeny?.maiMegallok ?? [];
  const holnapiMegallok = eredmeny?.holnapiMegallok ?? [];
  const eloEta = eredmeny?.eloEta;
  // A kamion-ikon az utolsó elhagyott és az első még el nem hagyott pont közé kerül.
  const kovetkezoIdx = maiMegallok.findIndex((b) => !b.elhagyva);
  // "Folyamatban" jelölést az kap, amelyik fuvarhoz a következő (még el nem hagyott) pont tartozik.
  const aktivFuvarId = kovetkezoIdx >= 0 ? maiMegallok[kovetkezoIdx].fuvarId : null;

  return (
    <div className="flex flex-col gap-3">
      <JarmuInfoDoboz jarmu={jarmu} eredmeny={eredmeny} maiNap={maiNap} />

      {maiMegallok.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nincs megbízás ezen a napon.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {maiNap && kovetkezoIdx === 0 && eloEta && <KamionSor jarmu={jarmu} eta={eloEta.erkezes} />}
          {maiMegallok.map((b, i) => (
            <div key={`${b.fuvarId}-${b.tipus}-${i}`}>
              <MegalloSor b={b} aktiv={maiNap && b.fuvarId === aktivFuvarId} onKeszJelolve={onKeszJelolve} />
              {maiNap && i === kovetkezoIdx - 1 && eloEta && <KamionSor jarmu={jarmu} eta={eloEta.erkezes} />}
            </div>
          ))}
        </div>
      )}

      {holnapiMegallok.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-lg border border-dashed p-2">
          <span className="text-[10px] font-medium text-muted-foreground">Következő napra átcsúszva</span>
          {holnapiMegallok.map((b, i) => (
            <MegalloSor key={`${b.fuvarId}-${b.tipus}-${i}`} b={b} aktiv={false} onKeszJelolve={onKeszJelolve} />
          ))}
        </div>
      )}

      {maiNap && <KovetkezoNapokDoboz napok={kovetkezoNapok} />}
    </div>
  );
}

export function GpsStatus() {
  const maiNapISO = budapestNapISO();
  const [napISO, setNapISO] = useState(maiNapISO);
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [kovetkezoNapok, setKovetkezoNapok] = useState<Record<string, KovetkezoNap[]>>({});
  const [loading, setLoading] = useState(true);
  const maiNap = napISO === maiNapISO;

  const load = useCallback(async (nap: string) => {
    const res = await getIdovonalak(nap);
    setAdatok(res);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(napISO).finally(() => setLoading(false));
    // A múltbeli (lezárt) napok adata nem változik — csak a mai napi nézetet frissítjük periodikusan.
    if (napISO !== budapestNapISO()) return;
    const interval = setInterval(() => load(napISO), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load, napISO]);

  useEffect(() => {
    getKovetkezoNapokElonezet(3).then(setKovetkezoNapok);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Járművek — {formatNapCim(napISO)}
            {maiNap && " (ma)"}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" title="Előző nap" onClick={() => setNapISO((n) => napEltolva(n, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="outline" title="Következő nap" disabled={maiNap} onClick={() => setNapISO((n) => napEltolva(n, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
                maiNap={maiNap}
                kovetkezoNapok={kovetkezoNapok[jarmu.sofor] ?? []}
                onKeszJelolve={() => load(napISO)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
