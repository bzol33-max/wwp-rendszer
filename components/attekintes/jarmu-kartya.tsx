"use client";

import type {
  JarmuMegbizasMegallo,
  JarmuMegbizasSor } from "@/lib/attekintes/actions";

function budapestNapIso(eltolasNap = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + eltolasNap);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
}

/** "Ma" / "Holnap" — null, ha egyik sem (ilyenkor a m.date jelenik meg helyette). */
function napCimke(datumIso: string): string | null {
  if (datumIso === budapestNapIso()) return "Ma";
  if (datumIso === budapestNapIso(1)) return "Holnap";
  return null;
}

function Utvonal({ megallok }: { megallok: JarmuMegbizasMegallo[] }) {
  if (megallok.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1">
        {megallok.map((m, i) => (
          <div key={i} className="flex flex-1 items-center gap-1 last:flex-none">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                m.tipus === "felrako" ? "bg-[var(--at-positive)]" : "bg-[var(--at-negative)]"
              }`}
            />
            {i < megallok.length - 1 && (
              <span
                className="h-px flex-1"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--at-border) 0 4px, transparent 4px 8px)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-[var(--at-muted)]">
        {megallok.map((m, i) => (
          <span key={i} className={i === 0 ? "" : i === megallok.length - 1 ? "text-right" : "text-center"}>
            {m.varos}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MegbizasReszlet({ m }: { m: JarmuMegbizasSor }) {
  const nap = napCimke(m.datumIso);
  return (
    <div className="rounded-lg bg-[var(--at-tile)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            m.cimke === "Saját" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {m.cimke} fuvar
        </span>
        {nap && (
          <span className="rounded bg-[var(--at-accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--at-accent)]">
            {nap}
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--at-muted)]">
          {m.date}
          {m.idopont && ` · ${m.idopont}`}
        </span>
      </div>
      {m.megrendelo && <div className="mt-1.5 font-medium">{m.megrendelo}</div>}
      {m.pozicioszam && (
        <div className="text-xs text-[var(--at-muted)]">Pozíciószám: {m.pozicioszam}</div>
      )}
      <Utvonal megallok={m.megallok} />
    </div>
  );
}

