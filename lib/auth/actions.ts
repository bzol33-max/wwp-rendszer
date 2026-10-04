"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/auth/session";

const HIBA_KORLAT = 8;
/** Érvényes formájú bcrypt-hash (cost 12), amihez nincs jelszó — csak az időzítés kiegyenlítésére. */
const AL_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8.vf0F/YoJ3Ko0P2DSCvM8Jx.nHEyW";

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
  session_verzio: number;
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

  // Jelszó-próbálgatás fékezése (audit 2026-10-04, SEC-6): felhasználónevenként
  // 15 percen belül legfeljebb HIBA_KORLAT sikertelen kísérlet.
  const [{ db }] = await query<{ db: number }>(
    `select count(*)::int as db from bejelentkezes_hiba
     where lower(felhasznalo) = lower($1) and mikor > now() - interval '15 minutes'`,
    [username]
  );
  if (db >= HIBA_KORLAT) {
    return { error: "Túl sok sikertelen próbálkozás. Várj 15 percet, vagy szólj Zoltánnak." };
  }

  const rows = await query<UserRow>(
    `select id, username, password_hash, name, role, active, session_verzio
     from users
     where lower(username) = lower($1)`,
    [username]
  );
  const user = rows[0];

  // A bcrypt-összevetés nem létező vagy letiltott fióknál is lefut (egy
  // érvénytelen hash ellen): a válaszidőből így nem derül ki, hogy a
  // felhasználónév létezik-e.
  const passwordOk = await bcrypt.compare(password, user?.active ? user.password_hash : AL_HASH);
  if (!user || !user.active || !passwordOk) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await query(`insert into bejelentkezes_hiba (felhasznalo, ip) values ($1, $2)`, [username, ip]);
    return { error: "Hibás felhasználónév vagy jelszó." };
  }

  await createSession(user.id, user.name, user.session_verzio);

  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
