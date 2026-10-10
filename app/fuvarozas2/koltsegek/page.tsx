import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { KoltsegekNezet } from "@/components/fuvarozas2/koltsegek";
import { getKoltsegekOldal } from "@/lib/fuvarozas2/koltsegek";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getKoltsegekOldal();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás · Költségek"
        subtitle="HU-GO útdíj, tankolások és a számítás beállításai — ezekből lesz a Kimutatás tény-költsége."
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/koltsegek" />
      <KoltsegekNezet adat={adat} />
    </div>
  );
}
