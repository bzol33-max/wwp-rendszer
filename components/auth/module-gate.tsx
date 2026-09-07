import { requireSession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";
import { EditPermissionProvider } from "@/components/auth/edit-permission-context";

// Szerver oldali "kapu" egy-egy modul (route) elé: bejelentkezést kötelezővé
// tesz (requireSession — átirányít /login-ra, ha nincs munkamenet), majd
// ellenőrzi a modul megtekintési jogát. Ha nincs jog, nem jelenik meg a
// tartalom, csak egy tájékoztató üzenet. A szerkesztési jogot a gyerek
// komponensek felé egy React Context-en keresztül adja tovább
// (useCanEdit()), hogy a formok/gombok ez alapján tudják magukat
// letiltani/elrejteni.
export async function ModuleGate({
  module,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const { view, edit } = session.can(module);

  if (!view) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">Nincs jogosultságod ehhez a modulhoz.</p>
        <p className="text-xs text-muted-foreground">
          Ha úgy gondolod, hogy hozzá kellene férned, keresd meg az adminisztrátort.
        </p>
      </div>
    );
  }

  return <EditPermissionProvider canEdit={edit}>{children}</EditPermissionProvider>;
}
