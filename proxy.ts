import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth/session";

// Optimista (süti-alapú, adatbázist NEM érintő) bejelentkezés-ellenőrzés —
// lásd node_modules/next/dist/docs/01-app/02-guides/authentication.md
// "Optimistic checks with Proxy" szakaszát. A valódi, megbízható ellenőrzés
// mindig a szerver oldali lib/auth/dal.ts:verifySession()-ön keresztül
// történik; ez a proxy csak arra való, hogy be nem jelentkezett felhasználó
// ne is lássa az alkalmazás felületét, és bejelentkezett felhasználó ne
// lássa a bejelentkezési oldalt.
const PUBLIC_ROUTES = ["/login"];

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
