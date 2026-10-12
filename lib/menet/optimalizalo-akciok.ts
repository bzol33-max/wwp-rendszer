"use server";

// Optimalizáló — szerver-akció a Tervezés döntés-sávjához: a bejövő
// bérfuvarhoz a legjobb kocsi (csak számol, nem ír; megtekintési jog,
// scripts/teszt-akcio-jogok.ts). 2026-10-12: a Menetterv panel megszűnt,
// vele az optimalizálás / elfogadás / elutasítás akciói is.

import { requireViewPermission } from "@/lib/auth/require-permission";
import {
  hozzarendelesJavaslat as hozzarendelesSzamitas,
  type HozzarendelesNezet,
} from "@/lib/menet/optimalizalo-szerver";
import type { Valasz } from "@/lib/menet/muveletek";

/** Bejövő bérfuvar: a legjobb kocsi, hely és határköltség (nem ír semmit). */
export async function hozzarendelesJavaslat(megbizasId: string): Promise<Valasz<HozzarendelesNezet>> {
  await requireViewPermission("fuvarozas");
  try {
    return await hozzarendelesSzamitas(megbizasId);
  } catch (err) {
    console.error("[optimalizalo] hozzárendelés hiba:", err);
    return { ok: false, hiba: "Nem sikerült a kocsi-javaslat." };
  }
}
