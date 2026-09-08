"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// A proxy.ts a kérés User-Agent-je alapján (lib/device.ts) minden
// kéréskor beállítja a NEM httpOnly "wwp_device" sütit ("mobile" vagy
// "desktop") — lásd ott a részletes indoklást. Csak megjelenítési célra
// (pl. alapértelmezett nézet eldöntésére) használható, jogosultsági
// döntés ebből SOHA nem származhat.
function readDeviceCookie(): "mobile" | "desktop" {
  if (typeof document === "undefined") return "desktop";
  const match = document.cookie.match(/(?:^|;\s*)wwp_device=([^;]*)/);
  return match && decodeURIComponent(match[1]) === "mobile"
    ? "mobile"
    : "desktop";
}

export function getIsMobileDevice(): boolean {
  return readDeviceCookie() === "mobile";
}

// Kliens komponensekben, ahol a reaktivitás (pl. útvonalváltás utáni
// újrarenderelés) is kell.
export function useIsMobileDevice(): boolean {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(readDeviceCookie() === "mobile");
  }, [pathname]);
  return isMobile;
}
