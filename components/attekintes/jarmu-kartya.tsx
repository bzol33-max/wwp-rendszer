"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import type { JarmuMegbizasMegallo, JarmuMegbizasSor, JarmuPoziciSor } from "@/lib/attekintes/actions";

/** "6 perce" / "2 órája" — a pontos óra helyett, mennyivel ezelőtti az adat. */
function formatEltelt(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "most";
  if (diffMin < 60) return `${diffMin} perce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} órája`;
  return d.toLocaleDateString("hu-HU", { day: "numeric", month: "short", timeZone: "Europe/Budapest" });
}

/** "Ma" / "Holnap" — null, ha se nem ma, se nem holnap. */
function napCimke(datumIso: string): string | null {
  const ma = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
  if (datumIso === ma) return "Ma";
  const holnapDate = new Date();
  holnapDate.setDate(holnapDate.getDate() + 1);
  const holnap = holnapDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
  if (datumIso === holnap) return "Holnap";
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

function MegbizasReszlet({ m }: { m: JarmuMegbizasSor }) {
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

export function JarmuKartya({
  jarmu,
  pozicio,
  megbizasok,
}: {
  jarmu: SajatJarmu;
  pozicio: JarmuPoziciSor | undefined;
  megbizasok: JarmuMegbizasSor[];
}) {
  const [nyitva, setNyitva] = useState(false);
  const eltelt = formatEltelt(pozicio?.frissitve ?? null);
  const vanGps = !!pozicio?.cim;
  const csikSzin = !vanGps ? "var(--at-border)" : pozicio?.motorFut ? "var(--at-accent)" : "var(--at-muted)";

  const statuszFej = (
    <div className="mb-1 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        {jarmu.sofor}
      </div>
      {vanGps && (
        <span
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            pozicio?.motorFut
              ? "bg-[var(--at-accent)]/15 text-[var(--at-accent)]"
              : "bg-[var(--at-muted)]/15 text-[var(--at-muted)]"
          }`}
        >
          {pozicio?.motorFut && (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--at-accent)]" style={{ boxShadow: "0 0 0 3px color-mix(in srgb, var(--at-accent) 25%, transparent)" }} />
          )}
          {pozicio?.motorFut ? "Úton" : "Áll"}
        </span>
      )}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setNyitva(true)}
        className="w-full rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4 text-left"
        style={{ borderLeft: `4px solid ${csikSzin}` }}
      >
        {statuszFej}

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

        {megbizasok.length === 0 ? (
          <p className="text-xs text-[var(--at-muted)]">Nincs folyamatban lévő megbízás.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {megbizasok.slice(0, 1).map((m) => (
              <div key={m.id} className="rounded-lg bg-[var(--at-tile)] p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      m.cimke === "Saját" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {m.cimke} fuvar
                  </span>
                  <span className="text-xs text-[var(--at-muted)]">{m.date}</span>
                </div>
                {m.megrendelo && <div className="mt-1 font-medium">{m.megrendelo}</div>}
                <Utvonal megallok={m.megallok} />
              </div>
            ))}
            {megbizasok.length > 1 && (
              <p className="text-xs text-[var(--at-muted)]">+{megbizasok.length - 1} további megbízás — koppints a részletekért</p>
            )}
          </div>
        )}
      </button>

      {nyitva && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--at-bg)] text-[var(--at-text)]">
          <div className="flex items-center justify-between border-b border-[var(--at-border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
              {jarmu.sofor} — {jarmu.label}
            </div>
            <button
              type="button"
              onClick={() => setNyitva(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--at-muted)] hover:text-[var(--at-text)]"
              aria-label="Bezárás"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto flex max-w-md flex-col gap-4">
              <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4" style={{ borderLeft: `4px solid ${csikSzin}` }}>
                {vanGps ? (
                  <div className="text-sm">
                    <div>{pozicio?.cim}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--at-muted)]">
                      <span>{pozicio?.sebesseg !== null ? `${Math.round(pozicio!.sebesseg!)} km/h` : "—"} · {pozicio?.motorFut ? "fut a motor" : "áll"}</span>
                      {eltelt && <span>{eltelt}</span>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--at-muted)]">Nincs GPS-adat.</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Megbízások</h3>
                {megbizasok.length === 0 ? (
                  <p className="text-sm text-[var(--at-muted)]">Nincs folyamatban lévő megbízás.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {megbizasok.map((m) => (
                      <MegbizasReszlet key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
