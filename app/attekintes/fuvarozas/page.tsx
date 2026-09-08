import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";
import { parseEcofleetTimestamp } from "@/lib/fuvarozas/ecofleet";
import { getJarmuMegbizasok, getJarmuPoziciok } from "@/lib/attekintes/actions";

function formatIdo(ecofleetTimestamp: string | null) {
  if (!ecofleetTimestamp) return null;
  const d = parseEcofleetTimestamp(ecofleetTimestamp);
  return d ? d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }) : null;
}

export default async function FuvarozasReszletekPage() {
  const session = await requireSession();
  if (!session.can("attekintes").view) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-muted/40 px-4 text-center text-sm text-muted-foreground">
        Nincs jogosultságod ehhez a nézethez.
      </div>
    );
  }

  const [poziciok, csoportok] = await Promise.all([getJarmuPoziciok(), getJarmuMegbizasok()]);
  const poziciokBySofor = Object.fromEntries(poziciok.map((p) => [p.jarmu.sofor, p]));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <Link href="/attekintes" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Áttekintés
      </Link>
      <h1 className="text-base font-semibold">Fuvarozás — kocsinként</h1>

      <div className="flex flex-col gap-3">
        {csoportok.map((cs) => {
          const pozicio = poziciokBySofor[cs.jarmu.sofor];
          const ido = formatIdo(pozicio?.frissitve ?? null);
          return (
            <div key={cs.jarmu.sofor} className="rounded-xl border bg-card p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[cs.jarmu.szin]}`} />
                {cs.label}
              </div>

              <div className="mb-3 rounded-lg bg-muted/40 p-2.5 text-xs">
                {pozicio?.cim ? (
                  <>
                    <div className="text-foreground">{pozicio.cim}</div>
                    <div className="mt-0.5 flex items-center justify-between text-muted-foreground">
                      <span>
                        {pozicio.sebesseg !== null ? `${Math.round(pozicio.sebesseg)} km/h` : "—"}
                      </span>
                      {ido && <span>Frissítve: {ido}</span>}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">Nincs GPS-adat.</span>
                )}
              </div>

              {cs.megbizasok.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nincs folyamatban lévő megbízás.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cs.megbizasok.map((m) => (
                    <div key={m.id} className="rounded-lg bg-muted/40 p-2.5 text-sm">
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
                        <span className="text-xs text-muted-foreground">{m.date}</span>
                      </div>
                      {m.megrendelo && <div className="mt-1 font-medium">{m.megrendelo}</div>}
                      <div className="text-xs text-muted-foreground">
                        {m.felrako ?? "?"} → {m.lerako}
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
