import { getFrissenFizetettSzamlak, getNyitottSzamlak } from "@/lib/attekintes/actions";
import { SzamlakMobil } from "@/components/attekintes/szamlak-mobil";
import { FIZETVE_NAPOK_MOBIL } from "@/lib/szamlak/szamla-constants";

export default async function SzamlakPage() {
  const [nyitott, fizetett] = await Promise.all([getNyitottSzamlak(), getFrissenFizetettSzamlak(FIZETVE_NAPOK_MOBIL)]);

  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-base font-semibold">Számlák</h1>
      <SzamlakMobil nyitott={nyitott} fizetett={fizetett} />
    </div>
  );
}
