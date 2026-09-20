import { PageHeader } from "@/components/layout/page-header";
import { GpsStatus } from "@/components/fuvarozas/idovonal";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { getGpsVaszon } from "@/lib/fuvarozas2/gps-vaszon";
import { GpsVaszonNezet } from "@/components/fuvarozas2/gps-vaszon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getGpsVaszon();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Élő GPS" subtitle="A nap egy sávon: vezetés, rakodás, szünet — kocsinként, a napi keretekkel." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/gps" />
      <GpsVaszonNezet adat={adat} />
      <details className="rounded-2xl border border-foreground/10 bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Részletes idővonal és térkép (a régi nézet)</summary>
        <div className="mt-4"><GpsStatus /></div>
      </details>
    </div>
  );
}
