import { requireSession } from "@/lib/auth/dal";
import { getNyiregyhazaPurchasePrices } from "@/lib/keszlet/actions";
import { FelvasarlasMobilView } from "@/components/felvasarlas/felvasarlas-mobil-view";

export default async function FelvasarlasPage() {
  const session = await requireSession();

  if (!session.can("felvasarlas_mobil").view) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-1 p-4 text-center">
        <p className="text-sm font-medium">Nincs jogosultságod ehhez a nézethez.</p>
        <p className="text-xs text-muted-foreground">
          Ha úgy gondolod, hogy hozzá kellene férned, keresd meg az adminisztrátort.
        </p>
      </div>
    );
  }

  const prices = await getNyiregyhazaPurchasePrices();

  return <FelvasarlasMobilView prices={prices} />;
}
