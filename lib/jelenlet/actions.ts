"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import type {
  Feladat,
  JelenletEmployee,
  JelenletRow,
  RepeatFreq,
  Site,
} from "@/lib/jelenlet/shared";

// --- Jelenlét (érkezés/távozás) ---

export async function getJelenletEmployees(): Promise<JelenletEmployee[]> {
  return query<JelenletEmployee>(
    `select id::text, name from alkalmazottak
     where jelenlet_aktiv = true and active = true
     order by position, id`
  );
}

export async function getTodayJelenletek(): Promise<JelenletRow[]> {
  return query<JelenletRow>(
    `select id::text, employee_id::text, to_char(work_date, 'YYYY-MM-DD') as work_date,
       to_char(arrival_time, 'HH24:MI') as arrival_time,
       to_char(departure_time, 'HH24:MI') as departure_time
     from jelenletek
     where work_date = current_date`
  );
}

export async function getJelenletHistory(
  employeeId: string,
  days = 14
): Promise<JelenletRow[]> {
  return query<JelenletRow>(
    `select id::text, employee_id::text, to_char(work_date, 'YYYY-MM-DD') as work_date,
       to_char(arrival_time, 'HH24:MI') as arrival_time,
       to_char(departure_time, 'HH24:MI') as departure_time
     from jelenletek
     where employee_id = $1 and work_date >= current_date - $2::int
     order by work_date desc`,
    [employeeId, days]
  );
}

export async function saveJelenlet(input: {
  employeeId: string;
  workDate: string;
  arrivalTime: string | null;
  departureTime: string | null;
}) {
  await query(
    `insert into jelenletek (employee_id, work_date, arrival_time, departure_time)
     values ($1, $2, $3, $4)
     on conflict (employee_id, work_date)
     do update set arrival_time = excluded.arrival_time, departure_time = excluded.departure_time`,
    [input.employeeId, input.workDate, input.arrivalTime, input.departureTime]
  );
  revalidatePath("/jelenlet");
}

// --- Feladatok (üzenőfal) ---

export async function getSites(): Promise<Site[]> {
  return query<Site>(`select id, name from sites order by id`);
}

export async function listFeladatok(): Promise<Feladat[]> {
  return query<Feladat>(
    `select f.id::text, to_char(f.task_date, 'YYYY-MM-DD') as task_date, f.site_id,
       s.name as site_name, f.description, f.urgency, f.repeat_freq, f.done,
       f.created_by, f.created_at
     from feladatok f
     join sites s on s.id = f.site_id
     order by f.done asc, f.urgency asc, f.task_date desc, f.id desc`
  );
}

export async function createFeladat(input: {
  taskDate: string;
  siteId: number;
  description: string;
  urgency: number;
  repeatFreq: RepeatFreq;
  createdBy?: string;
}) {
  const description = input.description.trim();
  if (!description) throw new Error("A feladat leírása kötelező.");
  if (input.urgency < 1 || input.urgency > 5) {
    throw new Error("A sürgősség 1 és 5 között lehet.");
  }
  await query(
    `insert into feladatok (task_date, site_id, description, urgency, repeat_freq, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.taskDate,
      input.siteId,
      description,
      input.urgency,
      input.repeatFreq,
      input.createdBy ?? null,
    ]
  );
  revalidatePath("/jelenlet");
}

export async function toggleFeladatDone(id: string, done: boolean) {
  await query(`update feladatok set done = $2 where id = $1`, [id, done]);
  revalidatePath("/jelenlet");
}

export async function deleteFeladat(id: string) {
  await query(`delete from feladatok where id = $1`, [id]);
  revalidatePath("/jelenlet");
}
