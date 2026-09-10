import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getMobilOsszefoglalo } from "@/lib/dashboard/actions";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";
import { RefreshButton } from "@/components/mobil/refresh-button";
import { PullToRefresh } from "@/components/mobil/pull-to-refresh";
import { MOBIL_THEME } from "@/lib/mobil-theme";
import { logout } from "@/lib/auth/actions";

function formatFt(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

function formatIdo(iso: string) {
  return new Date(iso).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

export default async function MobilPage() {
  const session = await requireSession();
  // A "mobil" jog önmagában is feljogosít mindkét kártya megtekintésére —
  // ez egy szándékosan önálló, korlátozott nézet, független attól, hogy a
  // felhasználó a teljes Készlet/Fuvarozás modulhoz hozzáfér-e. Aki viszont
  // amúgy is rendelkezik a teljes modul megtekintési jogával, annak külön
  // "mobil" jog nélkül is megjelenik a hozzá tartozó kártya.
  const mobilJog = session.can("mobil").view;
  const showKeszlet = session.can("keszlet").view || mobilJog;
  const showFuvarozas = session.can("fuvarozas").view || mobilJog;

  const data = await getMobilOsszefoglalo({ showKeszlet, showFuvarozas });

  return (
    <div
      style={MOBIL_THEME}
      className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-[var(--mob-bg)] text-[var(--mob-text)]"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 text-xs text-[var(--mob-muted)]">
        <Link href="/" className="flex items-center gap-1 hover:text-[var(--mob-text)]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Rendszer
        </Link>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-[var(--mob-text)]">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <PullToRefresh className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">Mobil összefoglaló</h1>
              <p className="text-xs text-[var(--mob-muted)]">
                Frissítve: {formatIdo(data.frissitve)}
              </p>
            </div>
            <RefreshButton />
          </div>

          {!showKeszlet && !showFuvarozas && (
            <p className="text-sm text-[var(--mob-muted)]">
              Nincs jogosultságod egyik itt megjelenő modulhoz sem.
            </p>
          )}

          {showKeszlet && data.keszlet && (
            <section className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-4">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-[var(--mob-muted)] uppercase">
                Készlet — Nyíregyháza, ma
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--mob-tile)] p-3">
                  <div className="text-[11px] text-[var(--mob-muted)]">EUR világos</div>
                  <div className="text-2xl font-bold tabular-nums text-[var(--mob-positive)]">
                    +{data.keszlet.eurVilagosMa}
                  </div>
                </div>
                <div className="rounded-lg bg-[var(--mob-tile)] p-3">
                  <div className="text-[11px] text-[var(--mob-muted)]">EUR szürke</div>
                  <div className="text-2xl font-bold tabular-nums text-[var(--mob-positive)]">
                    +{data.keszlet.eurSzurkeMa}
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-[var(--mob-border)] p-3">
                <div className="text-[11px] text-[var(--mob-muted)]">Kassza egyenleg</div>
                <div
                  className={`text-xl font-bold tabular-nums ${
                    data.keszlet.kassza < 0 ? "text-[var(--mob-negative)]" : ""
                  }`}
                >
                  {formatFt(data.keszlet.kassza)}
                </div>
              </div>
            </section>
          )}

          {showFuvarozas && data.fuvarozas && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-wide text-[var(--mob-muted)] uppercase">
                Fuvarozás — mai megbízások kocsinként
              </h2>
              {data.fuvarozas.map((jarmu) => (
                <div
                  key={jarmu.sofor}
                  className="rounded-xl border border-[var(--mob-border)] bg-[var(--mob-card)] p-4"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
                    {jarmu.label}
                  </div>
                  {jarmu.fuvarok.length === 0 ? (
                    <p className="text-xs text-[var(--mob-muted)]">Nincs mai megbízás.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {jarmu.fuvarok.map((f) => (
                        <div key={f.id} className="rounded-lg bg-[var(--mob-tile)] p-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                f.cimke === "Saját"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {f.cimke} fuvar
                            </span>
                            {f.idopont && (
                              <span className="text-xs text-[var(--mob-muted)]">{f.idopont}</span>
                            )}
                          </div>
                          {f.megrendelo && (
                            <div className="mt-1 font-medium">{f.megrendelo}</div>
                          )}
                          <div className="text-xs text-[var(--mob-muted)]">
                            {f.felrako ?? "?"} → {f.lerako}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}
