"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/auth/session";
import { checkLoginAttempt, recordLoginAttempt } from "@/lib/auth/rate-limit";

export type LoginState = {
  error?: string;
} | null;

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: string;
  active: boolean;
};

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Add meg a felhasználóneved és a jelszavad." };
  }

  const rateLimitCheck = checkLoginAttempt(username);
  if (!rateLimitCheck.allowed) {
    return { error: rateLimitCheck.error };
  }

  const rows = await query<UserRow>(
    `select id, username, password_hash, name, role, active
     from users
     where lower(username) = lower($1)`,
    [username]
  );
  const user = rows[0];

  if (!user || !user.active) {
    recordLoginAttempt(username, false);
    return { error: "Hibás felhasználónév vagy jelszó." };
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    recordLoginAttempt(username, false);
    return { error: "Hibás felhasználónév vagy jelszó." };
  }

  recordLoginAttempt(username, true);
  await createSession(user.id, user.name);

  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
