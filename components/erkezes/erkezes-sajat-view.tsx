"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { logout } from "@/lib/auth/actions";
import { getTodayJelenletek, recordArrivalNow, recordDepartureNow } from "@/lib/jelenlet/actions";
import type { JelenletSession } from "@/lib/jelenlet/shared";
import { FeladatokMobilCsempe } from "@/components/erkezes/feladatok-mobil-csempe";

export function ErkezesSajatView({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
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

  // Több szakasz is lehet aznap (pl. hazament, majd visszajött) — a
  // gombok alatt a legutóbbi érkezés/távozás időpontja jelenik meg.
  const lastArrival = [...sessions].reverse().find((s) => s.arrival_time)?.arrival_time ?? null;
  const lastDeparture = [...sessions].reverse().find((s) => s.departure_time)?.departure_time ?? null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{employeeName}</h1>
          <p className="text-xs text-muted-foreground">Jelenlét</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 pt-4">
          <button
            type="button"
            onClick={markArrival}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-success bg-success/10 py-6 text-success transition-colors active:bg-success/20 disabled:opacity-50"
          >
            <span className="text-base font-semibold">Érkezés</span>
            <span className="text-xs">{lastArrival ? `Rögzítve: ${lastArrival}` : "Koppints"}</span>
          </button>
          <button
            type="button"
            onClick={markDeparture}
            disabled={pending || loading}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-destructive bg-destructive/10 py-6 text-destructive transition-colors active:bg-destructive/20 disabled:opacity-50"
          >
            <span className="text-base font-semibold">Távozás</span>
            <span className="text-xs">{lastDeparture ? `Rögzítve: ${lastDeparture}` : "Koppints"}</span>
          </button>
        </CardContent>
      </Card>

      <FeladatokMobilCsempe />
    </div>
  );
}
