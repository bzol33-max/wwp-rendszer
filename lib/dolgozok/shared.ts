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
  /** Mikor nyugtázta a dolgozó a Profil > Előlegek "ELFOGADOM" gombjával — null, ha még nem. Utólag nem módosítható. */
  accepted_at: string | null;
  accepted_by: string | null;
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

// --- Előleg-bontás a dolgozói Profil oldalra (2026-10-04) ---
//
// A telefonon egy hosszú tétel-lista követhetetlen: Budaházi Zoltán kérése,
// hogy felül az össz egyenleg álljon, alatta a részletek év és hónap szerint,
// hónaponként a felvett (+) és a visszafizetett (−) összeggel. A hónapra
// koppintva nyílnak ki a tételei, így a visszakövetés megmarad.

export type ElolegTetel = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Pozitív: felvett előleg. Negatív: visszafizetés / bérből levonás. */
  amount: number;
  note: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
};

export type ElolegHonap = {
  /** "2026-09" */
  kulcs: string;
  ev: number;
  /** 1-12 */
  honap: number;
  /** A hónapban felvett összeg (a pozitív tételek összege). */
  felvett: number;
  /** A hónapban visszafizetett összeg, NEGATÍV számként. */
  vissza: number;
  /** A tartozás a hónap VÉGÉN — ezért fogy felülről lefelé olvasva. */
  zaroEgyenleg: number;
  /** A hónap tételei, a legfrissebb elöl. */
  tetelek: ElolegTetel[];
};

export type ElolegEv = {
  ev: number;
  felvett: number;
  vissza: number;
  /** A hónapok a legfrissebbel kezdve. */
  honapok: ElolegHonap[];
};

/**
 * Év → hónap bontás, hónaponkénti felvett/visszafizetett összeggel és a hónap
 * végi egyenleggel. A legfrissebb év és hónap van elöl.
 *
 * MINDEN tétel beleszámít, a még nem nyugtázott is: az összesítő (a kártyán
 * látható tartozás) szintén mindet összegzi, és ha a bontás ettől eltérne, a
 * két szám nem jönne ki ugyanarra. A nyugtázatlan tétel emellett külön, a
 * lista tetején is megjelenik, hogy el lehessen fogadni.
 */
export function elolegBontas(tetelek: ElolegTetel[]): ElolegEv[] {
  if (tetelek.length === 0) return [];

  const honapSzerint = new Map<string, ElolegTetel[]>();
  for (const t of tetelek) {
    const kulcs = t.date.slice(0, 7);
    const lista = honapSzerint.get(kulcs) ?? [];
    lista.push(t);
    honapSzerint.set(kulcs, lista);
  }

  // A záró egyenleget a MAI tartozásból számoljuk visszafelé: a legfrissebb
  // hónap zárója maga a teljes egyenleg, az azt megelőzőé pedig annyival
  // kevesebb, amennyi abban a hónapban mozgott.
  let futo = tetelek.reduce((sum, t) => sum + t.amount, 0);
  const kulcsok = [...honapSzerint.keys()].sort().reverse();

  const honapok: ElolegHonap[] = kulcsok.map((kulcs) => {
    const sajat = [...(honapSzerint.get(kulcs) ?? [])].sort((a, b) =>
      a.date === b.date ? Number(b.id) - Number(a.id) : a.date < b.date ? 1 : -1
    );
    const felvett = sajat.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const vissza = sajat.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const zaroEgyenleg = futo;
    futo -= felvett + vissza;
    return {
      kulcs,
      ev: Number(kulcs.slice(0, 4)),
      honap: Number(kulcs.slice(5)),
      felvett,
      vissza,
      zaroEgyenleg,
      tetelek: sajat,
    };
  });

  const evek: ElolegEv[] = [];
  for (const h of honapok) {
    let ev = evek.find((e) => e.ev === h.ev);
    if (!ev) {
      ev = { ev: h.ev, felvett: 0, vissza: 0, honapok: [] };
      evek.push(ev);
    }
    ev.felvett += h.felvett;
    ev.vissza += h.vissza;
    ev.honapok.push(h);
  }
  return evek;
}
