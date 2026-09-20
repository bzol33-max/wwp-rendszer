import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { getElszamolasVaszon } from "@/lib/fuvarozas2/elszamolas";
import { ElszamolasVaszonNezet } from "@/components/fuvarozas2/elszamolas-vaszon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getElszamolasVaszon();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Elszámolás"
        subtitle="Bér fuvarok a teljesítéstől a lezárásig: a fotó a számlázhatóság jele, az eredeti papír a postázásé."
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/elszamolas" />
      <ElszamolasVaszonNezet adat={adat} />
    </div>
  );
}
