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
