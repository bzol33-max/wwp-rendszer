import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div>
      <PageHeader title="Fuvarozás" subtitle="Ez a modul hamarosan elkészül." />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fejlesztés alatt</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A Készlet modul után ez következik a rendszertervben.
        </CardContent>
      </Card>
    </div>
  );
}
