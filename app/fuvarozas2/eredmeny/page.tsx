import { getEredmeny } from "@/lib/fuvarozas2/eredmeny";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { EredmenyNezet } from "@/components/fuvarozas2/eredmeny-nezet";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ idoszak?: string }> }) {
  const sp = await searchParams;
  const adat = await getEredmeny(sp.idoszak);
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/eredmeny" cim="Eredmény" />
      <EredmenyNezet adat={adat} />
    </div>
  );
}
