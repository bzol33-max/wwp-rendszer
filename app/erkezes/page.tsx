import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/dal";
import { sajatHatokor } from "@/lib/auth/permissions";
import { ErkezesSajatView } from "@/components/erkezes/erkezes-sajat-view";

export default async function ErkezesPage() {
  const session = await requireSession();

  // A dolgozói mobil nézet a Jelenléti modul "sajat" hatókörű jogához
  // tartozik (korábban külön "erkezes" kulcs volt — ld. a hatókör-átállást).
  const jelenlet = session.can("jelenlet");
  if (!jelenlet.view || !sajatHatokor(jelenlet) || !session.employeeId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Saját érkezés"
          subtitle="Dolgozói mobil nézet — bejelentkezés, feladatok, előlegek"
        />
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-amber-900">
                Nincs jogosultságod ehhez a nézethez
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-amber-800">
            <p>
              Ha úgy gondolod, hogy hozzá kellene férned, keresd meg az
              adminisztrátort.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ErkezesSajatView
      employeeId={session.employeeId}
      employeeName={session.name}
      role={session.role}
      keszletPermission={session.can("keszlet")}
      fuvarozasPermission={session.can("fuvarozas_sajat")}
      elolegekPermission={session.can("dolgozok")}
    />
  );
}
