"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// A bejelentkezéskor (lib/auth/session.ts:createSession) beállított,
// NEM httpOnly "wwp_user" süti csak a megjelenítendő nevet tartalmazza —
// ez teszi lehetővé, hogy a kliens komponensek szinkron módon "belyegezzék"
// a rögzített tételeket a bejelentkezett felhasználó nevével, anélkül hogy
// mindegyiknek szerver oldali munkamenet-lekérdezést kellene indítania.
// Jogosultsági döntés ebből SOHA nem származhat — arra a szerver oldali
// lib/auth/dal.ts:verifySession() szolgál.
function readDisplayCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)wwp_user=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function getCurrentUser(): string {
  return readDisplayCookie();
}

// Kliens komponensekben, ahol a névnek reaktívan (pl. bejelentkezés/
// kijelentkezés után újrarenderelve) is meg kell jelennie.
export function useCurrentUserName(): string {
  const pathname = usePathname();
  const [name, setName] = useState("");
  useEffect(() => {
    setName(readDisplayCookie());
  }, [pathname]);
  return name;
}
