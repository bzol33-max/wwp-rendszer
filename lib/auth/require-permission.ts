import "server-only";
import { requireSession } from "@/lib/auth/dal";
import { rendszerFutasban } from "@/lib/auth/system-context";
import type { ModuleKey } from "@/lib/auth/permissions";

// Az ütemezőkből és a hitelesített cron-végpontból indított hívások mögött
// nincs munkamenet, a requireSession pedig ilyenkor a bejelentkezésre
// irányítana át — lásd lib/auth/system-context.ts.

export async function requireEditPermission(module: ModuleKey): Promise<void> {
  if (rendszerFutasban()) return;
  const session = await requireSession();
  if (!session.can(module).edit) {
    throw new Error(
      `Nincs szerkesztési jogosultságod ehhez a modulhoz: ${module}`
    );
  }
}

export async function requireViewPermission(module: ModuleKey): Promise<void> {
  if (rendszerFutasban()) return;
  const session = await requireSession();
  if (!session.can(module).view) {
    throw new Error(
      `Nincs megtekintési jogosultságod ehhez a modulhoz: ${module}`
    );
  }
}

// Egy akciót több modulkulcs is feljogosíthat: a teljes értékű modul (pl.
// "keszlet"), vagy az önálló, korlátozott mobil nézeté (pl. "keszlet_sajat").
// A visszatérési érték az a kulcs, ami a hívást engedte — a hívó ez alapján
// szűkítheti a hatókört (pl. az önkiszolgáló jog csak bizonyos telephelyekre
// érvényes). A sorrend számít: a teljes modult kell előre venni, hogy annak
// birtokosa ne essen a szűkített ágra.

async function requireAny(
  modules: ModuleKey[],
  kind: "view" | "edit"
): Promise<ModuleKey> {
  if (rendszerFutasban()) return modules[0];
  const session = await requireSession();
  for (const kulcs of modules) {
    if (session.can(kulcs)[kind]) return kulcs;
  }
  const mit = kind === "edit" ? "szerkesztési" : "megtekintési";
  throw new Error(
    `Nincs ${mit} jogosultságod ehhez: ${modules.join(" / ")}`
  );
}

export function requireAnyViewPermission(modules: ModuleKey[]): Promise<ModuleKey> {
  return requireAny(modules, "view");
}

export function requireAnyEditPermission(modules: ModuleKey[]): Promise<ModuleKey> {
  return requireAny(modules, "edit");
}

// A dolgozói mobil nézet (/erkezes) saját lekérdezéseihez: az alkalmazott
// azonosítója a kliensről érkezik, ezért nem elég jogot ellenőrizni, azt is
// meg kell követelni, hogy a saját sorát kérje. Aki a teljes modult látja
// (pl. a Dolgozók modul kezelője vagy az admin), az másét is lekérdezheti.
export async function requireSajatVagyModulJog(input: {
  employeeId: string;
  /** Az önkiszolgáló jog, ami csak a SAJÁT sorra érvényes. */
  sajatModule: ModuleKey;
  /** A teljes modul, aminek birtokosa bárkiét lekérdezheti. */
  modul: ModuleKey;
  kind: "view" | "edit";
}): Promise<void> {
  if (rendszerFutasban()) return;
  const session = await requireSession();
  if (session.can(input.modul)[input.kind]) return;
  if (
    session.employeeId &&
    session.employeeId === input.employeeId &&
    session.can(input.sajatModule)[input.kind]
  ) {
    return;
  }
  const mit = input.kind === "edit" ? "szerkesztési" : "megtekintési";
  throw new Error(
    `Nincs ${mit} jogosultságod ehhez az alkalmazotthoz: ${input.employeeId}`
  );
}
