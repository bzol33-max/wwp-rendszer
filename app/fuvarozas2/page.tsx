import { PageHeader } from "@/components/layout/page-header";
import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getMaVaszon();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Ma — irányítópult" subtitle="Kocsinként: hol van, mit csinál most, mi van még ma és a következő munkanapon." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2" />
      <MaVaszonNezet adat={adat} />
    </div>
  );
}
