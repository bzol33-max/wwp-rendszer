import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { getKalkulatorJarmuvek } from "@/lib/fuvarozas2/kalkulator";
import { KalkulatorVaszon } from "@/components/fuvarozas2/kalkulator-vaszon";
import { TollCalculator } from "@/components/fuvarozas/toll-calculator";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ honnan?: string; hova?: string }> }) {
  const sp = await searchParams;
  const jarmuvek = await getKalkulatorJarmuvek();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Kalkulátor" subtitle="HU-GO útdíj + saját önköltség — megmondja, mennyiért érdemes elvállalni." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/kalkulator" />
      <KalkulatorVaszon jarmuvek={jarmuvek} kezdoHonnan={sp.honnan ?? ""} kezdoHova={sp.hova ?? ""} />
      <details className="rounded-2xl border border-foreground/10 bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Útvonal térképen, több megállóval (a régi kalkulátor)</summary>
        <div className="mt-4"><TollCalculator /></div>
      </details>
    </div>
  );
}
