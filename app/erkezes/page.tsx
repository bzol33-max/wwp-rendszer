import { requireSession } from "@/lib/auth/dal";
import { ErkezesSajatView } from "@/components/erkezes/erkezes-sajat-view";

export default async function ErkezesPage() {
  const session = await requireSession();

  if (!session.can("erkezes").view || !session.employeeId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-1 p-4 text-center">
        <p className="text-sm font-medium">Nincs jogosultságod ehhez a nézethez.</p>
        <p className="text-xs text-muted-foreground">
          Ha úgy gondolod, hogy hozzá kellene férned, keresd meg az adminisztrátort.
        </p>
      </div>
    );
  }

  return (
    <ErkezesSajatView
      employeeId={session.employeeId}
      employeeName={session.name}
      role={session.role}
      keszletPermission={session.can("keszlet_sajat")}
      fuvarozasPermission={session.can("fuvarozas_sajat")}
      elolegekPermission={session.can("elolegek_sajat")}
    />
  );
}
