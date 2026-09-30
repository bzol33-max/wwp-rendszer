import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { getKalkulatorJarmuvek } from "@/lib/fuvarozas2/kalkulator";
import { KozosKalkulator } from "@/components/fuvarozas2/kozos-kalkulator";

export const dynamic = "force-dynamic";

// A Tervezés „kalkulátor” linkje ?honnan=…&hova=… paraméterrel nyit: ezek az első két megálló.
export default async function Page({ searchParams }: { searchParams: Promise<{ honnan?: string; hova?: string }> }) {
  const sp = await searchParams;
  const jarmuvek = await getKalkulatorJarmuvek();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Kalkulátor" subtitle="Útvonal több megállóval, HU-GO útdíj, üzemanyag, önköltség — és mennyiért érdemes elvállalni." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/kalkulator" />
      <KozosKalkulator jarmuvek={jarmuvek} kezdoMegallok={[sp.honnan ?? "", sp.hova ?? ""]} />
    </div>
  );
}
