import { getLejartSzamlak } from "@/lib/attekintes/actions";
import { getSzamlaFejlec } from "@/lib/szamlak/actions";
import { LejartSzamlaLista } from "@/components/attekintes/lejart-szamla-lista";

export default async function LejartSzamlakPage() {
  const [rows, fejlec] = await Promise.all([getLejartSzamlak(), getSzamlaFejlec()]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Számlák</h1>
      <LejartSzamlaLista initialRows={rows} fejlec={fejlec} />
    </div>
  );
}
