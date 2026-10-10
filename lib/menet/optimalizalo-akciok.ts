"use server";

// Optimalizáló (4. fázis) — szerver-akciók a Menetterv panelhez és a
// Tervezés döntés-sávjához. Minden export jogosultságot ellenőriz
// (scripts/teszt-akcio-jogok.ts): az írás (optimalizálás → javaslat-sor,
// elfogadás, elutasítás) a fuvarozás szerkesztési, a hozzárendelés-javaslat
// (csak számol, nem ír) a megtekintési jogával.
//
// CSAK JAVASLAT: jóváhagyott menetet kizárólag az „Elfogadás” rendez át, a
// meglévő átrendezés-úton (lib/menet/optimalizalo-szerver.ts).

import { requireEditPermission, requireViewPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { toroljIdovonalCachet } from "@/lib/fuvarozas/idovonal-cache";
import {
  elfogadJavaslatot,
  elutasitJavaslatot,
  hozzarendelesJavaslat as hozzarendelesSzamitas,
  optimalizalMenetet,
  type HozzarendelesNezet,
  type OptimalizalasEredmeny,
} from "@/lib/menet/optimalizalo-szerver";
import type { Valasz } from "@/lib/menet/muveletek";

async function kiVagyok(): Promise<string> {
  const s = await requireSession();
  return s.name ?? s.username;
}

/** Egy menet sorrend-optimalizálása → nyitott javaslat (ha megéri). */
export async function optimalizalas(menetId: string): Promise<Valasz<OptimalizalasEredmeny>> {
  await requireEditPermission("fuvarozas");
  try {
    return await optimalizalMenetet(menetId);
  } catch (err) {
    console.error("[optimalizalo] optimalizálás hiba:", err);
    return { ok: false, hiba: "Nem sikerült az optimalizálás (a javaslat-tábla megvan? migráció 033)." };
  }
}

/** Elfogadás: jóváhagyott menetnél átrendezés (verzióval, indokkal, naplóval); javaslat-menetnél újragenerálás ebben a sorrendben. */
export async function elfogad(javaslatId: string): Promise<Valasz<{ uzenet: string }>> {
  await requireEditPermission("fuvarozas");
  const r = await elfogadJavaslatot(javaslatId, await kiVagyok());
  if (r.ok) toroljIdovonalCachet();
  return r;
}

/** Elutasítás: a javaslat 'elutasitva', a menet nem változik. */
export async function elutasit(javaslatId: string): Promise<Valasz> {
  await requireEditPermission("fuvarozas");
  return elutasitJavaslatot(javaslatId, await kiVagyok());
}

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
