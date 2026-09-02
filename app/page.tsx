import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div>
      <PageHeader
        title="Info"
        subtitle="Személyre szabható összefoglaló — a modulok fő adatai egy helyen"
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ez a lap még épül</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Amint a modulok elkészülnek, ide kerülnek a felhasználónként testreszabható
          csempék (pl. mai fuvarok, kintlévőségek, közelgő jármű-határidők).
        </CardContent>
      </Card>
    </div>
  );
}
