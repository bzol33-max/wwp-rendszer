"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  marLathato,
  type Feladat,
  type Site,
} from "@/lib/jelenlet/shared";
import { getSites, listFeladatok } from "@/lib/jelenlet/actions";

// Dolgozói (mobil) feladatlista telephely-fülekkel. Korábban mind a három
// telephely feladata egyetlen, folyamatos listában jött, ami telefonon
// harminc tétel egymás alatt — a fülek miatt egyszerre csak egy telep
// látszik, és aki egész nap egy helyen van, nem görget. A sorrend a
// sürgősség, azon belül a régebbi kiadás elöl (a szerver így adja vissza),
// hogy ami régóta lóg, ne csússzon a lista aljára.
export function FeladatokMobilCsempe() {
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [aktivSite, setAktivSite] = useState<number | null>(null);
  const [selected, setSelected] = useState<Feladat | null>(null);

  const load = useCallback(async () => {
    const [siteRows, taskRows] = await Promise.all([getSites(), listFeladatok()]);
    setSites(siteRows);
    setFeladatok(taskRows);
  }, []);

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  // Csak az esedékes (vagy 3 napon belül esedékessé váló) feladatok — a
  // készre jelentett ismétlődő feladat következő példánya addig nem
  // zavarja a listát. Lásd lib/jelenlet/shared.ts marLathato().
  const aktualis = useMemo(() => feladatok.filter((f) => marLathato(f.task_date)), [feladatok]);

  const szamok = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of aktualis) m.set(f.site_id, (m.get(f.site_id) ?? 0) + 1);
    return m;
  }, [aktualis]);

  // A fül-választás addig követi a legtöbb feladatot hozó telepet, amíg a
  // dolgozó maga nem választ — így az első képernyőn rögtön van mit nézni.
  const valasztott =
    aktivSite ??
    [...szamok.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    sites[0]?.id ??
    null;

  const lista = aktualis.filter((f) => f.site_id === valasztott);

  if (loading) {
    return <p className="text-sm text-[var(--mob-muted)]">Betöltés…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {sites.map((s) => {
          const db = szamok.get(s.id) ?? 0;
          const aktiv = s.id === valasztott;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setAktivSite(s.id)}
              className={cn(
                "flex-1 rounded-xl border px-1 py-2 text-xs font-semibold transition-colors",
                aktiv
                  ? "border-[var(--mob-accent)] bg-[var(--mob-accent)] text-white"
                  : "border-[var(--mob-border)] bg-[var(--mob-card)] text-[var(--mob-muted)]"
              )}
            >
              {s.name}
              <span className={cn("ml-1", aktiv ? "opacity-90" : "opacity-70")}>{db}</span>
            </button>
          );
        })}
      </div>

      <Card className="border border-[var(--mob-border)] bg-[var(--mob-card)] ring-0">
        <CardContent className="space-y-1.5 py-3">
          {lista.length === 0 ? (
            <p className="text-sm text-[var(--mob-muted)]">Nincs aktuális feladat ezen a telepen.</p>
          ) : (
            lista.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelected(f)}
                className="flex w-full items-start gap-2 rounded-md border border-[var(--mob-border)] bg-[var(--mob-tile)] p-2.5 text-left text-xs active:opacity-80"
              >
                <span
                  className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{f.description}</span>
                  <span className="text-[var(--mob-muted)]">
                    {f.task_date}
                    {f.repeat_freq !== "egyszeri" && ` · ${REPEAT_LABELS[f.repeat_freq]}`}
                  </span>
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
        showDoneToggle
      />
    </div>
  );
}
