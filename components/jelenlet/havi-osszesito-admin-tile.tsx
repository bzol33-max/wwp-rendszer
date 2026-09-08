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
  type DaySummary,
  type JelenletEmployee,
} from "@/lib/jelenlet/shared";
import { getJelenletEmployees, getMonthJelenletek } from "@/lib/jelenlet/actions";

type EmployeeMonth = { employee: JelenletEmployee; days: DaySummary[] };

// Kompakt csempe a Jelenlét admin nézet felső sorában: dolgozónként a
// hónap eddigi összesített eltérése a napi 9 órás munkaidőhöz képest.
// Koppintásra megnyílik a napi bontás, dolgozónként.
export function HaviOsszesitoAdminTile() {
  const [months, setMonths] = useState<EmployeeMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { year, month } = currentYearMonth();

  const load = useCallback(async () => {
    const employees = await getJelenletEmployees();
    const result = await Promise.all(
      employees.map(async (employee) => ({
        employee,
        days: summarizeByDay(await getMonthJelenletek(employee.id, year, month)),
      }))
    );
    setMonths(result);
  }, [year, month]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2.5 text-center"
        >
          <span className="text-xs font-semibold">Havi összesítő</span>
          {loading ? (
            <span className="text-[11px] text-muted-foreground">Betöltés…</span>
          ) : (
            <div className="w-full space-y-0.5">
              {months.map(({ employee, days }) => {
                const total = monthlyTotalDiff(days);
                return (
                  <div key={employee.id} className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="truncate text-muted-foreground">{employee.name}</span>
                    <span className={cn("font-semibold", total < 0 ? "text-destructive" : "text-success")}>
                      {formatDiff(total)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </button>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {HU_MONTHS[month - 1]} {year}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-4 overflow-y-auto">
            {months.map(({ employee, days }) => {
              const total = monthlyTotalDiff(days);
              return (
                <div key={employee.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm font-semibold">
                    <span>{employee.name}</span>
                    <span className={cn(total < 0 ? "text-destructive" : "text-success")}>
                      {formatDiff(total)}
                    </span>
                  </div>
                  {days.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nincs még rögzített nap.</p>
                  ) : (
                    <div className="space-y-1.5">
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
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
