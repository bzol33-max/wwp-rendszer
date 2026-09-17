import { getNyitottSzamlak } from "@/lib/attekintes/actions";
import { SzamlakMobil } from "@/components/attekintes/szamlak-mobil";

export default async function SzamlakPage() {
  const rows = await getNyitottSzamlak();

  return (
    <div className="flex flex-col gap-3 py-4">
      <h1 className="text-base font-semibold">Számlák</h1>
      <SzamlakMobil initialRows={rows} />
    </div>
  );
}
