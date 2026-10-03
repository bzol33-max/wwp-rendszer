"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { MODULES, type Permissions } from "@/lib/auth/permissions";
import { normalizeRole, type Role } from "@/lib/auth/roles";

// Minden ebben a fájlban lévő akció admin-jogosultsághoz kötött
// (requireAdmin — átirányít, ha a hívó nem admin). Ez a Felhasználók
// (app/beallitasok/felhasznalok) oldal szerver oldali logikája: felhasználók
// listázása, létrehozása, alap adatainak / jelszavának / aktív állapotának
// módosítása, és a modulonkénti megtekintési/szerkesztési jogok beállítása.

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  permissions: Permissions;
  created_at: string;
  /** A hozzárendelt dolgozó (alkalmazottak) sora, ha van — lásd assignEmployee. */
  employee_id: string | null;
  employee_name: string | null;
  /**
   * Nincs használható jelszava: a tárolt érték nem bcrypt-lenyomat, tehát
   * semmilyen beírt jelszóval nem lehet belépni. Így keletkezik a migrációval
   * előkészített fiók (db/migrations/016), aminek a tulajdonosa még nem adott
   * jelszót. A felület ezért figyelmeztet, hogy a fiók félig kész —
   * különben csak annyi látszik, hogy „nem lehet belépni”.
   */
  jelszo_hianyzik: boolean;
};

export async function listUsers(): Promise<UserRow[]> {
  await requireAdmin();
  return query<UserRow>(
    `select u.id, u.username, u.name, u.role, u.active, u.permissions, u.created_at,
       u.employee_id::text as employee_id, a.name as employee_name,
       -- A bcrypt-lenyomat 60 karakter és "$"-ra kezdődik; bármi más nem
       -- jelszó. (Nem "$2%"-ra illesztünk, hogy a dollár-jel semmilyen
       -- paraméter-feldolgozóval ne keveredjen össze.)
       (length(u.password_hash) < 60 or left(u.password_hash, 1) <> '$') as jelszo_hianyzik
     from users u
     left join alkalmazottak a on a.id = u.employee_id
     order by u.created_at asc`
  );
}

/**
 * A dolgozó-választó tartalma. A mobil nézetek (/erkezes, Profil, jelenlét,
 * előlegek) a users.employee_id-ból tudják, kinek a sorát írják — ezt eddig
 * csak migrációval lehetett beállítani, ezért maradt összekötetlen például
 * Oszlánszki Tamás fiókja.
 */
export async function listEmployeeOptions(): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  return query<{ id: string; name: string }>(
    `select id::text, name from alkalmazottak where active order by position, id`
  );
}

/** Üres/"nincs" választás esetén null, egyébként a dolgozó azonosítója. */
function normalizeEmployeeId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim();
  return t === "" || t === "-" ? null : t;
}

function normalizePermissions(input: unknown): Permissions {
  const result: Permissions = {};
  if (!input || typeof input !== "object") return result;
  for (const mod of MODULES) {
    const entry = (input as Record<string, unknown>)[mod.key];
    if (entry && typeof entry === "object") {
      const view = Boolean((entry as { view?: unknown }).view);
      const edit = Boolean((entry as { edit?: unknown }).edit);
      result[mod.key] = { view, edit: view && edit };
    }
  }
  return result;
}

export async function createUser(input: {
  username: string;
  password: string;
  name: string;
  role: Role;
  permissions: unknown;
  employeeId?: string | null;
}) {
  await requireAdmin();
  const role = normalizeRole(input.role);
  const employeeId = normalizeEmployeeId(input.employeeId);

  const username = input.username.trim();
  const name = input.name.trim();
  if (!username || !name) throw new Error("A felhasználónév és a név megadása kötelező.");
  if (!input.password || input.password.length < 6) {
    throw new Error("A jelszónak legalább 6 karakternek kell lennie.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const permissions = role === "admin" ? {} : normalizePermissions(input.permissions);

  await query(
    `insert into users (username, password_hash, name, role, permissions, employee_id)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [username, passwordHash, name, role, JSON.stringify(permissions), employeeId]
  );

  revalidatePath("/beallitasok/felhasznalok");
}

export async function updateUserBasic(input: {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  employeeId?: string | null;
}) {
  await requireAdmin();

  const name = input.name.trim();
  if (!name) throw new Error("A név megadása kötelező.");
  const role = normalizeRole(input.role);
  const employeeId = normalizeEmployeeId(input.employeeId);

  await query(
    `update users set name = $2, role = $3, active = $4, employee_id = $5 where id = $1`,
    [input.id, name, role, input.active, employeeId]
  );

  revalidatePath("/beallitasok/felhasznalok");
}

export async function updateUserPermissions(input: { id: string; permissions: unknown }) {
  await requireAdmin();
  const permissions = normalizePermissions(input.permissions);

  await query(`update users set permissions = $2::jsonb where id = $1`, [
    input.id,
    JSON.stringify(permissions),
  ]);

  revalidatePath("/beallitasok/felhasznalok");
}

export async function resetUserPassword(input: { id: string; password: string }) {
  await requireAdmin();
  if (!input.password || input.password.length < 6) {
    throw new Error("A jelszónak legalább 6 karakternek kell lennie.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await query(`update users set password_hash = $2 where id = $1`, [input.id, passwordHash]);

  revalidatePath("/beallitasok/felhasznalok");
}

export async function deleteUser(input: { id: string }) {
  const session = await requireAdmin();
  if (session.userId === input.id) {
    throw new Error("A saját fiókodat nem törölheted.");
  }

  await query(`delete from users where id = $1`, [input.id]);
  revalidatePath("/beallitasok/felhasznalok");
}
