import "server-only";
import { requireSession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";

export async function requireEditPermission(module: ModuleKey): Promise<void> {
  const session = await requireSession();
  if (!session.can(module).edit) {
    throw new Error(
      `Nincs szerkesztési jogosultságod ehhez a modulhoz: ${module}`
    );
  }
}

export async function requireViewPermission(module: ModuleKey): Promise<void> {
  const session = await requireSession();
  if (!session.can(module).view) {
    throw new Error(
      `Nincs megtekintési jogosultságod ehhez a modulhoz: ${module}`
    );
  }
}
