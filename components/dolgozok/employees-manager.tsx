"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { wageMode, type Employee, type WageMode, type EmployeeInput } from "@/lib/dolgozok/shared";
import { createEmployee, updateEmployee, deactivateEmployee } from "@/lib/dolgozok/actions";

const MODE_LABEL: Record<Exclude<WageMode, "none">, string> = {
  heti: "Heti bér",
  napi: "Napi bér",
  havi: "Fix havi bér",
};

type FormState = {
  name: string;
  position: string;
  mode: Exclude<WageMode, "none">;
  wage: string;
  fixedDeduction: string;
  showLetiltas: boolean;
  showUzemanyag: boolean;
};

function emptyForm(nextPosition: number): FormState {
  return {
    name: "",
    position: String(nextPosition),
    mode: "havi",
    wage: "",
    fixedDeduction: "",
    showLetiltas: false,
    showUzemanyag: false,
  };
}

function formFromEmployee(e: Employee): FormState {
  const mode = wageMode(e);
  const wage = mode === "heti" ? e.weekly_wage : mode === "napi" ? e.daily_wage : e.monthly_wage;
  return {
    name: e.name,
    position: String(e.position),
    mode: mode === "none" ? "havi" : mode,
    wage: String(wage),
    fixedDeduction: String(e.fixed_deduction),
    showLetiltas: e.show_letiltas,
    showUzemanyag: e.show_uzemanyag,
  };
}

function toInput(form: FormState): EmployeeInput {
  const wage = Number(form.wage) || 0;
  return {
    name: form.name,
    position: Number(form.position) || 0,
    weeklyWage: form.mode === "heti" ? wage : 0,
    dailyWage: form.mode === "napi" ? wage : 0,
    monthlyWage: form.mode === "havi" ? wage : 0,
    fixedDeduction: form.mode === "havi" ? Number(form.fixedDeduction) || 0 : 0,
    showLetiltas: form.mode === "havi" && form.showLetiltas,
    showUzemanyag: form.mode === "havi" && form.showUzemanyag,
  };
}

function EmployeeForm({ form, onChange }: { form: FormState; onChange: (next: FormState) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emp-name">Név</Label>
        <Input id="emp-name" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emp-position">Sorrend (kisebb szám = előrébb)</Label>
        <Input
          id="emp-position"
          type="number"
          value={form.position}
          onChange={(e) => onChange({ ...form, position: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emp-mode">Bérmód</Label>
        <Select value={form.mode} onValueChange={(v) => onChange({ ...form, mode: v as FormState["mode"] })}>
          <SelectTrigger id="emp-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABEL) as (keyof typeof MODE_LABEL)[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emp-wage">{form.mode === "heti" ? "Heti bér (Ft)" : form.mode === "napi" ? "Napi bér (Ft)" : "Fix havi bér (Ft)"}</Label>
        <Input id="emp-wage" type="number" value={form.wage} onChange={(e) => onChange({ ...form, wage: e.target.value })} />
      </div>
      {form.mode === "havi" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emp-fixed-deduction">Fix havi levonás (Ft)</Label>
            <Input
              id="emp-fixed-deduction"
              type="number"
              value={form.fixedDeduction}
              onChange={(e) => onChange({ ...form, fixedDeduction: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.showLetiltas}
              onCheckedChange={(v) => onChange({ ...form, showLetiltas: v === true })}
            />
            Van „Letiltás” mezője a kártyán
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.showUzemanyag}
              onCheckedChange={(v) => onChange({ ...form, showUzemanyag: v === true })}
            />
            Van „Üzemanyag” mezője a kártyán
          </label>
        </>
      )}
    </div>
  );
}

function NewEmployeeDialog({ nextPosition, onSaved }: { nextPosition: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(nextPosition));
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createEmployee(toInput(form));
        toast.success("Dolgozó felvéve.");
        setOpen(false);
        setForm(emptyForm(nextPosition));
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        Új dolgozó
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Új dolgozó</DialogTitle>
        </DialogHeader>
        <EmployeeForm form={form} onChange={setForm} />
        <DialogFooter className="gap-2 sm:justify-between">
          <DialogClose render={<Button variant="outline">Mégse</Button>} />
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Mentés…" : "Létrehozás"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFromEmployee(employee));
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEmployee(employee.id, toInput(form));
        toast.success("Mentve.");
        onSaved();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      try {
        await deactivateEmployee(employee.id);
        toast.success("Dolgozó deaktiválva.");
        onSaved();
        onClose();
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee.name}</DialogTitle>
        </DialogHeader>
        <EmployeeForm form={form} onChange={setForm} />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" className="text-destructive" disabled={pending} onClick={handleDeactivate}>
            Deaktiválás
          </Button>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline">Bezár</Button>} />
            <Button onClick={handleSave} disabled={pending}>
              {pending ? "Mentés…" : "Mentés"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeesManager({ employees, onChanged }: { employees: Employee[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Employee | null>(null);
  const nextPosition = employees.length > 0 ? Math.max(...employees.map((e) => e.position)) + 1 : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Dolgozók törzsadata ({employees.length})</CardTitle>
        <NewEmployeeDialog nextPosition={nextPosition} onSaved={onChanged} />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Név</TableHead>
              <TableHead>Bérmód</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => {
              const mode = wageMode(e);
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{mode === "none" ? "—" : MODE_LABEL[mode]}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                      Szerkesztés
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      {editing && <EditEmployeeDialog employee={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </Card>
  );
}
