import "server-only";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";

// Jogosultság-ellenőrzés route handler-ekhez. A requireSession/
// requireEditPermission páros itt nem használható: az bejelentkezési
// átirányítást dob, amiből egy API-hívó 401 helyett egy HTML-oldalt vagy egy
// NEXT_REDIRECT-hibát kapna.
//
// Azért is kell, mert a proxy.ts matchere ("/((?!api|...))") az /api
// útvonalakat kihagyja a süti-alapú kapuból — a route handler-ek tehát csak
// attól védettek, amit maguk ellenőriznek.
//
// Használat a handler első soraiban:
//   const tiltas = await apiViewGuard("fuvarozas");
//   if (tiltas) return tiltas;

async function guard(module: ModuleKey, jog: "view" | "edit") {
  const session = await verifySession();
  if (!session.isAuth) {
    return NextResponse.json({ hiba: "Bejelentkezés szükséges." }, { status: 401 });
  }
  if (!session.can(module)[jog]) {
    return NextResponse.json(
      { hiba: `Nincs jogosultságod ehhez a modulhoz: ${module}` },
      { status: 403 }
    );
  }
  return null;
}

/** Olvasó végpontokhoz. Visszatérési értéke a hibaválasz, vagy null, ha a hívás mehet tovább. */
export function apiViewGuard(module: ModuleKey) {
  return guard(module, "view");
}

/** Író végpontokhoz. Visszatérési értéke a hibaválasz, vagy null, ha a hívás mehet tovább. */
export function apiEditGuard(module: ModuleKey) {
  return guard(module, "edit");
}

// Egy végpontot több modulkulcs is feljogosíthat: a teljes modul (pl.
// "fuvarozas") vagy az önálló, korlátozott mobil nézeté (pl.
// "fuvarozas_sajat") — lásd requireAnyViewPermission a szerver-akciókhoz.
export async function apiAnyViewGuard(modules: ModuleKey[]) {
  const session = await verifySession();
  if (!session.isAuth) {
    return NextResponse.json({ hiba: "Bejelentkezés szükséges." }, { status: 401 });
  }
  if (modules.some((m) => session.can(m).view)) return null;
  return NextResponse.json(
    { hiba: `Nincs jogosultságod ehhez: ${modules.join(" / ")}` },
    { status: 403 }
  );
}
