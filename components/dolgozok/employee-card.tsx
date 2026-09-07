"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  wageMode,
  ft,
  calcNapiGross,
  calcNapiNetto,
  calcHaviNetto,
  type Employee,
  type HetiRow,
  type NapiHaviRow,
} from "@/lib/dolgozok/shared";
import {
  saveNapiBer,
  saveHaviBer,
  setHetiPaid,
  setNapiHaviPaid,
} from "@/lib/dolgozok/actions";
import { getCurrentUser } from "@/lib/current-user";

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
      />
    </div>
  );
}

function KifizetveButton({
  paid,
  disabled,
  onToggle,
}: {
  paid: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant={paid ? "default" : "outline"}
      className={cn("w-full", paid && "bg-success text-success-foreground hover:bg-success/90")}
      disabled={disabled}
      onClick={onToggle}
    >
      {paid ? "Kifizetve ✓" : "Kifizetve?"}
    </Button>
  );
}

function CardShell({
  name,
  featured,
  children,
}: {
  name: string;
  featured?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(featured && "border-primary/40")}>
      <CardHeader>
        <CardTitle className="text-center text-xl">{name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function HetiCard({
  employee,
  rows,
  readonly,
  canEdit,
  featured,
  onReload,
}: {
  employee: Employee;
  rows: HetiRow[];
  readonly?: boolean;
  canEdit: boolean;
  featured?: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const locked = readonly || !canEdit || pending;

  function toggle(row: HetiRow) {
    startTransition(async () => {
      try {
        await setHetiPaid(row.id, !row.paid, getCurrentUser() || undefined);
        await onReload();
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  return (
    <CardShell name={employee.name} featured={featured}>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((week) => {
          const row = rows.find((r) => r.week_index === week);
          if (!row) return null;
          return (
            <button
              key={week}
              type="button"
              disabled={locked}
              onClick={() => toggle(row)}
              className={cn(
                "rounded-md border px-3 py-3 text-center text-sm font-medium transition-colors disabled:cursor-not-allowed",
                row.paid
                  ? "border-success bg-success text-success-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              <div>{week}. hét</div>
              <div className="mt-1">{ft(row.amount)}</div>
            </button>
          );
        })}
      </div>
    </CardShell>
  );
}

function NapiCard({
  employee,
  row,
  readonly,
  canEdit,
  featured,
  onReload,
}: {
  employee: Employee;
  row: NapiHaviRow;
  readonly?: boolean;
  canEdit: boolean;
  featured?: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [daysCount, setDaysCount] = useState(String(row.days_count));
  const [utalas, setUtalas] = useState(String(row.utalas));
  const [eloleg, setEloleg] = useState(String(row.eloleg));
  const [saving, startSaving] = useTransition();
  const [toggling, startToggling] = useTransition();
  const locked = readonly || !canEdit;

  function save() {
    startSaving(async () => {
      try {
        await saveNapiBer(employee.id, {
          daysCount: Number(daysCount) || 0,
          utalas: Number(utalas) || 0,
          eloleg: Number(eloleg) || 0,
        });
        await onReload();
        toast.success("Mentve.");
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  function toggle() {
    startToggling(async () => {
      try {
        await setNapiHaviPaid(row.id, !row.paid, getCurrentUser() || undefined);
        await onReload();
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  const gross = calcNapiGross({ days_count: Number(daysCount) || 0 }, employee);
  const netto = calcNapiNetto(
    { days_count: Number(daysCount) || 0, utalas: Number(utalas) || 0, eloleg: Number(eloleg) || 0 },
    employee
  );

  return (
    <CardShell name={employee.name} featured={featured}>
      <div className="grid grid-cols-3 items-end gap-2">
        <NumberField label="Napok száma" value={daysCount} onChange={setDaysCount} disabled={locked} />
        <NumberField label="Utalás (Ft)" value={utalas} onChange={setUtalas} disabled={locked} />
        <NumberField label="Előleg (Ft)" value={eloleg} onChange={setEloleg} disabled={locked} />
      </div>
      {!locked && (
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Mentés…" : "✓ mentés"}
        </Button>
      )}
      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>
            {Number(daysCount) || 0} nap × {ft(employee.daily_wage)}
          </span>
          <span>{ft(gross)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Nettó</span>
          <span>{ft(netto)}</span>
        </div>
      </div>
      {!readonly && (
        <KifizetveButton paid={row.paid} disabled={!canEdit || toggling} onToggle={toggle} />
      )}
    </CardShell>
  );
}

function HaviCard({
  employee,
  row,
  readonly,
  canEdit,
  featured,
  onReload,
}: {
  employee: Employee;
  row: NapiHaviRow;
  readonly?: boolean;
  canEdit: boolean;
  featured?: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [letiltas, setLetiltas] = useState(String(row.letiltas));
  const [uzemanyag, setUzemanyag] = useState(String(row.uzemanyag));
  const [utalas, setUtalas] = useState(String(row.utalas));
  const [eloleg, setEloleg] = useState(String(row.eloleg));
  const [saving, startSaving] = useTransition();
  const [toggling, startToggling] = useTransition();
  const locked = readonly || !canEdit;

  function save() {
    startSaving(async () => {
      try {
        await saveHaviBer(employee.id, {
          letiltas: employee.show_letiltas ? Number(letiltas) || 0 : 0,
          uzemanyag: employee.show_uzemanyag ? Number(uzemanyag) || 0 : 0,
          utalas: Number(utalas) || 0,
          eloleg: Number(eloleg) || 0,
        });
        await onReload();
        toast.success("Mentve.");
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  function toggle() {
    startToggling(async () => {
      try {
        await setNapiHaviPaid(row.id, !row.paid, getCurrentUser() || undefined);
        await onReload();
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  const netto = calcHaviNetto(
    {
      letiltas: employee.show_letiltas ? Number(letiltas) || 0 : 0,
      uzemanyag: employee.show_uzemanyag ? Number(uzemanyag) || 0 : 0,
      utalas: Number(utalas) || 0,
      eloleg: Number(eloleg) || 0,
    },
    employee
  );

  return (
    <CardShell name={employee.name} featured={featured}>
      <div className="grid grid-cols-2 items-end gap-2">
        {employee.show_letiltas && (
          <NumberField label="Letiltás (Ft)" value={letiltas} onChange={setLetiltas} disabled={locked} />
        )}
        {employee.show_uzemanyag && (
          <NumberField label="Üzemanyag (Ft)" value={uzemanyag} onChange={setUzemanyag} disabled={locked} />
        )}
        <NumberField label="Utalás (Ft)" value={utalas} onChange={setUtalas} disabled={locked} />
        <NumberField label="Előleg (Ft)" value={eloleg} onChange={setEloleg} disabled={locked} />
      </div>
      {!locked && (
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Mentés…" : "✓ mentés"}
        </Button>
      )}
      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Fix bér</span>
          <span>{ft(employee.monthly_wage)}</span>
        </div>
        {employee.fixed_deduction > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Fix levonás</span>
            <span>-{ft(employee.fixed_deduction)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Nettó</span>
          <span>{ft(netto)}</span>
        </div>
      </div>
      {!readonly && (
        <KifizetveButton paid={row.paid} disabled={!canEdit || toggling} onToggle={toggle} />
      )}
    </CardShell>
  );
}

export function EmployeeCard({
  employee,
  heti,
  napiHavi,
  readonly,
  canEdit,
  featured,
  onReload,
}: {
  employee: Employee;
  heti: HetiRow[];
  napiHavi: NapiHaviRow | undefined;
  readonly?: boolean;
  canEdit: boolean;
  featured?: boolean;
  onReload: () => void | Promise<void>;
}) {
  const mode = wageMode(employee);
  if (mode === "heti") {
    return (
      <HetiCard
        employee={employee}
        rows={heti}
        readonly={readonly}
        canEdit={canEdit}
        featured={featured}
        onReload={onReload}
      />
    );
  }
  if (mode === "napi" && napiHavi) {
    return (
      <NapiCard
        employee={employee}
        row={napiHavi}
        readonly={readonly}
        canEdit={canEdit}
        featured={featured}
        onReload={onReload}
      />
    );
  }
  if (mode === "havi" && napiHavi) {
    return (
      <HaviCard
        employee={employee}
        row={napiHavi}
        readonly={readonly}
        canEdit={canEdit}
        featured={featured}
        onReload={onReload}
      />
    );
  }
  return null;
}
