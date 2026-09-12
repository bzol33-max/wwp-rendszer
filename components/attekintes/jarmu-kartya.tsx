"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS, type SajatJarmu } from "@/lib/fuvarozas/vehicles";
import { varosNev } from "@/lib/fuvarozas/varos";
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

/** "Ma" / "Holnap" — null, ha se nem ma, se nem holnap (ilyenkor a m.date jelenik meg helyette). */
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

/** Egy megbízás kompakt sora a kártyán: "JELENLEGI" / "KÖVETKEZŐ" fejléc, Felrakó/Lerakó kiírva, nap-jelvény. */
function MegbizasSor({
  cim,
  m,
  szamlalo,
}: {
  cim: string;
  m: JarmuMegbizasSor;
  /** Pl. "1/2" — hányadik ez a kocsi aktív megbízásai közül, hogy lásd, hol tart. */
  szamlalo?: string;
}) {
  const nap = napCimke(m.datumIso);
  return (
    <div className="border-t border-[var(--at-border)] pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--at-muted)]">
          {cim}
          {szamlalo && ` · ${szamlalo}`}
        </span>
        <span className="text-[11px] font-medium text-[var(--at-muted)]">{nap ?? m.date}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm font-medium">
        <span>{m.felrako ? varosNev(m.felrako) : "?"}</span>
        <span className="text-[var(--at-muted)]">→</span>
        <span>{varosNev(m.lerako)}</span>
      </div>
      {m.megrendelo && <div className="text-xs text-[var(--at-muted)]">{m.megrendelo}</div>}
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

  const jelenlegi = megbizasok[0];
  const kovetkezo = megbizasok[1];
  const tobbi = megbizasok.length - 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setNyitva(true)}
        className="w-full rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base font-bold">
            <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
            {jarmu.sofor}
          </span>
          <span className={`text-sm font-bold ${pozicio?.motorFut ? "text-[var(--at-accent)]" : "text-[var(--at-muted)]"}`}>
            {vanGps ? (pozicio?.sebesseg !== null ? `${Math.round(pozicio!.sebesseg!)} km/h` : "Áll") : "—"}
          </span>
        </div>

        {vanGps ? (
          <div className="mt-0.5 text-sm text-[var(--at-muted)]">
            {pozicio?.cim}
            {eltelt && ` · ${eltelt}`}
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-[var(--at-muted)]">Nincs GPS-adat.</p>
        )}

        {megbizasok.length === 0 ? (
          <p className="mt-2.5 border-t border-[var(--at-border)] pt-2.5 text-sm text-[var(--at-muted)]">
            Nincs folyamatban lévő megbízás.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-2.5">
            <MegbizasSor
              cim="Jelenlegi megbízás"
              m={jelenlegi}
              szamlalo={megbizasok.length > 1 ? `1/${megbizasok.length}` : undefined}
            />
            {kovetkezo && (
              <MegbizasSor
                cim="Következő megbízás"
                m={kovetkezo}
                szamlalo={megbizasok.length > 2 ? `2/${megbizasok.length}` : undefined}
              />
            )}
            {tobbi > 0 && (
              <p className="text-xs text-[var(--at-muted)]">+{tobbi} további megbízás — koppints a részletekért</p>
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
              <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-4">
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
