"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import {
  REPEAT_LABELS,
  URGENCY_BORDERS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  weekInfo,
  type Feladat,
} from "@/lib/jelenlet/shared";
import { getArchivedFeladatok, toggleFeladatDone } from "@/lib/jelenlet/actions";

export function FeladatokArchivumView({ initialFeladatok }: { initialFeladatok: Feladat[] }) {
  const canEdit = useCanEdit();
  const [feladatok, setFeladatok] = useState(initialFeladatok);
  const [pending, startTransition] = useTransition();

  function reopen(id: string) {
    startTransition(async () => {
      try {
        await toggleFeladatDone(id, false);
        setFeladatok(await getArchivedFeladatok());
        toast.success("Feladat visszanyitva.");
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  if (feladatok.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Még nincs elvégzett feladat.</CardContent>
      </Card>
    );
  }

  const groups = new Map<string, { label: string; items: Feladat[] }>();
  for (const f of feladatok) {
    const w = weekInfo(f.elvegzes_datum ?? f.task_date);
    const existing = groups.get(w.mondayIso);
    if (existing) existing.items.push(f);
    else groups.set(w.mondayIso, { label: w.label, items: [f] });
  }
  const sortedWeeks = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      {sortedWeeks.map(([mondayIso, group]) => (
        <Card key={mondayIso}>
          <CardContent className="space-y-2">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <ul className="divide-y">
              {group.items.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "flex items-start justify-between gap-2 border-l-4 py-2 pl-2 text-sm",
                    URGENCY_BORDERS[f.urgency]
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={cn("mt-1 size-2.5 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
                      title={URGENCY_LABELS[f.urgency]}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{f.description}</p>
                      <p className="text-muted-foreground">
                        {f.site_name}
                        {f.repeat_freq !== "egyszeri" && (
                          <span className="ml-1.5 rounded-full border border-violet-300 bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">
                            {REPEAT_LABELS[f.repeat_freq]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Kiadva: {f.task_date} — Elvégezve: {f.elvegzes_datum ?? "—"}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={pending}
                      onClick={() => reopen(f.id)}
                    >
                      Visszanyitás
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
