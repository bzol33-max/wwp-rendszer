"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
  todayIso,
  type Feladat,
  type RepeatFreq,
  type Site,
} from "@/lib/jelenlet/shared";
import { createFeladat, deleteFeladat, getSites, listFeladatok, toggleFeladatDone } from "@/lib/jelenlet/actions";

function UjFeladatForm({
  sites,
  canEdit,
  onCreated,
}: {
  sites: Site[];
  canEdit: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [date, setDate] = useState(todayIso());
  const [siteId, setSiteId] = useState(sites[0] ? String(sites[0].id) : "");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("3");
  const [repeatFreq, setRepeatFreq] = useState<RepeatFreq>("egyszeri");
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  function submit() {
    if (!description.trim()) {
      toast.error("Add meg a feladat leírását.");
      return;
    }
    if (!siteId) {
      toast.error("Válassz telephelyet.");
      return;
    }
    startTransition(async () => {
      try {
        await createFeladat({
          taskDate: date,
          siteId: Number(siteId),
          description,
          urgency: Number(urgency),
          repeatFreq,
          createdBy: getCurrentUser() || undefined,
        });
        setDescription("");
        setUrgency("3");
        setRepeatFreq("egyszeri");
        await onCreated();
        toast.success("Feladat rögzítve.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Dátum</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Telep</Label>
          <Select value={siteId} onValueChange={(v) => v && setSiteId(v)}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Feladat</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mit kell elvégezni?"
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sürgősség</Label>
          <Select value={urgency} onValueChange={(v) => v && setUrgency(v)}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_LEVELS.map((level) => (
                <SelectItem key={level} value={String(level)}>
                  <span className={cn("size-2.5 rounded-full", URGENCY_COLORS[level])} />
                  {URGENCY_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ismétlődés</Label>
          <Select value={repeatFreq} onValueChange={(v) => v && setRepeatFreq(v as RepeatFreq)}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REPEAT_LABELS) as RepeatFreq[]).map((freq) => (
                <SelectItem key={freq} value={freq}>
                  {REPEAT_LABELS[freq]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="xs" onClick={submit} disabled={pending} className="w-full">
        {pending ? "Mentés…" : "Hozzáadás"}
      </Button>
    </div>
  );
}

function FeladatRow({
  feladat,
  canEdit,
  onReload,
}: {
  feladat: Feladat;
  canEdit: boolean;
  onReload: () => void | Promise<void>;
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
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <Checkbox
            checked={feladat.done}
            disabled={pending}
            onCheckedChange={(v) => toggle(v === true)}
          />
          <Button size="icon-xs" variant="ghost" disabled={pending} onClick={remove}>
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

export function FeladatokCsempe() {
  const canEdit = useCanEdit();
  const [sites, setSites] = useState<Site[]>([]);
  const [feladatok, setFeladatok] = useState<Feladat[]>([]);
  const [loading, setLoading] = useState(true);

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
                  <FeladatRow key={f.id} feladat={f} canEdit={canEdit} onReload={load} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
