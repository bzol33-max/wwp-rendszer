"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
  todayIso,
  type RepeatFreq,
  type Site,
} from "@/lib/jelenlet/shared";
import { createFeladat } from "@/lib/jelenlet/actions";

// Új feladat felvétele — a Jelenlét admin nézet "Feladat rögzítése"
// csempéje (feladat-rogzites-tile.tsx) használja.
export function UjFeladatForm({
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
