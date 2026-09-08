"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeladatCommentsDialog } from "@/components/jelenlet/feladat-comments-dialog";
import { UjFeladatForm } from "@/components/jelenlet/uj-feladat-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  type Feladat,
  type Site,
} from "@/lib/jelenlet/shared";
import { deleteFeladat, getSites, listFeladatok, toggleFeladatDone } from "@/lib/jelenlet/actions";

function FeladatRow({
  feladat,
  canEdit,
  onReload,
  onOpenComments,
}: {
  feladat: Feladat;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
  onOpenComments: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggle(done: boolean) {
    startTransition(async () => {
      await toggleFeladatDone(feladat.id, done);
      await onReload();
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteFeladat(feladat.id);
      await onReload();
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-2 text-xs",
        feladat.done && "opacity-50"
      )}
    >
      <span
        title={URGENCY_LABELS[feladat.urgency]}
        className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", URGENCY_COLORS[feladat.urgency])}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn("font-medium", feladat.done && "line-through")}>{feladat.description}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <span>{feladat.task_date}</span>
          <span>·</span>
          <span>{feladat.site_name}</span>
          {feladat.repeat_freq !== "egyszeri" && (
            <>
              <span>·</span>
              <span>{REPEAT_LABELS[feladat.repeat_freq]}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="icon-xs" variant="ghost" onClick={onOpenComments}>
          <MessageSquare />
        </Button>
        {canEdit && (
          <>
            <Checkbox
              checked={feladat.done}
              disabled={pending}
              onCheckedChange={(v) => toggle(v === true)}
            />
            <Button size="icon-xs" variant="ghost" disabled={pending} onClick={remove}>
              <X />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function FeladatokCsempe() {
  const canEdit = useCanEdit();
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feladat | null>(null);

  const load = useCallback(async () => {
    const [siteRows, taskRows] = await Promise.all([getSites(), listFeladatok()]);
    setSites(siteRows);
    setFeladatok(taskRows);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Feladatok</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          <>
            <UjFeladatForm sites={sites} canEdit={canEdit} onCreated={load} />
            {feladatok.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nincs rögzített feladat.</p>
            ) : (
              <div className="space-y-1.5">
                {feladatok.map((f) => (
                  <FeladatRow
                    key={f.id}
                    feladat={f}
                    canEdit={canEdit}
                    onReload={load}
                    onOpenComments={() => setSelected(f)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
      <FeladatCommentsDialog
        feladat={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={load}
      />
    </Card>
  );
}
