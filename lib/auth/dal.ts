import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/auth/session";

// Data Access Layer — a Next.js 16 auth-útmutató mintája szerint (lásd
// node_modules/next/dist/docs/01-app/02-guides/authentication.md). Minden
// szerver oldali kódnak EZEN keresztül kell ellenőriznie a bejelentkezést,
// nem a proxy.ts-en keresztül (az csak optimista, süti-alapú átirányítás).
export const verifySession = cache(async () => {
  const payload = await getSessionPayload();
  if (!payload?.userId) {
    return { isAuth: false as const };
  }
  return {
    isAuth: true as const,
    userId: payload.userId,
    username: payload.username,
    name: payload.name,
    role: payload.role,
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
