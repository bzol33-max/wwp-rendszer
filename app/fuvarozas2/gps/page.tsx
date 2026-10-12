import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { getGpsVaszon } from "@/lib/fuvarozas2/gps-vaszon";
import { GpsVaszonNezet } from "@/components/fuvarozas2/gps-vaszon";

export const dynamic = "force-dynamic";

// 2026-10-12: a régi „Részletes idővonal és térkép” réteg (GpsStatus,
// components/fuvarozas/idovonal.tsx) lekerült a lapról — a kódja megvan; a
// térkép és a kocsinkénti idővonal a Ma → Diszpécser lapon.
export default async function Page() {
  const adat = await getGpsVaszon();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Élő GPS" subtitle="A nap egy sávon: vezetés, rakodás, szünet — kocsinként, a napi keretekkel." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/gps" />
      <GpsVaszonNezet adat={adat} />
    </div>
  );
}
