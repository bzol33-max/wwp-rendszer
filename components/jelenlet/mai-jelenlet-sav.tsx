"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DAY_TYPE_LABELS,
  dayType,
  formatDiff,
  summarizeByDay,
  todayIso,
  type JelenletEmployee,
  type JelenletSession,
} from "@/lib/jelenlet/shared";
import { getJelenletEmployees, getNapJelenletek } from "@/lib/jelenlet/actions";
import { HU_MONTHS } from "@/lib/dolgozok/shared";

const HU_NAP_ROVID = ["V", "H", "K", "Sze", "Cs", "P", "Szo"] as const;

function napFelirat(iso: string): string {
  const [ev, ho, nap] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return `${HU_MONTHS[ho - 1].slice(0, 4)}. ${nap}., ${HU_NAP_ROVID[d.getUTCDay()]}`;
}

function napEltolva(iso: string, delta: number): string {
  const [ev, ho, nap] = iso.split("-").map(Number);
  return new Date(Date.UTC(ev, ho - 1, nap + delta)).toISOString().slice(0, 10);
}

/**
 * A nyitókép vékony jelenlét-sávja: egy soron elfér mindkét dolgozó mai
 * állapota, az összes szakasza és a napi eltérése. A korábbi csempe csak
 * "Bent/Kint"-et mutatott, a tényleges időpontokért ki kellett nyitni.
 * A napváltóval korábbi napok is megnézhetők, a gomb a havi naplót nyitja.
 */
export function MaiJelenletSav({ onOpenHonap }: { onOpenHonap: () => void }) {
  const [nap, setNap] = useState(todayIso());
  const [employees, setEmployees] = useState<JelenletEmployee[]>([]);
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [emp, rows] = await Promise.all([getJelenletEmployees(), getNapJelenletek(nap)]);
    setEmployees(emp);
    setSessions(rows);
  }, [nap]);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  const ma = todayIso();

  return (
    <div className="flex flex-wrap items-stretch gap-3 rounded-xl border bg-card p-2.5">
      {loading ? (
        <p className="px-1 text-sm text-muted-foreground">Betöltés…</p>
      ) : employees.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Nincs jelenlét-aktív dolgozó.</p>
      ) : (
        employees.map((e, i) => {
          const sajat = sessions.filter((s) => s.employee_id === e.id);
          const napok = summarizeByDay(sajat);
          const napi = napok[0];
          const munkak = sajat.filter((s) => s.day_type === "munka");
          const nyitott = munkak.find((s) => s.arrival_time && !s.departure_time) ?? null;
          const tipus = dayType(sajat);
          return (
            <div
              key={e.id}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 px-1",
                i > 0 && "border-l pl-3"
              )}
            >
              <span className="shrink-0 text-sm font-semibold">{e.name}</span>
              {tipus !== "munka" ? (
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {DAY_TYPE_LABELS[tipus]}
                </span>
              ) : (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    nyitott
                      ? "border-success/40 bg-success/10 text-success"
                      : "text-muted-foreground"
                  )}
                >
                  {sajat.length === 0 ? "—" : nyitott ? "Bent" : "Kint"}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                {munkak
                  .map((s) => `${s.arrival_time ?? "?"}–${s.departure_time ?? "…"}`)
                  .join(" · ")}
              </span>
              {napi?.nyitott ? (
                <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  nyitva
                </span>
              ) : (
                napi?.diffMinutes !== null &&
                napi?.diffMinutes !== undefined && (
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold tabular-nums",
                      napi.diffMinutes < 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    {formatDiff(napi.diffMinutes)}
                  </span>
                )
              )}
            </div>
          );
        })
      )}

      <div className="flex shrink-0 items-center gap-1.5 border-l pl-3">
        <Button size="icon-xs" variant="outline" onClick={() => { setLoading(true); setNap(napEltolva(nap, -1)); }}>
          <ChevronLeft />
        </Button>
        <button
          type="button"
          onClick={() => { setLoading(true); setNap(ma); }}
          className="min-w-[92px] text-center text-xs font-semibold hover:underline"
        >
          {napFelirat(nap)}
        </button>
        <Button
          size="icon-xs"
          variant="outline"
          disabled={nap >= ma}
          onClick={() => { setLoading(true); setNap(napEltolva(nap, 1)); }}
        >
          <ChevronRight />
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenHonap}>
          Hónap hetekre bontva →
        </Button>
      </div>
    </div>
  );
}
