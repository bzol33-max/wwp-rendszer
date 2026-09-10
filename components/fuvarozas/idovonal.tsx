"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getIdovonalak, type JarmuIdovonalEredmeny } from "@/lib/fuvarozas/actions";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import type { IdovonalSzakasz, TervezettFuvarSzakasz } from "@/lib/fuvarozas/idovonal";

// 3 vízszintes idővonal-csík (egy-egy saját jármű, a kártyáin is használt
// színében) a GPS-pozíció kártyák alatt. Minden csík a mai naptári napot
// (00:00–24:00, Európa/Budapest) mutatja: apró pont az induláskor, tömör
// szín-szakasz vezetés közben, világosabb/csíkozott szakasz álláskor
// (rakodás/pihenő becsléssel), és AETR-figyelmeztetések a csík alatt.

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

const SZIN_TERVEZETT_BORDER: Record<JarmuSzin, string> = {
  blue: "border-blue-500",
  yellow: "border-yellow-600",
  green: "border-green-600",
};

const NAP_KEZDETE_PERC = 0;
const NAP_VEGE_PERC = 24 * 60;

function percTolNapkezdettol(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function pctFromMinutes(min: number): number {
  return Math.max(0, Math.min(100, ((min - NAP_KEZDETE_PERC) / (NAP_VEGE_PERC - NAP_KEZDETE_PERC)) * 100));
}

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

function TervezettFuvarSav({ jarmu, tervezettFuvarok }: { jarmu: (typeof SAJAT_JARMUVEK)[number]; tervezettFuvarok: TervezettFuvarSzakasz[] }) {
  if (tervezettFuvarok.length === 0) return null;
  return (
    <div className="relative h-4 w-full">
      {tervezettFuvarok.map((f) => {
        const left = pctFromMinutes(percTolNapkezdettol(f.kezdet));
        const right = pctFromMinutes(percTolNapkezdettol(f.veg));
        const width = Math.max(0.5, right - left);
        const bizonytalan = f.idoBizonytalan || f.utvonalBizonytalan;
        return (
          <span
            key={f.id}
            title={`${f.megrendelo ?? "Megbízás"}${f.pozicioszam ? ` (${f.pozicioszam})` : ""}\n${f.honnan ?? "?"} → ${f.hova}\nBecsült: ${formatIdo(
              f.kezdet
            )}–${formatIdo(f.veg)}${bizonytalan ? "\n(becslés — " + (f.idoBizonytalan ? "nincs megadott időpont" : "") + (f.idoBizonytalan && f.utvonalBizonytalan ? ", " : "") + (f.utvonalBizonytalan ? "átalány menetidő" : "") + ")" : ""}${
              f.tullepiAKeretet
                ? "\n⚠️ A jelenlegi tempó mellett ez a fuvar túlnyúlik a megengedett napi vezetési időn."
                : ""
            }`}
            className={`absolute top-0 h-full rounded-sm bg-white/70 dark:bg-black/30 ${
              f.tullepiAKeretet ? "border-destructive" : SZIN_TERVEZETT_BORDER[jarmu.szin]
            }`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              borderWidth: f.tullepiAKeretet ? 2 : 1.5,
              borderStyle: bizonytalan ? "dashed" : "solid",
            }}
          />
        );
      })}
    </div>
  );
}

/** Igaz, ha egy időpont a kliens mai naptári napjára esik — a korlát-jelölők csak ekkor helyezhetők el értelmesen a 00–24 órás csíkon. */
function maiNapon(d: Date): boolean {
  return d.toDateString() === new Date().toDateString();
}

function IdovonalCsik({
  jarmu,
  eredmeny,
  mostPct,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  /** A "most" függőleges vonal vízszintes pozíciója (%), vagy null, ha nem a mai nap nézete (nincs mit mutatni). */
  mostPct: number | null;
}) {
  const szakaszok = eredmeny?.szakaszok;
  const hiba = eredmeny?.hiba;
  const figyelmezetesek = eredmeny?.figyelmezetesek ?? [];
  const tervezettFuvarok = eredmeny?.tervezettFuvarok ?? [];
  const koltsegvetes = eredmeny?.koltsegvetes;
  const eloEta = eredmeny?.eloEta;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
          {jarmu.sofor} — {jarmu.label}
          {eloEta && (
            <span
              className="font-normal text-muted-foreground"
              title={`Élő GPS-pozícióból becsülve, a jelenlegi forgalommal/tempóval — a tényleges érkezés eltérhet.`}
            >
              · becsült érkezés ({eloEta.cel}): {formatIdo(eloEta.erkezes)}
            </span>
          )}
        </span>
        {figyelmezetesek.length > 0 && (
          <span className="flex gap-1">
            {figyelmezetesek.some((f) => f.sulyossag === "hiba") && (
              <Badge variant="destructive" className="text-[10px]">
                {figyelmezetesek.filter((f) => f.sulyossag === "hiba").length} AETR hiba
              </Badge>
            )}
            {figyelmezetesek.some((f) => f.sulyossag === "figyelmeztetes") && (
              <Badge variant="secondary" className="text-[10px]">
                {figyelmezetesek.filter((f) => f.sulyossag === "figyelmeztetes").length} figyelmeztetés
              </Badge>
            )}
          </span>
        )}
      </div>

      <div className="relative">
        {jarmu.ecofleetObjectId === null ? (
          <div className="flex h-6 w-full items-center rounded bg-muted px-2 text-[11px] text-muted-foreground">Nincs GPS-adat.</div>
        ) : hiba ? (
          <div className="flex h-6 w-full items-center rounded bg-muted px-2 text-[11px] text-destructive">{hiba}</div>
        ) : !szakaszok || szakaszok.length === 0 ? (
          <div className="flex h-6 w-full items-center rounded bg-muted px-2 text-[11px] text-muted-foreground">Ma még nem indult el.</div>
        ) : (
          <div className="relative h-6 w-full overflow-hidden rounded bg-muted">
            {szakaszok.map((sz, i) => {
              if (sz.tipus === "indulas") {
                const left = pctFromMinutes(percTolNapkezdettol(sz.idopont));
                return (
                  <span
                    key={i}
                    title={`Indulás ${formatIdo(sz.idopont)} — ${sz.cim ?? "ismeretlen hely"}`}
                    className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ${SZIN_DOT_RING[jarmu.szin]}`}
                    style={{ left: `${left}%` }}
                  />
                );
              }
              const left = pctFromMinutes(percTolNapkezdettol(sz.kezdet));
              const right = pctFromMinutes(percTolNapkezdettol(sz.veg));
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
          </div>
        )}

        <TervezettFuvarSav jarmu={jarmu} tervezettFuvarok={tervezettFuvarok} />

        {mostPct != null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-30 w-px bg-foreground/70"
            title={`Most — ${formatIdo(new Date())}`}
            style={{ left: `${mostPct}%` }}
          />
        )}
        {koltsegvetes?.kotelezoMegallasIdo && maiNapon(koltsegvetes.kotelezoMegallasIdo) && (
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px border-l border-dashed border-amber-500"
            title={`Kötelező megállás legkésőbb: ${formatIdo(koltsegvetes.kotelezoMegallasIdo)} (4,5 órás folyamatos vezetési korlát)`}
            style={{ left: `${pctFromMinutes(percTolNapkezdettol(koltsegvetes.kotelezoMegallasIdo))}%` }}
          />
        )}
        {koltsegvetes?.napiVezetesVegeIdo && maiNapon(koltsegvetes.napiVezetesVegeIdo) && (
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px border-l border-dashed border-destructive"
            title={`Napi vezetés vége legkésőbb: ${formatIdo(koltsegvetes.napiVezetesVegeIdo)} (napi ${(koltsegvetes.napiVezetesKeretSec / 3600).toFixed(0)} órás keret)`}
            style={{ left: `${pctFromMinutes(percTolNapkezdettol(koltsegvetes.napiVezetesVegeIdo))}%` }}
          />
        )}
      </div>

      {figyelmezetesek.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-1 text-[11px] text-muted-foreground">
          {figyelmezetesek.map((f, i) => (
            <li key={i} className={f.sulyossag === "hiba" ? "text-destructive" : undefined}>
              {f.sulyossag === "hiba" ? "⚠️ " : f.sulyossag === "figyelmeztetes" ? "⚠️ " : "💡 "}
              {f.uzenet}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JarmuIdovonalak() {
  const maiNapISO = budapestNapISO();
  const [napISO, setNapISO] = useState(maiNapISO);
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [loading, setLoading] = useState(true);
  const maiNap = napISO === maiNapISO;
  const [mostPct, setMostPct] = useState(() => pctFromMinutes(percTolNapkezdettol(new Date())));

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

  // A "most" függőleges vonal percenként frissül, csak a mai nap nézetén.
  useEffect(() => {
    if (!maiNap) return;
    const interval = setInterval(() => setMostPct(pctFromMinutes(percTolNapkezdettol(new Date()))), 60 * 1000);
    return () => clearInterval(interval);
  }, [maiNap]);

  const hetiFigyelmezetesek = adatok.flatMap((a) =>
    a.hetiFigyelmezetesek.map((f) => ({ ...f, sofor: a.sofor }))
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Idővonal (vezetés / állás) — {formatNapCim(napISO)}
            {maiNap && " (ma)"}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              title="Előző nap"
              onClick={() => setNapISO((n) => napEltolva(n, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              title="Következő nap"
              disabled={maiNap}
              onClick={() => setNapISO((n) => napEltolva(n, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && adatok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
              {["00", "04", "08", "12", "16", "20", "24"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            {SAJAT_JARMUVEK.map((jarmu) => (
              <IdovonalCsik
                key={jarmu.sofor}
                jarmu={jarmu}
                eredmeny={adatok.find((a) => a.sofor === jarmu.sofor)}
                mostPct={maiNap ? mostPct : null}
              />
            ))}
            {hetiFigyelmezetesek.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed p-2">
                <span className="text-xs font-medium text-muted-foreground">Heti AETR (hétfőtől eddig a napig)</span>
                <ul className="flex flex-col gap-0.5 pl-1 text-[11px] text-muted-foreground">
                  {hetiFigyelmezetesek.map((f, i) => (
                    <li key={i} className={f.sulyossag === "hiba" ? "text-destructive" : undefined}>
                      ⚠️ {f.sofor}: {f.uzenet}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              A narancssárga szakaszok valószínű rakodást/ügyintézést, a szürke szakaszok pihenőt vagy rövid megállást jelölnek — időtartam alapú
              becslés, a tényleges okot érdemes ellenőrizni. A vastag sáv alatti szaggatott/keretes téglalapok a mai saját megbízások becsült
              időpontjai (időpont + felrakó/lerakó cím + útvonal-menetidő + rakodási/lerakodási puffer alapján) — szaggatott keret jelzi, ha nincs
              megadva pontos időpont vagy nem sikerült az útvonalat kiszámolni, ilyenkor csak durva becslés. Az AETR-figyelmeztetések a napi
              vezetési/pihenő szabályok egyszerűsített ellenőrzéséből származnak, jogi teljeskörűséget nem helyettesítenek.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
