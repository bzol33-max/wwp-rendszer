import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleGate } from "@/components/auth/module-gate";

export default function Page() {
  return (
    <ModuleGate module="jelenlet">
      <div>
        <PageHeader title="Jelenléti/üzenőfal" subtitle="Ez a modul hamarosan elkészül." />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fejlesztés alatt</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A modul funkciói még nincsenek kidolgozva.
          </CardContent>
        </Card>
      </div>
    </ModuleGate>
  );
}
