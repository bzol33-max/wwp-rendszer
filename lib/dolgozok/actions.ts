"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  HU_MONTHS,
  wageMode,
  type Employee,
  type HetiRow,
  type NapiHaviRow,
  type AdvanceRow,
  type Pointer,
  type Snapshot,
  type ArchiveMonth,
  type ArchivedSnapshot,
  type EmployeeInput,
} from "@/lib/dolgozok/shared";

// Alkalmazottak modul — szerver akciók. Az oldal NEM a naptári hónapot
// mutatja, hanem egy külön tárolt mutatót (alkalmazottak_allapot) — lásd
// getPointer() és checkAndAdvancePointer() lent, ez a modul legfontosabb
// logikai része.

function nextMonth(p: Pointer): Pointer {
  return p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 };
}

async function getActiveEmployees(): Promise<Employee[]> {
  return query<Employee>(
    `select id::text, name, position, weekly_wage, daily_wage, monthly_wage,
       fixed_deduction, show_letiltas, show_uzemanyag, active
     from alkalmazottak
     where active = true
     order by position, id`
  );
}

async function isMonthFullyPaid(year: number, month: number): Promise<boolean> {
  const employees = await getActiveEmployees();
  for (const e of employees) {
    const mode = wageMode(e);
    if (mode === "heti") {
      const rows = await query<{ paid: boolean }>(
        `select paid from alkalmazott_heti_ber where employee_id = $1 and year = $2 and month = $3`,
        [e.id, year, month]
      );
      if (rows.length < 4 || rows.some((r) => !r.paid)) return false;
    } else if (mode === "napi" || mode === "havi") {
      const rows = await query<{ paid: boolean }>(
        `select paid from alkalmazott_napi_havi_ber where employee_id = $1 and year = $2 and month = $3`,
        [e.id, year, month]
      );
      if (rows.length === 0 || !rows[0].paid) return false;
    }
  }
  return true;
}

async function resolveInitialPointer(): Promise<Pointer> {
  const months = await query<{ year: number; month: number }>(
    `select year, month from alkalmazott_heti_ber
     union
     select year, month from alkalmazott_napi_havi_ber
     order by 1, 2`
  );
  for (const m of months) {
    if (!(await isMonthFullyPaid(m.year, m.month))) return m;
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export async function getPointer(): Promise<Pointer> {
  const rows = await query<Pointer>(`select year, month from alkalmazottak_allapot where id = 1`);
  if (rows.length > 0) return rows[0];
  const resolved = await resolveInitialPointer();
  await query(
    `insert into alkalmazottak_allapot (id, year, month) values (1, $1, $2) on conflict (id) do nothing`,
    [resolved.year, resolved.month]
  );
  return resolved;
}

async function checkAndAdvancePointer() {
  const pointer = await getPointer();
  if (await isMonthFullyPaid(pointer.year, pointer.month)) {
    const next = nextMonth(pointer);
    await query(`update alkalmazottak_allapot set year = $1, month = $2 where id = 1`, [
      next.year,
      next.month,
    ]);
  }
}

// Minden dolgozóhoz, akinek a mutató hónapjára még nincs sora, létrehozza az
// alapértelmezett sor(oka)t — így a felület mindig stabil id-kkal
// dolgozhat, nincs külön "hozz létre, ha nincs" ág a mentéseknél.
async function ensureMonthRows(year: number, month: number) {
  const employees = await getActiveEmployees();
  for (const e of employees) {
    const mode = wageMode(e);
    if (mode === "heti") {
      for (let week = 1; week <= 4; week++) {
        await query(
          `insert into alkalmazott_heti_ber (employee_id, year, month, week_index, amount)
           values ($1, $2, $3, $4, $5)
           on conflict (employee_id, year, month, week_index) do nothing`,
          [e.id, year, month, week, e.weekly_wage]
        );
      }
    } else if (mode === "napi" || mode === "havi") {
      await query(
        `insert into alkalmazott_napi_havi_ber (employee_id, year, month)
         values ($1, $2, $3)
         on conflict (employee_id, year, month) do nothing`,
        [e.id, year, month]
      );
    }
  }
}

// --- Fő nézet ---

export async function getAlkalmazottakSnapshot(): Promise<Snapshot> {
  const pointer = await getPointer();
  await ensureMonthRows(pointer.year, pointer.month);
  const [employees, weekly, napiHavi, advances] = await Promise.all([
    getActiveEmployees(),
    query<HetiRow>(
      `select id::text, employee_id::text, year, month, week_index, amount, paid, paid_at, paid_by
       from alkalmazott_heti_ber where year = $1 and month = $2 order by employee_id, week_index`,
      [pointer.year, pointer.month]
    ),
    query<NapiHaviRow>(
      `select id::text, employee_id::text, year, month, days_count, utalas, eloleg, letiltas, uzemanyag, paid, paid_at, paid_by
       from alkalmazott_napi_havi_ber where year = $1 and month = $2`,
      [pointer.year, pointer.month]
    ),
    query<AdvanceRow>(
      `select id::text, employee_id::text, to_char(advance_date, 'YYYY-MM-DD') as advance_date,
         amount, note, auto_key, created_by, created_at
       from alkalmazott_elolegek
       order by advance_date desc, id desc`
    ),
  ]);
  return { pointer, employees, weekly, napiHavi, advances };
}

// --- Dolgozók törzsadata ---

function validateWageMode(input: EmployeeInput) {
  const name = input.name.trim();
  if (!name) throw new Error("A név megadása kötelező.");
  const filled = [input.weeklyWage, input.dailyWage, input.monthlyWage].filter((v) => v > 0).length;
  if (filled !== 1) {
    throw new Error("Pontosan egy bérmezőt tölts ki: heti, napi, vagy fix havi bér.");
  }
}

export async function createEmployee(input: EmployeeInput) {
  validateWageMode(input);
  await query(
    `insert into alkalmazottak
       (name, position, weekly_wage, daily_wage, monthly_wage, fixed_deduction, show_letiltas, show_uzemanyag)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.name.trim(),
      input.position,
      input.weeklyWage,
      input.dailyWage,
      input.monthlyWage,
      input.fixedDeduction,
      input.showLetiltas,
      input.showUzemanyag,
    ]
  );
  const pointer = await getPointer();
  await ensureMonthRows(pointer.year, pointer.month);
  revalidatePath("/dolgozok");
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  validateWageMode(input);
  await query(
    `update alkalmazottak
     set name = $2, position = $3, weekly_wage = $4, daily_wage = $5, monthly_wage = $6,
         fixed_deduction = $7, show_letiltas = $8, show_uzemanyag = $9
     where id = $1`,
    [
      id,
      input.name.trim(),
      input.position,
      input.weeklyWage,
      input.dailyWage,
      input.monthlyWage,
      input.fixedDeduction,
      input.showLetiltas,
      input.showUzemanyag,
    ]
  );
  const pointer = await getPointer();
  await ensureMonthRows(pointer.year, pointer.month);
  revalidatePath("/dolgozok");
}

export async function deactivateEmployee(id: string) {
  await query(`update alkalmazottak set active = false where id = $1`, [id]);
  revalidatePath("/dolgozok");
}

// --- Heti bér ---

export async function setHetiPaid(id: string, paid: boolean, paidBy?: string) {
  await query(
    `update alkalmazott_heti_ber
     set paid = $2, paid_at = case when $2 then now() else null end,
         paid_by = case when $2 then $3 else null end
     where id = $1`,
    [id, paid, paidBy ?? null]
  );
  await checkAndAdvancePointer();
  revalidatePath("/dolgozok");
}

// --- Napi / fix havi bér ---

async function syncEloleg(employeeId: string, year: number, month: number, eloleg: number) {
  const autoKey = `auto:${employeeId}:${year}:${month}`;
  if (eloleg > 0) {
    const note = `bérből levonva (${HU_MONTHS[month - 1]} ${year})`;
    await query(
      `insert into alkalmazott_elolegek (employee_id, advance_date, amount, note, auto_key)
       values ($1, make_date($2, $3, 1), $4, $5, $6)
       on conflict (auto_key) do update set amount = excluded.amount, note = excluded.note`,
      [employeeId, year, month, -eloleg, note, autoKey]
    );
  } else {
    await query(`delete from alkalmazott_elolegek where auto_key = $1`, [autoKey]);
  }
}

export async function saveNapiBer(
  employeeId: string,
  input: { daysCount: number; utalas: number; eloleg: number }
) {
  const pointer = await getPointer();
  await query(
    `update alkalmazott_napi_havi_ber
     set days_count = $4, utalas = $5, eloleg = $6
     where employee_id = $1 and year = $2 and month = $3`,
    [employeeId, pointer.year, pointer.month, input.daysCount, input.utalas, input.eloleg]
  );
  await syncEloleg(employeeId, pointer.year, pointer.month, input.eloleg);
  revalidatePath("/dolgozok");
}

export async function saveHaviBer(
  employeeId: string,
  input: { letiltas: number; uzemanyag: number; utalas: number; eloleg: number }
) {
  const pointer = await getPointer();
  await query(
    `update alkalmazott_napi_havi_ber
     set letiltas = $4, uzemanyag = $5, utalas = $6, eloleg = $7
     where employee_id = $1 and year = $2 and month = $3`,
    [employeeId, pointer.year, pointer.month, input.letiltas, input.uzemanyag, input.utalas, input.eloleg]
  );
  await syncEloleg(employeeId, pointer.year, pointer.month, input.eloleg);
  revalidatePath("/dolgozok");
}

export async function setNapiHaviPaid(id: string, paid: boolean, paidBy?: string) {
  await query(
    `update alkalmazott_napi_havi_ber
     set paid = $2, paid_at = case when $2 then now() else null end,
         paid_by = case when $2 then $3 else null end
     where id = $1`,
    [id, paid, paidBy ?? null]
  );
  await checkAndAdvancePointer();
  revalidatePath("/dolgozok");
}

// --- Előlegek ---

export async function addAdvance(input: {
  employeeId: string;
  date: string;
  amount: number;
  note?: string;
  createdBy?: string;
}) {
  if (!input.amount) throw new Error("Az összeg megadása kötelező.");
  await query(
    `insert into alkalmazott_elolegek (employee_id, advance_date, amount, note, created_by)
     values ($1, $2, $3, $4, $5)`,
    [input.employeeId, input.date, input.amount, input.note ?? null, input.createdBy ?? null]
  );
  revalidatePath("/dolgozok");
}

export async function deleteAdvance(id: string) {
  const rows = await query<{ auto_key: string | null }>(
    `select auto_key from alkalmazott_elolegek where id = $1`,
    [id]
  );
  if (rows.length === 0) return;
  if (rows[0].auto_key) {
    throw new Error("Ez a tétel a bérkártya „Előleg” mezőjéből szinkronizálódik — ott módosítsd.");
  }
  await query(`delete from alkalmazott_elolegek where id = $1`, [id]);
  revalidatePath("/dolgozok");
}

// --- Archívum ---

export async function getArchiveList(): Promise<ArchiveMonth[]> {
  const pointer = await getPointer();
  const rows = await query<{ year: number; month: number }>(
    `select year, month from alkalmazott_heti_ber
     union
     select year, month from alkalmazott_napi_havi_ber
     union
     select extract(year from advance_date)::int as year, extract(month from advance_date)::int as month
     from alkalmazott_elolegek
     order by 1 desc, 2 desc`
  );
  return rows
    .filter((r) => r.year < pointer.year || (r.year === pointer.year && r.month < pointer.month))
    .map((r) => ({ year: r.year, month: r.month, label: `${HU_MONTHS[r.month - 1]} ${r.year}` }));
}

export async function getArchivedMonth(year: number, month: number): Promise<ArchivedSnapshot> {
  const [employees, weekly, napiHavi] = await Promise.all([
    query<Employee>(
      `select id::text, name, position, weekly_wage, daily_wage, monthly_wage,
         fixed_deduction, show_letiltas, show_uzemanyag, active
       from alkalmazottak
       order by position, id`
    ),
    query<HetiRow>(
      `select id::text, employee_id::text, year, month, week_index, amount, paid, paid_at, paid_by
       from alkalmazott_heti_ber where year = $1 and month = $2 order by employee_id, week_index`,
      [year, month]
    ),
    query<NapiHaviRow>(
      `select id::text, employee_id::text, year, month, days_count, utalas, eloleg, letiltas, uzemanyag, paid, paid_at, paid_by
       from alkalmazott_napi_havi_ber where year = $1 and month = $2`,
      [year, month]
    ),
  ]);
  // Csak azok a dolgozók, akiknek ebben a hónapban ténylegesen volt sora
  // (egy azóta felvett dolgozó ne jelenjen meg egy régebbi archív hónapban).
  const employeeIds = new Set([...weekly.map((r) => r.employee_id), ...napiHavi.map((r) => r.employee_id)]);
  return { year, month, employees: employees.filter((e) => employeeIds.has(e.id)), weekly, napiHavi };
}
