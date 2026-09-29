import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const adat = await getMaVaszon();
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Ma — irányítópult" />
      <MaVaszonNezet adat={adat} />
    </div>
  );
}
