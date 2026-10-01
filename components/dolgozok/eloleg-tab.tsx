"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// A bérkártya „Előleg” füle (terv: „Bér | Előleg fül a kártyán”, 2026-10-01).
// A korábbi, külön jobb oldali Előleg panel helyett minden dolgozó a saját
// kártyáján mutatja a nyitott egyenlegét, a tételeit nyugtázási állapottal,
// és itt is rögzíthető új előleg.
export function ElolegTab({
  employee,
  advances,
  canEdit,
  onReload,
}: {
  employee: Employee;
  advances: AdvanceRow[];
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
        toast.success("Előleg rögzítve — a dolgozónak nyugtáznia kell.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* Nyitott egyenleg: előlegek mínusz a bérből levont tételek — ugyanaz,
          amit a dolgozó a telefonján "el nem számolt előleg"-ként lát. */}
      <div className="flex items-baseline justify-between rounded-md bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Nyitott egyenleg</span>
        <span className={cn("text-lg font-semibold tabular-nums", egyenleg > 0 && "text-destructive")}>
          {ft(egyenleg)}
        </span>
      </div>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {advances.length === 0 && <p className="text-xs text-muted-foreground">Nincs rögzített előleg.</p>}
        {advances.map((a) => (
          <ElolegRow key={a.id} advance={a} canEdit={canEdit} onReload={onReload} />
        ))}
      </div>
      {canEdit && (
        <div className="mt-auto flex flex-col gap-1.5 border-t pt-2">
          <div className="flex gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Összeg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-7 md:text-xs"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 md:text-xs" />
          </div>
          <div className="flex gap-1.5">
            <Input
              placeholder="Megjegyzés (opcionális)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-7 md:text-xs"
            />
            <Button size="xs" onClick={add} disabled={pending}>
              + rögzít
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
