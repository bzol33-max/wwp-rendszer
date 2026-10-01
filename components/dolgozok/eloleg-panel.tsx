"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ft, type Employee, type AdvanceRow } from "@/lib/dolgozok/shared";
import { addAdvance, deleteAdvance } from "@/lib/dolgozok/actions";
import { getCurrentUser } from "@/lib/current-user";

// Budapesti naptári nap — a toISOString() UTC-t ad, ami éjfél után 1-2
// óráig még a tegnapi dátumot ajánlotta fel.
function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

function ElolegRow({ advance, canEdit, onReload }: { advance: AdvanceRow; canEdit: boolean; onReload: () => void | Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const auto = !!advance.auto_key;

  function remove() {
    if (!window.confirm(`Törlöd ezt az előleget? ${advance.advance_date} — ${ft(advance.amount)}`)) return;
    startTransition(async () => {
      try {
        await deleteAdvance(advance.id);
        await onReload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült törölni.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{advance.advance_date}</span>
          <span className={cn("font-medium", advance.amount < 0 ? "text-destructive" : "text-success")}>
            {advance.amount > 0 ? "+" : ""}
            {ft(advance.amount)}
          </span>
        </div>
        {advance.note && <p className="truncate text-muted-foreground">{advance.note}</p>}
        {/* A dolgozó a telefonján nyugtázza az előleget (Profil > Előlegek,
            "ELFOGADOM"). Az elfogadás ténye és időpontja eddig csak az
            adatbázisban volt meg, a kártyán nem látszott — pedig épp ezért
            van a gomb. A tétel felvitele után ez üresen marad, amíg a
            dolgozó rá nem nyomott. A bérkártyáról szinkronizált levonást is
            nyugtáznia kell (2026-10-01), ha az összege változik, újra. */}
        {advance.accepted_at ? (
          <p className="truncate text-success">
            Elfogadva: {advance.accepted_at}
            {advance.accepted_by ? ` · ${advance.accepted_by}` : ""}
          </p>
        ) : (
          <p className="truncate text-muted-foreground">Elfogadásra vár</p>
        )}
      </div>
      {canEdit && !auto && (
        <Button size="icon-xs" variant="ghost" disabled={pending} onClick={remove}>
          <X />
        </Button>
      )}
    </div>
  );
}

function ElolegEmployeeRow({
  employee,
  advances,
  open,
  onToggle,
  canEdit,
  onReload,
}: {
  employee: Employee;
  advances: AdvanceRow[];
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const egyenleg = advances.reduce((sum, a) => sum + a.amount, 0);

  function add() {
    const n = Number(amount);
    if (!n) {
      toast.error("Adj meg érvényes összeget.");
      return;
    }
    startTransition(async () => {
      try {
        await addAdvance({
          employeeId: employee.id,
          date,
          amount: n,
          note: note.trim() || undefined,
          createdBy: getCurrentUser() || undefined,
        });
        setAmount("");
        setNote("");
        await onReload();
        toast.success("Előleg rögzítve.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-sm font-medium hover:bg-muted"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="flex-1 truncate">{employee.name}</span>
        {/* Nyitott egyenleg: előlegek mínusz a bérből levont tételek — ugyanaz,
            amit a dolgozó a telefonján "el nem számolt előleg"-ként lát. */}
        {egyenleg !== 0 && (
          <span className={cn("shrink-0 text-xs tabular-nums", egyenleg > 0 ? "text-destructive" : "text-muted-foreground")}>
            {ft(egyenleg)}
          </span>
        )}
      </button>
      {open && (
        <div className="ml-4 space-y-2 border-l pl-3 py-1.5">
          {advances.length === 0 && (
            <p className="text-xs text-muted-foreground">Nincs rögzített előleg.</p>
          )}
          {advances.map((a) => (
            <ElolegRow key={a.id} advance={a} canEdit={canEdit} onReload={onReload} />
          ))}
          {canEdit && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex gap-1.5">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 md:text-xs" />
                <Input
                  type="number"
                  placeholder="Összeg"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-7 md:text-xs"
                />
              </div>
              <Input
                placeholder="Megjegyzés (opcionális)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-7 md:text-xs"
              />
              <Button size="xs" onClick={add} disabled={pending}>
                Hozzáadás
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ElolegPanel({
  employees,
  advances,
  canEdit,
  onReload,
}: {
  employees: Employee[];
  advances: AdvanceRow[];
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Előleg</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {employees.map((e) => (
          <ElolegEmployeeRow
            key={e.id}
            employee={e}
            advances={advances.filter((a) => a.employee_id === e.id)}
            open={openId === e.id}
            onToggle={() => setOpenId((prev) => (prev === e.id ? null : e.id))}
            canEdit={canEdit}
            onReload={onReload}
          />
        ))}
      </CardContent>
    </Card>
  );
}
