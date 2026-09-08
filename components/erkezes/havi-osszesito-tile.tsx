"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HU_MONTHS } from "@/lib/dolgozok/shared";
import {
  currentYearMonth,
  formatDiff,
  monthlyTotalDiff,
  summarizeByDay,
  type JelenletSession,
} from "@/lib/jelenlet/shared";
import { getMonthJelenletek } from "@/lib/jelenlet/actions";

// Kompakt csempe a mobil saját nézet felső sorában: a hónap eddigi
// összesített eltérése a napi 9 órás munkaidőhöz képest. Koppintásra
// megnyílik a napi bontás (mikor érkezett, mikor ment, napi eltérés).
export function HaviOsszesitoTile({ employeeId }: { employeeId: string }) {
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { year, month } = currentYearMonth();

  const load = useCallback(async () => {
    setSessions(await getMonthJelenletek(employeeId, year, month));
  }, [employeeId, year, month]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const days = summarizeByDay(sessions);
  const total = monthlyTotalDiff(days);

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-2.5 text-center"
        >
          <span className="text-xs font-semibold">Havi összesítő</span>
          {loading ? (
            <span className="text-[11px] text-muted-foreground">Betöltés…</span>
          ) : (
            <>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  total < 0 ? "text-destructive" : "text-success"
                )}
              >
                {formatDiff(total)}
              </span>
              <span className="text-[11px] text-muted-foreground">{HU_MONTHS[month - 1]}</span>
            </>
          )}
        </button>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {HU_MONTHS[month - 1]} {year}
            </DialogTitle>
          </DialogHeader>
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nincs még rögzített nap.</p>
          ) : (
            <div className="space-y-2">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {days.map((d) => (
                  <div key={d.date} className="rounded-md border p-2 text-xs">
                    <div className="mb-1 flex items-center justify-between font-medium">
                      <span>{d.date}</span>
                      <span
                        className={cn(
                          d.diffMinutes !== null && d.diffMinutes < 0
                            ? "text-destructive"
                            : "text-success"
                        )}
                      >
                        {formatDiff(d.diffMinutes)}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-muted-foreground">
                      {d.sessions.map((s) => (
                        <div key={s.id}>
                          {s.arrival_time ?? "—"} – {s.departure_time ?? "—"}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Összesen</span>
                <span className={cn(total < 0 ? "text-destructive" : "text-success")}>
                  {formatDiff(total)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
