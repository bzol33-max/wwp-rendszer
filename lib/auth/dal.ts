import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  resolvePermission,
  type ModuleKey,
  type Permissions,
} from "@/lib/auth/permissions";

// Data Access Layer — a Next.js 16 auth-útmutató mintája szerint (lásd
// node_modules/next/dist/docs/01-app/02-guides/authentication.md). Minden
// szerver oldali kódnak EZEN keresztül kell ellenőriznie a bejelentkezést
// és a jogosultságokat, nem a proxy.ts-en keresztül (az csak optimista,
// süti-alapú átirányítás). A user-sort minden kérésnél frissen olvassuk be
// (React cache()-szel kérésen belül gyorsítótárazva) — így egy admin által
// módosított jogosultság vagy inaktiválás azonnal érvényesül, új
// bejelentkezés nélkül is.

type UserRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  permissions: Permissions;
  employee_id: string | null;
};

export const verifySession = cache(async () => {
  const payload = await getSessionPayload();
  if (!payload?.userId) {
    return { isAuth: false as const };
  }

  const rows = await query<UserRow>(
    `select id, username, name, role, active, permissions, employee_id::text as employee_id
     from users where id = $1`,
    [payload.userId]
  );
  const user = rows[0];
  if (!user || !user.active) {
    return { isAuth: false as const };
  }

  return {
    isAuth: true as const,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    employeeId: user.employee_id,
    can: (module: ModuleKey) => resolvePermission(user.role, user.permissions, module),
  };
});

// Csak azokban a Server Component-ekben / route handler-ekben használandó,
// ahol a bejelentkezés kötelező — ha nincs érvényes munkamenet, a
// felhasználó a bejelentkezési oldalra kerül.
export async function requireSession() {
  const session = await verifySession();
  if (!session.isAuth) {
    redirect("/login");
  }
  return session;
}

// Csak admin szerepkörű felhasználóknak — a Felhasználók kezelőfelület és a
// hozzá tartozó szerver akciók védelmére.
export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "admin") {
    redirect("/");
  }
  return session;
}
