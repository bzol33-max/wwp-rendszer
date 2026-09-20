import { PageHeader } from "@/components/layout/page-header";
import { TollCalculator } from "@/components/fuvarozas/toll-calculator";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";

export const dynamic = "force-dynamic";

// A Kalkulátor a MEGLÉVŐ, megbízhatóan működő nézet (HU-GO útvonal és útdíj,
// NAV gázolajár) — a Fuvarozás 2 egyelőre csak keretet ad neki. A tervezett
// bővítés (címről címre szakaszok, több ajánlat egy körben, önköltség) külön
// kör; addig sem kell másik fülre ugrani miatta.
export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Kalkulátor" subtitle="Útvonal, km, útdíj és üzemanyag — a felkínált fuvar gyors ellenőrzéséhez (HU-GO)." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/kalkulator" />
      <TollCalculator />
    </div>
  );
}
