"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DAY_TYPE_LABELS,
  type JelenletEmployee,
  type JelenletSession,
} from "@/lib/jelenlet/shared";
import {
  createJelenletSession,
  deleteJelenletSession,
  setJelenletNapTipus,
  updateJelenletSession,
} from "@/lib/jelenlet/actions";

// Egy már rögzített szakasz sora: az idők és a megjegyzés helyben írhatók,
// a pipa csak akkor jelenik meg, ha tényleg változott valami.
function SzakaszSor({
  session,
  onReload,
}: {
  session: JelenletSession;
  onReload: () => void | Promise<void>;
}) {
  const [arrival, setArrival] = useState(session.arrival_time ?? "");
  const [departure, setDeparture] = useState(session.departure_time ?? "");
  const [note, setNote] = useState(session.note ?? "");
  const [pending, startTransition] = useTransition();

  const dirty =
    arrival !== (session.arrival_time ?? "") ||
    departure !== (session.departure_time ?? "") ||
    note !== (session.note ?? "");
  const hianyos = !arrival || !departure;

  function save() {
    startTransition(async () => {
      try {
        await updateJelenletSession(session.id, {
          arrivalTime: arrival || null,
          departureTime: departure || null,
          note,
        });
        await onReload();
        toast.success("Mentve.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  function remove() {
    if (!window.confirm("Törlöd ezt a szakaszt?")) return;
    startTransition(async () => {
      await deleteJelenletSession(session.id);
      await onReload();
    });
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-end gap-1.5">
        <div className="flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Érkezés</Label>
          <Input
            type="time"
            value={arrival}
            disabled={pending}
            onChange={(e) => setArrival(e.target.value)}
            className="h-7"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Távozás</Label>
          <Input
            type="time"
            value={departure}
            disabled={pending}
            onChange={(e) => setDeparture(e.target.value)}
            className={cn("h-7", hianyos && "border-destructive")}
          />
        </div>
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
      </div>
      <Input
        value={note}
        disabled={pending}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Megjegyzés"
        className="h-7 text-xs"
      />
    </div>
  );
}

function UjSzakasz({
  employeeId,
  workDate,
  onReload,
}: {
  employeeId: string;
  workDate: string;
  onReload: () => void | Promise<void>;
}) {
  const [nyitva, setNyitva] = useState(false);
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [pending, startTransition] = useTransition();

  if (!nyitva) {
    return (
      <Button size="xs" variant="outline" className="w-full" onClick={() => setNyitva(true)}>
        <Plus />
        Új szakasz
      </Button>
    );
  }

  function hozzaad() {
    startTransition(async () => {
      try {
        await createJelenletSession({
          employeeId,
          workDate,
          arrivalTime: arrival || null,
          departureTime: departure || null,
        });
        setArrival("");
        setDeparture("");
        setNyitva(false);
        await onReload();
        toast.success("Szakasz hozzáadva.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="flex items-end gap-1.5 rounded-md border border-dashed p-2">
      <div className="flex-1 space-y-1">
        <Label className="text-[11px] text-muted-foreground">Érkezés</Label>
        <Input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} className="h-7" />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-[11px] text-muted-foreground">Távozás</Label>
        <Input
          type="time"
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
          className="h-7"
        />
      </div>
      <Button size="xs" onClick={hozzaad} disabled={pending || (!arrival && !departure)}>
        Hozzáadás
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={() => setNyitva(false)}>
        <X />
      </Button>
    </div>
  );
}

/**
 * Egy nap szerkesztése EGY dolgozóra: a szakaszai, plusz az egész napos
 * távollét (szabadság / betegszabadság). A távollét felváltja a nap minden
 * más bejegyzését — egy napra nem kerülhet egyszerre munka és szabadság.
 */
function DolgozoNapja({
  employee,
  workDate,
  sessions,
  onReload,
}: {
  employee: JelenletEmployee;
  workDate: string;
  sessions: JelenletSession[];
  onReload: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const munkak = sessions.filter((s) => s.day_type === "munka");
  const abszencia = sessions.find((s) => s.day_type !== "munka") ?? null;

  function tipust(dayType: "szabadsag" | "beteg" | null) {
    const cimke = dayType ? DAY_TYPE_LABELS[dayType] : null;
    if (dayType && munkak.length > 0) {
      if (
        !window.confirm(
          `${cimke} erre a napra?\n\nA napon rögzített ${munkak.length} szakasz törlődik.`
        )
      ) {
        return;
      }
    }
    if (!dayType && !window.confirm("Törlöd a távollétet erről a napról?")) return;
    startTransition(async () => {
      try {
        await setJelenletNapTipus({ employeeId: employee.id, workDate, dayType });
        await onReload();
        toast.success(dayType ? `${cimke} rögzítve.` : "Távollét törölve.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{employee.name}</span>
        {abszencia && (
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {DAY_TYPE_LABELS[abszencia.day_type]}
          </span>
        )}
      </div>

      {abszencia ? (
        <>
          {abszencia.note && <p className="text-xs text-muted-foreground">{abszencia.note}</p>}
          <Button
            size="xs"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => tipust(null)}
          >
            Távollét törlése
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            {munkak.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ezen a napon nincs bejegyzés.</p>
            ) : (
              munkak.map((s) => <SzakaszSor key={s.id} session={s} onReload={onReload} />)
            )}
          </div>
          <UjSzakasz employeeId={employee.id} workDate={workDate} onReload={onReload} />
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="xs" variant="outline" disabled={pending} onClick={() => tipust("szabadsag")}>
              Szabadság
            </Button>
            <Button size="xs" variant="outline" disabled={pending} onClick={() => tipust("beteg")}>
              Betegszabadság
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Egy nap szerkesztője minden jelenlét-aktív dolgozóval, egymás mellett. */
export function NapSzerkeszto({
  employees,
  workDate,
  sessions,
  onReload,
}: {
  employees: JelenletEmployee[];
  workDate: string;
  sessions: JelenletSession[];
  onReload: () => void | Promise<void>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {employees.map((e) => (
        <DolgozoNapja
          key={e.id}
          employee={e}
          workDate={workDate}
          sessions={sessions.filter((s) => s.employee_id === e.id && s.work_date === workDate)}
          onReload={onReload}
        />
      ))}
    </div>
  );
}
