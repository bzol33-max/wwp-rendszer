import { PageHeader } from "@/components/layout/page-header";
import { GpsStatus } from "@/components/fuvarozas/idovonal";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";

export const dynamic = "force-dynamic";

// Az Élő GPS a MEGLÉVŐ, bevált nézet (components/fuvarozas/idovonal.tsx) —
// szándékosan nem írjuk újra: ugyanazt a kocsi-idővonalat mutatja, amit a
// sofőr-nézet és a teljesítés-figyelés használ. A Fuvarozás 2 csak a fület
// és a keretet adja hozzá.
export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Élő GPS" subtitle="A két kamion élő pozíciója és a mai idővonal (Ecofleet)." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/gps" />
      <GpsStatus />
    </div>
  );
}
