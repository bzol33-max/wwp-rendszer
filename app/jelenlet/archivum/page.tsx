import { ModuleGate } from "@/components/auth/module-gate";
import { PageHeader } from "@/components/layout/page-header";
import { FeladatokArchivumView } from "@/components/jelenlet/feladatok-archivum-view";
import { getArchivedFeladatok } from "@/lib/jelenlet/actions";

export default async function JelenletArchivumPage() {
  const feladatok = await getArchivedFeladatok();

  return (
    <ModuleGate module="jelenlet">
      <div className="flex flex-col gap-5">
        <PageHeader title="Feladatok — Archívum" subtitle="Elvégzett feladatok, heti bontásban." />
        <FeladatokArchivumView initialFeladatok={feladatok} />
      </div>
    </ModuleGate>
  );
}
