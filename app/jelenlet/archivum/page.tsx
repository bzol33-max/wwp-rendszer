import { ModuleGate } from "@/components/auth/module-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeladatokArchivumView } from "@/components/jelenlet/feladatok-archivum-view";
import { HaviJelenletArchivum } from "@/components/jelenlet/havi-jelenlet-archivum";
import { getArchivedFeladatok, getHaviJelenletArchivum } from "@/lib/jelenlet/actions";

export default async function JelenletArchivumPage() {
  const [feladatok, honapok] = await Promise.all([getArchivedFeladatok(), getHaviJelenletArchivum()]);

  return (
    <ModuleGate module="jelenlet">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Jelenlét — Archívum"
          subtitle="Elvégzett feladatok heti bontásban, és a lezárt hónapok jelenléte."
        />
        <Tabs defaultValue="feladatok">
          <TabsList>
            <TabsTrigger value="feladatok">Feladatok</TabsTrigger>
            <TabsTrigger value="havi">Havi jelenlét</TabsTrigger>
          </TabsList>
          <TabsContent value="feladatok" className="mt-5">
            <FeladatokArchivumView initialFeladatok={feladatok} />
          </TabsContent>
          <TabsContent value="havi" className="mt-5">
            <HaviJelenletArchivum honapok={honapok} />
          </TabsContent>
        </Tabs>
      </div>
    </ModuleGate>
  );
}
