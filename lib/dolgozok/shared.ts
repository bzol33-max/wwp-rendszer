// Típusok és tiszta (nem szerver-akció) segédfüggvények az Alkalmazottak
// modulhoz — ezt a fájlt kliens komponensek is importálják, ezért nem
// "use server" (abban csak async függvény exportálható).

export const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
] as const;

export type WageMode = "heti" | "napi" | "havi" | "none";

export type Employee = {
  id: string;
  name: string;
  position: number;
  weekly_wage: number;
  daily_wage: number;
  monthly_wage: number;
  fixed_deduction: number;
  show_letiltas: boolean;
  show_uzemanyag: boolean;
  active: boolean;
};

export type HetiRow = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  week_index: number;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  paid_by: string | null;
};

export type NapiHaviRow = {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  days_count: number;
  utalas: number;
  eloleg: number;
  letiltas: number;
  uzemanyag: number;
  paid: boolean;
  paid_at: string | null;
  paid_by: string | null;
};

export type AdvanceRow = {
  id: string;
  employee_id: string;
  advance_date: string;
  amount: number;
  note: string | null;
  auto_key: string | null;
  created_by: string | null;
  created_at: string;
};

export type Pointer = { year: number; month: number };

export type Snapshot = {
  pointer: Pointer;
  employees: Employee[];
  weekly: HetiRow[];
  napiHavi: NapiHaviRow[];
  advances: AdvanceRow[];
};

export type ArchiveMonth = { year: number; month: number; label: string };

export type ArchivedSnapshot = {
  year: number;
  month: number;
  employees: Employee[];
  weekly: HetiRow[];
  napiHavi: NapiHaviRow[];
};

export type EmployeeInput = {
  name: string;
  position: number;
  weeklyWage: number;
  dailyWage: number;
  monthlyWage: number;
  fixedDeduction: number;
  showLetiltas: boolean;
  showUzemanyag: boolean;
};

export function wageMode(e: Pick<Employee, "weekly_wage" | "daily_wage" | "monthly_wage">): WageMode {
  if (e.weekly_wage > 0) return "heti";
  if (e.daily_wage > 0) return "napi";
  if (e.monthly_wage > 0) return "havi";
  return "none";
}

export function ft(n: number): string {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

export function calcHetiTotal(rows: HetiRow[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

export function calcNapiGross(row: Pick<NapiHaviRow, "days_count">, employee: Pick<Employee, "daily_wage">): number {
  return row.days_count * employee.daily_wage;
}

export function calcNapiNetto(row: Pick<NapiHaviRow, "days_count" | "utalas" | "eloleg">, employee: Pick<Employee, "daily_wage">): number {
  return calcNapiGross(row, employee) - row.utalas - row.eloleg;
}

export function calcHaviNetto(
  row: Pick<NapiHaviRow, "letiltas" | "uzemanyag" | "utalas" | "eloleg">,
  employee: Pick<Employee, "monthly_wage" | "fixed_deduction">
): number {
  return (
    employee.monthly_wage - employee.fixed_deduction - row.letiltas - row.uzemanyag - row.utalas - row.eloleg
  );
}
