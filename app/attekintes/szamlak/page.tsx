import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getLejartSzamlak } from "@/lib/attekintes/actions";
import { LejartSzamlaLista } from "@/components/attekintes/lejart-szamla-lista";

export default async function LejartSzamlakPage() {
  const session = await requireSession();
  if (!session.can("attekintes").view) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-muted/40 px-4 text-center text-sm text-muted-foreground">
        Nincs jogosultságod ehhez a nézethez.
      </div>
    );
  }

  const rows = await getLejartSzamlak();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Link href="/attekintes" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Áttekintés
      </Link>
      <h1 className="text-base font-semibold">Lejárt számlák</h1>
      <LejartSzamlaLista initialRows={rows} />
    </div>
  );
}
