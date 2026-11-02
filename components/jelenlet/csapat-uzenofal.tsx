"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import { TelephelyFeladatokTile } from "@/components/jelenlet/telephely-feladatok-tile";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { getSites, listFeladatok, listFrissenKeszFeladatok } from "@/lib/jelenlet/actions";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
  marLathato,
  todayIso,
  type Feladat,
  type Site,
} from "@/lib/jelenlet/shared";

const LATHATO_SZOVEG = "3 nappal az esedékesség előtt jelenik meg";

const KESZ_VALASZTAS = [
  { napok: 1, cimke: "ma" },
  { napok: 3, cimke: "3 nap" },
  { napok: 7, cimke: "egy hét" },
] as const;

/**
 * A Csapat lap üzenőfala: telephelyenként egy kártya (új feladat, kész, megjegyzés-
 * dialógus, ismétlés — mind a TelephelyFeladatokTile-ban), alatta a sürgősség-
 * jelmagyarázat és az ütemezett feladatok. Ugyanazok a szerver-akciók, mint a
 * régi (mobil) nézetben.
 */
export function CsapatUzenofal() {
  const canEdit = useCanEdit();
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [keszFeladatok, setKeszFeladatok] = useState<Feladat[]>([]);
  // Hány napig maradjon látható egy elvégzett feladat a kártya alján.
  const [keszNapok, setKeszNapok] = useState(3);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);

  const load = useCallback(async () => {
    const [siteRows, taskRows, kesz] = await Promise.all([
      getSites(),
      listFeladatok(),
      listFrissenKeszFeladatok(keszNapok).catch(() => [] as Feladat[]),
    ]);
    setSites(siteRows);
    setFeladatok(taskRows);
    setKeszFeladatok(kesz);
  }, [keszNapok]);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  // Ami esedékes (vagy 3 napon belül az lesz), az a telephely kártyájára kerül;
  // a távolabbi ismétlődő példányok az "Ütemezett" sorba.
  const { aktualis, utemezett } = useMemo(() => {
    const ma = todayIso();
    return {
      aktualis: feladatok.filter((f) => marLathato(f.task_date, ma)),
      utemezett: feladatok.filter((f) => !marLathato(f.task_date, ma)),
    };
  }, [feladatok]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#1d1d1f]">Üzenőfal</h2>
        {/* Meddig maradjon látható egy elvégzett feladat. */}
        <div className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1">
          <span className="text-xs text-[#48484a]">Kész látszik:</span>
          {KESZ_VALASZTAS.map((v) => (
            <button
              key={v.napok}
              type="button"
              onClick={() => {
                setKeszNapok(v.napok);
                setLoading(true);
              }}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-xs font-semibold",
                keszNapok === v.napok
                  ? "bg-foreground text-background"
                  : "text-[#48484a] hover:bg-muted"
              )}
            >
              {v.cimke}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Betöltés…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sites.map((s) => (
            <TelephelyFeladatokTile
              key={s.id}
              siteId={s.id}
              siteName={s.name}
              feladatok={aktualis.filter((f) => f.site_id === s.id)}
              keszFeladatok={keszFeladatok.filter((f) => f.site_id === s.id)}
              maIso={todayIso()}
              canEdit={canEdit}
              nagyBetu
              onSelect={setSelected}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {/* Jelmagyarázat: ugyanaz az öt szín, ami a sorok bal szélén fut végig. */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[#48484a]">
          {URGENCY_LEVELS.map((szint) => (
            <span key={szint} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", URGENCY_COLORS[szint])} />
              {URGENCY_LABELS[szint]}
            </span>
          ))}
        </div>
      )}

      {utemezett.length > 0 && (
        <div className="rounded-xl border bg-card p-3 shadow-[var(--shadow-card)]">
          <p className="mb-2 text-xs font-bold tracking-wide text-[#48484a] uppercase">
            Ütemezett — {LATHATO_SZOVEG}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[#48484a]">
            {utemezett.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", URGENCY_COLORS[f.urgency])} />
                {f.description} ({f.site_name}) — {f.task_date}
                {f.repeat_freq !== "egyszeri" && ` · ${REPEAT_LABELS[f.repeat_freq]}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
        showDoneToggle
        canEdit={canEdit}
      />
    </section>
  );
}
