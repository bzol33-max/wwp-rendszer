"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getIdovonalak, type JarmuIdovonalEredmeny } from "@/lib/fuvarozas/actions";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import type { IdovonalSzakasz } from "@/lib/fuvarozas/idovonal";

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

function IdovonalCsik({ jarmu, eredmeny }: { jarmu: (typeof SAJAT_JARMUVEK)[number]; eredmeny: JarmuIdovonalEredmeny | undefined }) {
  const szakaszok = eredmeny?.szakaszok;
  const hiba = eredmeny?.hiba;
  const figyelmezetesek = eredmeny?.figyelmezetesek ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
          {jarmu.sofor} — {jarmu.label}
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

      {jarmu.ecofleetObjectId === null ? (
        <div className="h-6 w-full rounded bg-muted" />
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
                  title={`Vezetés ${formatIdo(sz.kezdet)}–${formatIdo(sz.veg)} (${sz.tavKm.toFixed(0)} km, ${formatIdotartam(sz.idotartamSec)})\n${sz.honnan ?? "?"} → ${sz.hova ?? "?"}`}
                  className={`absolute top-0 h-full ${SZIN_BAR[jarmu.szin]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            }
            return (
              <span
                key={i}
                title={`Állás ${formatIdo(sz.kezdet)}–${formatIdo(sz.veg)} (${formatIdotartam(sz.idotartamSec)})\n${sz.cim ?? "ismeretlen hely"}${
                  sz.kategoria === "rakodas" ? "\n(valószínűleg rakodás/ügyintézés)" : sz.kategoria === "piheno" ? "\n(pihenő)" : ""
                }`}
                className={`absolute top-0 h-full ${AllasStilus(sz.kategoria)}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            );
          })}
        </div>
      )}

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
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getIdovonalak();
    setAdatok(res);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Mai idővonal (vezetés / állás)</CardTitle>
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
              <IdovonalCsik key={jarmu.sofor} jarmu={jarmu} eredmeny={adatok.find((a) => a.sofor === jarmu.sofor)} />
            ))}
            <p className="text-[11px] text-muted-foreground">
              A narancssárga szakaszok valószínű rakodást/ügyintézést, a szürke szakaszok pihenőt vagy rövid megállást jelölnek — időtartam alapú
              becslés, a tényleges okot érdemes ellenőrizni. Az AETR-figyelmeztetések a napi vezetési/pihenő szabályok egyszerűsített ellenőrzéséből
              származnak, jogi teljeskörűséget nem helyettesítenek.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
