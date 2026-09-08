"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dayDiffFromWorkday, formatDiff, type JelenletSession } from "@/lib/jelenlet/shared";
import { getTodayJelenletek, recordArrivalNow, recordDepartureNow } from "@/lib/jelenlet/actions";

// Kompakt csempe a mobil saját nézet felső sorában. Egy nap TÖBBSZÖR is
// használható mindkét gomb (pl. hazamegy, majd visszajön kamiont pakolni)
// — minden "Érkezés" új szakaszt nyit, a "Távozás" a legutóbb nyitva
// hagyott szakaszt zárja le (lásd lib/jelenlet/actions.ts).
export function MaiErkezesTile({ employeeId }: { employeeId: string }) {
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const rows = await getTodayJelenletek();
    setSessions(rows.filter((r) => r.employee_id === employeeId));
  }, [employeeId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  function markArrival() {
    startTransition(async () => {
      try {
        await recordArrivalNow(employeeId);
        await load();
        toast.success("Érkezés rögzítve.");
      } catch {
        toast.error("Nem sikerült rögzíteni.");
      }
    });
  }

  function markDeparture() {
    startTransition(async () => {
      try {
        await recordDepartureNow(employeeId);
        await load();
        toast.success("Távozás rögzítve.");
      } catch {
        toast.error("Nem sikerült rögzíteni.");
      }
    });
  }

  const openSession = sessions.find((s) => s.arrival_time && !s.departure_time);
  const diff = dayDiffFromWorkday(sessions);

  return (
    <Card className="flex flex-col items-center gap-2 p-2.5 text-center">
      <p className="text-xs font-semibold">Mai érkezés</p>
      <div className="flex w-full flex-col gap-1">
        <button
          type="button"
          onClick={markArrival}
          disabled={pending || loading}
          className="rounded-md border border-success bg-success/10 py-1.5 text-xs font-medium text-success transition-colors active:bg-success/20 disabled:opacity-50"
        >
          Érkezés
        </button>
        <button
          type="button"
          onClick={markDeparture}
          disabled={pending || loading}
          className="rounded-md border border-destructive bg-destructive/10 py-1.5 text-xs font-medium text-destructive transition-colors active:bg-destructive/20 disabled:opacity-50"
        >
          Távozás
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {sessions.length === 0
          ? "Ma még nincs"
          : openSession
            ? `Bent (${openSession.arrival_time} óta)`
            : `${sessions.length} szakasz`}
      </p>
      {diff !== null && (
        <p className={cn("text-xs font-bold", diff < 0 ? "text-destructive" : "text-success")}>
          {formatDiff(diff)}
        </p>
      )}
    </Card>
  );
}
