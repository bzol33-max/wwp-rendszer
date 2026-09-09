import { getLejartSzamlak } from "@/lib/attekintes/actions";
import { LejartSzamlaLista } from "@/components/attekintes/lejart-szamla-lista";

export default async function LejartSzamlakPage() {
  const rows = await getLejartSzamlak();

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Lejárt számlák</h1>
      <LejartSzamlaLista initialRows={rows} />
    </div>
  );
}
