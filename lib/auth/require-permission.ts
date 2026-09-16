import "server-only";
import { requireSession } from "@/lib/auth/dal";
import { rendszerFutasban } from "@/lib/auth/system-context";
import {
  hatokorEngedTelephelyet,
  sajatHatokor,
  teljesHatokor,
  type ModuleKey,
  type ModulePermission,
} from "@/lib/auth/permissions";

// Az ütemezőkből és a hitelesített cron-végpontból indított hívások mögött
// nincs munkamenet, a requireSession pedig ilyenkor a bejelentkezésre
// irányítana át — lásd lib/auth/system-context.ts.
//
// A jogosultság két kérdésre válaszol: MIT szabad (view / edit) és MEKKORA
// részére a modulnak (hatókör, ld. lib/auth/permissions.ts ModuleScope).
// Ezért az őrök három csoportba esnek:
//
//   requireViewPermission / requireEditPermission
//       — a jog megléte számít, a hatókör nem (pl. a mindenkinek szóló
//         feladatlista)
//   requireTeljesViewPermission / requireTeljesEditPermission
//       — az egész modulra kiható művelet, tehát teljes hatókör kell
//         (pl. az összkészlet vagy a bértörzs lekérdezése)
//   requireTelephelyViewPermission / requireTelephelyEditPermission
//   requireSajatVagyTeljesJog
//       — hatókörhöz kötött művelet: a szűkített jog is elég, ha a kért
//         telephely / alkalmazott beleesik a hatókörbe

function hiba(kind: "view" | "edit", mit: string): never {
  const szo = kind === "edit" ? "szerkesztési" : "megtekintési";
  throw new Error(`Nincs ${szo} jogosultságod ehhez: ${mit}`);
}

/**
 * A hívó feloldott joga a modulra, vagy null, ha rendszer-kontextusban
 * futunk (nincs munkamenet). A hívó ez alapján szűkítheti az EREDMÉNYT is,
 * nem csak engedhet/tilthat — pl. "sajat" hatókörnél csak a saját sorokat
 * adja vissza.
 */
export async function modulJog(module: ModuleKey): Promise<ModulePermission | null> {
  return jog(module);
}

async function jog(module: ModuleKey): Promise<ModulePermission | null> {
  if (rendszerFutasban()) return null;
  const session = await requireSession();
  return session.can(module);
}

export async function requireViewPermission(module: ModuleKey): Promise<void> {
  const p = await jog(module);
  if (p && !p.view) hiba("view", module);
}

export async function requireEditPermission(module: ModuleKey): Promise<void> {
  const p = await jog(module);
  if (p && !p.edit) hiba("edit", module);
}

export async function requireTeljesViewPermission(module: ModuleKey): Promise<void> {
  const p = await jog(module);
  if (!p) return;
  if (!p.view || !teljesHatokor(p)) hiba("view", `${module} (teljes hatókör)`);
}

export async function requireTeljesEditPermission(module: ModuleKey): Promise<void> {
  const p = await jog(module);
  if (!p) return;
  if (!p.edit || !teljesHatokor(p)) hiba("edit", `${module} (teljes hatókör)`);
}

async function requireTelephely(
  module: ModuleKey,
  kind: "view" | "edit",
  sites: (string | undefined)[]
): Promise<void> {
  const p = await jog(module);
  if (!p) return;
  if (!p[kind]) hiba(kind, module);
  for (const site of sites) {
    if (site && !hatokorEngedTelephelyet(p, site)) {
      hiba(kind, `${module} — ${site} telephely`);
    }
  }
}

export function requireTelephelyViewPermission(
  module: ModuleKey,
  ...sites: (string | undefined)[]
): Promise<void> {
  return requireTelephely(module, "view", sites);
}

export function requireTelephelyEditPermission(
  module: ModuleKey,
  ...sites: (string | undefined)[]
): Promise<void> {
  return requireTelephely(module, "edit", sites);
}

// Alkalmazotthoz kötött művelet: az azonosító a kliensről érkezik, ezért nem
// elég jogot ellenőrizni, azt is meg kell követelni, hogy a hatókörébe essen.
// Teljes hatókörrel bárkiét, "sajat" hatókörrel csak a sajátját.
export async function requireSajatVagyTeljesJog(input: {
  employeeId: string;
  modul: ModuleKey;
  kind: "view" | "edit";
}): Promise<void> {
  if (rendszerFutasban()) return;
  const session = await requireSession();
  const p = session.can(input.modul);
  if (!p[input.kind]) hiba(input.kind, input.modul);
  if (teljesHatokor(p)) return;
  if (sajatHatokor(p) && session.employeeId && session.employeeId === input.employeeId) {
    return;
  }
  hiba(input.kind, `${input.modul} — másik alkalmazott (${input.employeeId})`);
}
