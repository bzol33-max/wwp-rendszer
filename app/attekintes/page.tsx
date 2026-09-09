import { Wallet } from "lucide-react";
import { getFelvasarlasOsszefoglalo, getMaiKiadasok } from "@/lib/attekintes/actions";

function formatFt(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

function formatIdo(iso: string) {
  return new Date(iso).toLocaleTimeString("hu-HU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  });
}

function formatMaiDatum() {
  return new Date().toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Europe/Budapest",
  });
}

export default async function NyiregyhazaPage() {
  const [osszefoglalo, kiadasok] = await Promise.all([
    getFelvasarlasOsszefoglalo(),
    getMaiKiadasok(),
  ]);
  const kiadasOsszeg = kiadasok.reduce((sum, k) => sum + k.amount, 0);

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-base font-semibold">Nyíregyháza — mai felvásárlás</h1>
        <p className="text-xs text-[var(--at-muted)]">{formatMaiDatum()}</p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--at-muted)]">
          <Wallet className="h-4 w-4" />
          Kassza egyenleg
        </div>
        <div
          className={`text-2xl font-bold tabular-nums ${
            osszefoglalo.kassza < 0 ? "text-[var(--at-negative)]" : ""
          }`}
        >
          {formatFt(osszefoglalo.kassza)}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
        <span className="text-xs text-[var(--at-muted)]">Mai kiadás</span>
        <span className="text-2xl font-bold tabular-nums text-[var(--at-negative)]">
          {formatFt(kiadasOsszeg)}
        </span>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Mai felvásárlás típusonként</h2>
        {osszefoglalo.tipusok.length === 0 ? (
          <p className="text-sm text-[var(--at-muted)]">Ma még nem érkezett felvásárlás.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {osszefoglalo.tipusok.map((t) => (
              <div key={t.tipus} className="rounded-lg bg-[var(--at-tile)] p-2.5">
                <div className="text-[11px] text-[var(--at-muted)]">{t.tipus}</div>
                <div className="text-xl font-bold tabular-nums text-[var(--at-positive)]">+{t.qty}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {kiadasok.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Mai kiadás — részletesen</h2>
          <div className="flex flex-col gap-2">
            {kiadasok.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[var(--at-tile)] p-2.5 text-sm"
              >
                <div>
                  <div className="font-medium">{k.description}</div>
                  <div className="text-xs text-[var(--at-muted)]">{formatIdo(k.createdAt)}</div>
                </div>
                <span className="font-medium text-[var(--at-negative)]">{formatFt(k.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
