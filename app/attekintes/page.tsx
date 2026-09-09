import { Wallet } from "lucide-react";
import {
  getFelvasarlasOsszefoglalo,
  getFelvasarlasReszletek,
} from "@/lib/attekintes/actions";

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

export default async function NyiregyhazaPage() {
  const [osszefoglalo, { vasarlasok, kiadasok }] = await Promise.all([
    getFelvasarlasOsszefoglalo(),
    getFelvasarlasReszletek(),
  ]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Nyíregyháza — mai felvásárlás</h1>

      <div className="rounded-xl border bg-card p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">EUR világos</div>
            <div className="text-xl font-bold tabular-nums">+{osszefoglalo.eurVilagosMa}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">EUR szürke</div>
            <div className="text-xl font-bold tabular-nums">+{osszefoglalo.eurSzurkeMa}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">H1 raklap</div>
            <div className="text-xl font-bold tabular-nums">+{osszefoglalo.h1Ma}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">Gitterbox</div>
            <div className="text-xl font-bold tabular-nums">+{osszefoglalo.gitterboxMa}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Kassza egyenleg
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              osszefoglalo.kassza < 0 ? "text-destructive" : ""
            }`}
          >
            {formatFt(osszefoglalo.kassza)}
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold">Mai felvásárlás — összes típus</h2>
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

      <h2 className="mt-2 text-sm font-semibold">Mai kiadás</h2>
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
