"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import {
  diffFromWorkday,
  formatDiff,
  todayIso,
  type JelenletEmployee,
  type JelenletRow,
} from "@/lib/jelenlet/shared";
import {
  getJelenletEmployees,
  getJelenletHistory,
  getTodayJelenletek,
  saveJelenlet,
} from "@/lib/jelenlet/actions";

function EmployeeRow({
  employee,
  row,
  canEdit,
  onReload,
  onOpenHistory,
}: {
  employee: JelenletEmployee;
  row: JelenletRow | undefined;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
  onOpenHistory: () => void;
}) {
  const [arrival, setArrival] = useState(row?.arrival_time ?? "");
  const [departure, setDeparture] = useState(row?.departure_time ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setArrival(row?.arrival_time ?? "");
    setDeparture(row?.departure_time ?? "");
  }, [row?.arrival_time, row?.departure_time]);

  const dirty =
    arrival !== (row?.arrival_time ?? "") || departure !== (row?.departure_time ?? "");

  function save() {
    startTransition(async () => {
      try {
        await saveJelenlet({
          employeeId: employee.id,
          workDate: todayIso(),
          arrivalTime: arrival || null,
          departureTime: departure || null,
        });
        await onReload();
        toast.success("Mentve.");
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2.5">
      <button
        type="button"
        onClick={onOpenHistory}
        className="text-sm font-medium hover:underline"
      >
        {employee.name}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Érkezés</Label>
          <Input
            type="time"
            value={arrival}
            disabled={!canEdit || pending}
            onChange={(e) => setArrival(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Távozás</Label>
          <Input
            type="time"
            value={departure}
            disabled={!canEdit || pending}
            onChange={(e) => setDeparture(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      {canEdit && dirty && (
        <Button size="xs" onClick={save} disabled={pending}>
          {pending ? "Mentés…" : "✓ mentés"}
        </Button>
      )}
    </div>
  );
}

function HistoryDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: JelenletEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<JelenletRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    setLoading(true);
    getJelenletHistory(employee.id)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [open, employee]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee?.name} — korábbi napok</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs még rögzített nap.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="py-1 text-left font-medium">Dátum</th>
                  <th className="py-1 text-left font-medium">Érkezés</th>
                  <th className="py-1 text-left font-medium">Távozás</th>
                  <th className="py-1 text-right font-medium">Eltérés (9 óra)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = diffFromWorkday(r.arrival_time, r.departure_time);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5">{r.work_date}</td>
                      <td className="py-1.5">{r.arrival_time ?? "—"}</td>
                      <td className="py-1.5">{r.departure_time ?? "—"}</td>
                      <td
                        className={cn(
                          "py-1.5 text-right font-medium",
                          diff !== null && diff < 0 && "text-destructive",
                          diff !== null && diff >= 0 && "text-success"
                        )}
                      >
                        {formatDiff(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ErkezesWidget() {
  const canEdit = useCanEdit();
  const [employees, setEmployees] = useState<JelenletEmployee[]>([]);
  const [today, setToday] = useState<JelenletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyFor, setHistoryFor] = useState<JelenletEmployee | null>(null);

  const load = useCallback(async () => {
    const [emp, rows] = await Promise.all([getJelenletEmployees(), getTodayJelenletek()]);
    setEmployees(emp);
    setToday(rows);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Mai érkezés</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs kijelölt dolgozó.</p>
        ) : (
          employees.map((e) => (
            <EmployeeRow
              key={e.id}
              employee={e}
              row={today.find((r) => r.employee_id === e.id)}
              canEdit={canEdit}
              onReload={load}
              onOpenHistory={() => setHistoryFor(e)}
            />
          ))
        )}
      </CardContent>
      <HistoryDialog
        employee={historyFor}
        open={historyFor !== null}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
    </Card>
  );
}
