import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Stateless (JWT) munkamenet-kezelés a Next.js 16 hivatalos auth-útmutatója
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md) alapján.
// A "wwp_session" süti httpOnly + secure + sameSite=lax, csak a szerver
// olvassa (verifySession / DAL) — SZÁNDÉKOSAN csak a userId-t tartalmazza,
// hogy a név/szerepkör/jogosultság mindig FRISS, adatbázisból olvasott
// legyen (lib/auth/dal.ts), ne a bejelentkezéskori (esetleg már elavult)
// állapotot tükrözze, ha időközben egy admin módosítja a jogosultságokat.
//
// A "wwp_user" süti NEM httpOnly, csak a megjelenítendő nevet tartalmazza —
// ez teszi lehetővé, hogy a kliens komponensek (lib/current-user.ts)
// szinkron módon hozzáférjenek a bejelentkezett felhasználó nevéhez anélkül,
// hogy minden helyen szerver oldali lekérdezést kellene indítani.
// Jogosultsági döntés SOHA nem alapulhat a "wwp_user" sütin.

export type SessionPayload = {
  userId: string;
};

const COOKIE_NAME = "wwp_session";
const DISPLAY_COOKIE_NAME = "wwp_user";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 nap

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Hiányzik a SESSION_SECRET környezeti változó — bejelentkezés nem lehetséges nélküle."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

export async function decrypt(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload & { exp: number; iat: number };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, displayName: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await encrypt({ userId }, expiresAt);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  cookieStore.set(DISPLAY_COOKIE_NAME, displayName, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(DISPLAY_COOKIE_NAME);
}

export async function getSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decrypt(token);
}
