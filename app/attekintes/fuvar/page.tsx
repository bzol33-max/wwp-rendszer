import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";
import { parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";
import { getJarmuMegbizasok, getJarmuPoziciok } from "@/lib/attekintes/actions";
import { varosNev } from "@/lib/fuvarozas/varos";

/** "6 perce" / "2 órája" formátum — a pontos óra helyett, mennyivel ezelőtti az adat. */
function formatEltelt(ecofleetTimestamp: string | null) {
  if (!ecofleetTimestamp) return null;
  const d = parseEcofleetTimestamp(ecofleetTimestamp);
  if (!d) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "most";
  if (diffMin < 60) return `${diffMin} perce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} órája`;
  return d.toLocaleDateString("hu-HU", { day: "numeric", month: "short", timeZone: "Europe/Budapest" });
}

export default async function FuvarPage() {
  const [poziciok, csoportok] = await Promise.all([getJarmuPoziciok(), getJarmuMegbizasok()]);
  const poziciokBySofor = Object.fromEntries(poziciok.map((p) => [p.jarmu.sofor, p]));

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Fuvarozás — kocsinként</h1>

      <div className="flex flex-col gap-3">
        {csoportok.map((cs) => {
          const pozicio = poziciokBySofor[cs.jarmu.sofor];
          const eltelt = formatEltelt(pozicio?.frissitve ?? null);
          const vanGps = !!pozicio?.cim;
          const csikSzin = !vanGps
            ? "var(--at-border)"
            : pozicio?.motorFut
              ? "var(--at-accent)"
              : "var(--at-muted)";

          return (
            <div
              key={cs.jarmu.sofor}
              className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4"
              style={{ borderLeft: `4px solid ${csikSzin}` }}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[cs.jarmu.szin]}`} />
                  {cs.jarmu.sofor}
                </div>
                {vanGps && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      pozicio?.motorFut
                        ? "bg-[var(--at-accent)]/15 text-[var(--at-accent)]"
                        : "bg-[var(--at-muted)]/15 text-[var(--at-muted)]"
                    }`}
                  >
                    {pozicio?.motorFut ? "Úton" : "Áll"}
                  </span>
                )}
              </div>

              {vanGps ? (
                <div className="mb-3 text-xs text-[var(--at-muted)]">
                  {pozicio?.cim}
                  {" · "}
                  {pozicio?.sebesseg !== null ? `${Math.round(pozicio!.sebesseg!)} km/h` : "—"}
                  {eltelt && ` · ${eltelt}`}
                </div>
              ) : (
                <p className="mb-3 text-xs text-[var(--at-muted)]">Nincs GPS-adat.</p>
              )}

              {cs.megbizasok.length === 0 ? (
                <p className="text-xs text-[var(--at-muted)]">Nincs folyamatban lévő megbízás.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cs.megbizasok.map((m) => (
                    <div key={m.id} className="rounded-lg bg-[var(--at-tile)] p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            m.cimke === "Saját"
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {m.cimke} fuvar
                        </span>
                        <span className="text-xs text-[var(--at-muted)]">{m.date}</span>
                      </div>
                      {m.megrendelo && <div className="mt-1 font-medium">{m.megrendelo}</div>}
                      <div className="text-xs text-[var(--at-muted)]">
                        {m.felrako ? varosNev(m.felrako) : "?"} → {varosNev(m.lerako)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
