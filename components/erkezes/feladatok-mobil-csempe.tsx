"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { cn } from "@/lib/utils";
import { URGENCY_COLORS, type Feladat } from "@/lib/jelenlet/shared";
import { listFeladatok } from "@/lib/jelenlet/actions";

// Dolgozói (mobil) feladat-csempe: az aktuális (nincs kész) feladatokat
// telephelyenként csoportosítva listázza. Egy feladatra koppintva nyílik
// meg a részletei — ott lehet megjegyzést írni és elvégzettnek jelölni.
export function FeladatokMobilCsempe() {
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);

  const load = useCallback(async () => {
    setFeladatok(await listFeladatok());
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const open = feladatok.filter((f) => !f.done);
  const bySite = new Map<string, Feladat[]>();
  for (const f of open) {
    const list = bySite.get(f.site_name) ?? [];
    list.push(f);
    bySite.set(f.site_name, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Feladatok</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs aktuális feladat.</p>
        ) : (
          Array.from(bySite.entries()).map(([site, tasks]) => (
            <div key={site} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {site}
              </p>
              {tasks.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelected(f)}
                  className="flex w-full items-start gap-2 rounded-md border bg-card p-2.5 text-left text-xs active:bg-muted"
                >
                  <span
                    className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{f.description}</span>
                    <span className="text-muted-foreground">{f.task_date}</span>
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </CardContent>
      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
        showDoneToggle
      />
    </Card>
  );
}
