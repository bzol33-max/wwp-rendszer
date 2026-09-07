"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { MODULES, type Permissions } from "@/lib/auth/permissions";

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
};

export async function listUsers(): Promise<UserRow[]> {
  await requireAdmin();
  return query<UserRow>(
    `select id, username, name, role, active, permissions, created_at
     from users
     order by created_at asc`
  );
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
  role: "admin" | "felhasznalo";
  permissions: unknown;
}) {
  await requireAdmin();

  const username = input.username.trim();
  const name = input.name.trim();
  if (!username || !name) throw new Error("A felhasználónév és a név megadása kötelező.");
  if (!input.password || input.password.length < 6) {
    throw new Error("A jelszónak legalább 6 karakternek kell lennie.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const permissions = input.role === "admin" ? {} : normalizePermissions(input.permissions);

  await query(
    `insert into users (username, password_hash, name, role, permissions)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [username, passwordHash, name, input.role, JSON.stringify(permissions)]
  );

  revalidatePath("/beallitasok/felhasznalok");
}

export async function updateUserBasic(input: {
  id: string;
  name: string;
  role: "admin" | "felhasznalo";
  active: boolean;
}) {
  await requireAdmin();

  const name = input.name.trim();
  if (!name) throw new Error("A név megadása kötelező.");

  await query(
    `update users set name = $2, role = $3, active = $4 where id = $1`,
    [input.id, name, input.role, input.active]
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
