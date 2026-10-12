import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";

export const dynamic = "force-dynamic";

// 2026-10-12 (Budaházi Zoltán: „csak a Részletek kell”): a Ma lap a megállók
// és a csempék nézete. Az élő térkép (Most), a Diszpécser és a GPS lap megszűnt.
export default async function Page() {
  const adat = await getMaVaszon();
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Ma" />
      <MaVaszonNezet adat={adat} />
    </div>
  );
}
