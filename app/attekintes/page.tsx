import {
  getFelvasarlasOsszefoglalo,
  getHaviFelvasarlasOsszefoglalo,
  getHaviKasszaOsszesito,
  getMaiKiadasok,
  getMaiPenzmozgas,
} from "@/lib/attekintes/actions";
import { HaviFelvasarlasButton } from "@/components/attekintes/havi-felvasarlas-modal";
import { KasszaEgyenlegCard } from "@/components/attekintes/kassza-egyenleg-card";

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
  const [osszefoglalo, kiadasok, havi, haviTipusok, penz] = await Promise.all([
    getFelvasarlasOsszefoglalo(),
    getMaiKiadasok(),
    getHaviKasszaOsszesito(),
    getHaviFelvasarlasOsszefoglalo(),
    getMaiPenzmozgas(),
  ]);
  const kiadasOsszeg = kiadasok.reduce((sum, k) => sum + k.amount, 0);

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-base font-semibold">Nyíregyháza — mai felvásárlás</h1>
        <p className="text-xs text-[var(--at-muted)]">{formatMaiDatum()}</p>
      </div>

      <KasszaEgyenlegCard egyenleg={osszefoglalo.kassza} havi={havi} />

      {/* Mai pénzmozgás: a nap pénzoldala egy kártyán. Az átutalásos vétel
          külön sor, mert a készletet növeli, de a kasszát nem érinti — az
          összeg nettó, a számlán ehhez jön még az ÁFA. */}
      <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
        <div className="mb-2 text-sm font-semibold">Mai pénzmozgás</div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-[var(--at-muted)]">Felvásárlás készpénzből</span>
          <span className="font-semibold tabular-nums text-[var(--at-negative)]">
            {penz.felvasarlasKeszpenz > 0 ? `−${formatFt(penz.felvasarlasKeszpenz)}` : formatFt(0)}
          </span>
        </div>
        <div className="py-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--at-muted)]">
              Felvásárlás átutalással
              {penz.atutalasDb > 0 && (
                <span className="text-[var(--at-muted)]"> · {penz.atutalasDb} db</span>
              )}
            </span>
            <span className="font-semibold tabular-nums text-[#185fa5] dark:text-[#85b7eb]">
              {formatFt(penz.atutalasOsszeg)}
              {penz.atutalasOsszeg > 0 && <span className="text-xs font-normal"> + ÁFA</span>}
            </span>
          </div>
          {/* Melyik típus adja az összeget — enélkül csak egy szám lenne. */}
          {penz.atutalasTipusok.map((t) => (
            <div
              key={t.tipus}
              className="flex items-center justify-between pl-3 text-xs text-[#185fa5] dark:text-[#85b7eb]"
            >
              <span>
                {t.tipus} · {t.qty} db
              </span>
              <span className="tabular-nums">{formatFt(t.osszeg)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-[var(--at-muted)]">Egyéb kiadás</span>
          <span className="font-semibold tabular-nums text-[var(--at-negative)]">
            {penz.egyebKiadas > 0 ? `−${formatFt(penz.egyebKiadas)}` : formatFt(0)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[var(--at-border)] pt-2">
          <span className="text-sm font-medium">Ma készpénzből összesen</span>
          <span className="text-xl font-bold tabular-nums text-[var(--at-negative)]">
            {formatFt(kiadasOsszeg)}
          </span>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Mai felvásárlás típusonként</h2>
          <HaviFelvasarlasButton tipusok={haviTipusok} />
        </div>
        {osszefoglalo.tipusok.length === 0 ? (
          <p className="text-sm text-[var(--at-muted)]">Ma még nem érkezett felvásárlás.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {osszefoglalo.tipusok.map((t) => {
              const atutalt = penz.atutalasTipusok.find((a) => a.tipus === t.tipus)?.qty ?? 0;
              return (
                <div key={t.tipus} className="rounded-lg bg-[var(--at-tile)] p-2.5">
                  <div className="text-[11px] text-[var(--at-muted)]">{t.tipus}</div>
                  <div className="text-xl font-bold tabular-nums text-[var(--at-positive)]">+{t.qty}</div>
                  {atutalt > 0 && (
                    <div className="text-[10px] font-medium text-[#185fa5] dark:text-[#85b7eb]">
                      {atutalt === t.qty ? "átutalással" : `ebből ${atutalt} átutalással`}
                    </div>
                  )}
                </div>
              );
            })}
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
