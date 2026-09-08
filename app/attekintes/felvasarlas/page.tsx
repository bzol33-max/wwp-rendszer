import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getFelvasarlasReszletek } from "@/lib/attekintes/actions";

function formatFt(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

function formatIdo(iso: string) {
  return new Date(iso).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

const FIZETESI_MOD_LABEL: Record<string, string> = {
  keszpenz: "Készpénz",
  atutalas: "Átutalás",
};

export default async function FelvasarlasReszletekPage() {
  const session = await requireSession();
  if (!session.can("attekintes").view) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-muted/40 px-4 text-center text-sm text-muted-foreground">
        Nincs jogosultságod ehhez a nézethez.
      </div>
    );
  }

  const { vasarlasok, kiadasok } = await getFelvasarlasReszletek();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Link href="/attekintes" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Áttekintés
      </Link>
      <h1 className="text-base font-semibold">Mai felvásárlás — összes típus</h1>

      {vasarlasok.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ma még nem érkezett felvásárlás.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {vasarlasok.map((v) => (
            <div key={v.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{v.tipus}</span>
                <span className="text-xs text-muted-foreground">{formatIdo(v.createdAt)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {v.seller} · {v.qty} db × {formatFt(v.unitPrice)}
                </span>
                <span className="font-medium text-foreground">{formatFt(v.total)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {FIZETESI_MOD_LABEL[v.paymentMethod] ?? v.paymentMethod}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-2 text-base font-semibold">Mai kiadás</h2>
      {kiadasok.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ma nem volt egyéb (nem felvásárlási) kassza-kiadás.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {kiadasok.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
              <div>
                <div className="font-medium">{k.description}</div>
                <div className="text-xs text-muted-foreground">{formatIdo(k.createdAt)}</div>
              </div>
              <span className="font-medium text-destructive">{formatFt(k.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
