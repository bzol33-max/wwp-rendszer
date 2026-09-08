"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import {
  dayDiffFromWorkday,
  formatDiff,
  summarizeByDay,
  todayIso,
  type JelenletEmployee,
  type JelenletSession,
} from "@/lib/jelenlet/shared";
import {
  createJelenletSession,
  deleteJelenletSession,
  getJelenletEmployees,
  getJelenletHistory,
  getTodayJelenletek,
  updateJelenletSession,
} from "@/lib/jelenlet/actions";

function SessionRow({
  session,
  canEdit,
  onReload,
}: {
  session: JelenletSession;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [arrival, setArrival] = useState(session.arrival_time ?? "");
  const [departure, setDeparture] = useState(session.departure_time ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setArrival(session.arrival_time ?? "");
    setDeparture(session.departure_time ?? "");
  }, [session.arrival_time, session.departure_time]);

  const dirty =
    arrival !== (session.arrival_time ?? "") || departure !== (session.departure_time ?? "");

  function save() {
    startTransition(async () => {
      try {
        await updateJelenletSession(session.id, {
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

  function remove() {
    startTransition(async () => {
      await deleteJelenletSession(session.id);
      await onReload();
    });
  }

  return (
    <div className="flex items-end gap-1.5">
      <div className="flex-1 space-y-1">
        <Label className="text-[11px] text-muted-foreground">Érkezés</Label>
        <Input
          type="time"
          value={arrival}
          disabled={!canEdit || pending}
          onChange={(e) => setArrival(e.target.value)}
          className="h-7"
        />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-[11px] text-muted-foreground">Távozás</Label>
        <Input
          type="time"
          value={departure}
          disabled={!canEdit || pending}
          onChange={(e) => setDeparture(e.target.value)}
          className="h-7"
        />
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          {dirty && (
            <Button size="icon-xs" onClick={save} disabled={pending}>
              <Check />
            </Button>
          )}
          <Button size="icon-xs" variant="ghost" disabled={pending} onClick={remove}>
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmployeeBlock({
  employee,
  sessions,
  canEdit,
  onReload,
  onOpenHistory,
}: {
  employee: JelenletEmployee;
  sessions: JelenletSession[];
  canEdit: boolean;
  onReload: () => void | Promise<void>;
  onOpenHistory: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const diff = dayDiffFromWorkday(sessions);

  function addSession() {
    startTransition(async () => {
      await createJelenletSession({
        employeeId: employee.id,
        workDate: todayIso(),
        arrivalTime: null,
        departureTime: null,
      });
      await onReload();
    });
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenHistory}
          className="text-sm font-medium hover:underline"
        >
          {employee.name}
        </button>
        {diff !== null && (
          <span
            className={cn(
              "text-xs font-semibold",
              diff < 0 ? "text-destructive" : "text-success"
            )}
          >
            {formatDiff(diff)}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ma még nincs bejegyzés.</p>
        ) : (
          sessions.map((s) => (
            <SessionRow key={s.id} session={s} canEdit={canEdit} onReload={onReload} />
          ))
        )}
      </div>
      {canEdit && (
        <Button
          size="xs"
          variant="outline"
          onClick={addSession}
          disabled={pending}
          className="w-full"
        >
          <Plus />
          Új szakasz
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
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    setLoading(true);
    getJelenletHistory(employee.id)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [open, employee]);

  const days = summarizeByDay(sessions);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee?.name} — korábbi napok</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs még rögzített nap.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
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
      </DialogContent>
    </Dialog>
  );
}

// A dolgozónkénti, szerkeszthető szakasz-listák — ez a "Mai érkezés"
// admin tile dialógusának tartalma.
function ErkezesEmployeesPanel({
  employees,
  today,
  loading,
  canEdit,
  onReload,
}: {
  employees: JelenletEmployee[];
  today: JelenletSession[];
  loading: boolean;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [historyFor, setHistoryFor] = useState<JelenletEmployee | null>(null);

  return (
    <div className="space-y-2">
      {loading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nincs kijelölt dolgozó.</p>
      ) : (
        employees.map((e) => (
          <EmployeeBlock
            key={e.id}
            employee={e}
            sessions={today.filter((s) => s.employee_id === e.id)}
            canEdit={canEdit}
            onReload={onReload}
            onOpenHistory={() => setHistoryFor(e)}
          />
        ))
      )}
      <HistoryDialog
        employee={historyFor}
        open={historyFor !== null}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />
    </div>
  );
}

// Kompakt csempe a Jelenlét admin nézet felső sorában: dolgozónként a mai
// állapot (bent/kint), koppintásra megnyílik a teljes, szerkeszthető nézet.
export function MaiErkezesTile() {
  const canEdit = useCanEdit();
  const [employees, setEmployees] = useState<JelenletEmployee[]>([]);
  const [today, setToday] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2.5 text-center"
        >
          <span className="text-xs font-semibold">Mai érkezés</span>
          {loading ? (
            <span className="text-[11px] text-muted-foreground">Betöltés…</span>
          ) : (
            <div className="w-full space-y-0.5">
              {employees.map((e) => {
                const sessions = today.filter((s) => s.employee_id === e.id);
                const openSession = sessions.find((s) => s.arrival_time && !s.departure_time);
                return (
                  <div key={e.id} className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="truncate text-muted-foreground">{e.name}</span>
                    <span
                      className={cn(
                        "font-medium",
                        openSession ? "text-success" : "text-muted-foreground"
                      )}
                    >
                      {sessions.length === 0 ? "—" : openSession ? "Bent" : "Kint"}
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
            <DialogTitle>Mai érkezés</DialogTitle>
          </DialogHeader>
          <ErkezesEmployeesPanel
            employees={employees}
            today={today}
            loading={loading}
            canEdit={canEdit}
            onReload={load}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
