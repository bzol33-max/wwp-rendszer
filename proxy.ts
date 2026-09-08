import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";
import { isMobileUserAgent } from "@/lib/device";

// Optimista (süti-alapú, adatbázist NEM érintő) bejelentkezés-ellenőrzés —
// lásd node_modules/next/dist/docs/01-app/02-guides/authentication.md
// "Optimistic checks with Proxy" szakaszát. A valódi, megbízható ellenőrzés
// mindig a szerver oldali lib/auth/dal.ts:verifySession()-ön keresztül
// történik; ez a proxy csak arra való, hogy be nem jelentkezett felhasználó
// ne is lássa az alkalmazás felületét, és bejelentkezett felhasználó ne
// lássa a bejelentkezési oldalt.
const PUBLIC_ROUTES = ["/login"];

// NEM httpOnly süti a kérés User-Agent-jéből (lib/device.ts) érzékelt
// eszköztípusról — ugyanaz a minta, mint a "wwp_user" kijelző sütinél
// (lib/auth/session.ts): kliens komponensek (lib/current-device.ts)
// szinkron módon olvashatják, de jogosultsági/megjelenítési KÉNYSZERÍTŐ
// döntés ebből SOHA nem származhat — legfeljebb alapértelmezett nézet
// javaslására való (pl. egy majdani felhasználónkénti felülbírálás
// kiindulópontjaként).
const DEVICE_COOKIE_NAME = "wwp_device";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.includes(path);

  const cookie = req.cookies.get("wwp_session")?.value;
  const session = await decrypt(cookie);

  if (!isPublicRoute && !session?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session?.userId) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  const response = NextResponse.next();

  const detectedDevice = isMobileUserAgent(req.headers.get("user-agent"))
    ? "mobile"
    : "desktop";
  if (req.cookies.get(DEVICE_COOKIE_NAME)?.value !== detectedDevice) {
    response.cookies.set(DEVICE_COOKIE_NAME, detectedDevice, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
