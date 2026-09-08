"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  type Feladat,
  type FeladatComment,
} from "@/lib/jelenlet/shared";
import {
  addFeladatComment,
  deleteFeladat,
  getFeladatComments,
  toggleFeladatDone,
} from "@/lib/jelenlet/actions";

// Megjegyzés-szál egy feladathoz — az admin (Jelenlét oldal) és a
// dolgozói saját (mobil /erkezes) nézet is ezt használja, hogy mindkét
// oldal ugyanazt a beszélgetést lássa a feladat alatt.
export function FeladatCommentsDialog({
  feladat,
  open,
  onOpenChange,
  onChanged,
  showDoneToggle = false,
  canEdit = false,
}: {
  feladat: Feladat | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
  showDoneToggle?: boolean;
  /** Admin nézetben: megjelenít egy Törlés gombot is. */
  canEdit?: boolean;
}) {
  const [comments, setComments] = useState<FeladatComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !feladat) return;
    setText("");
    setLoading(true);
    getFeladatComments(feladat.id)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [open, feladat]);

  if (!feladat) return null;

  function addComment() {
    if (!feladat || !text.trim()) return;
    startTransition(async () => {
      try {
        await addFeladatComment({
          feladatId: feladat.id,
          author: getCurrentUser() || undefined,
          comment: text,
        });
        setText("");
        setComments(await getFeladatComments(feladat.id));
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  function toggleDone() {
    if (!feladat) return;
    startTransition(async () => {
      await toggleFeladatDone(feladat.id, !feladat.done);
      await onChanged();
      onOpenChange(false);
    });
  }

  function remove() {
    if (!feladat) return;
    startTransition(async () => {
      await deleteFeladat(feladat.id);
      await onChanged();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span
              className={cn("size-2.5 shrink-0 rounded-full", URGENCY_COLORS[feladat.urgency])}
            />
            <span className="truncate">{feladat.description}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            {feladat.site_name} · {feladat.task_date}
          </div>
          <div>
            {URGENCY_LABELS[feladat.urgency]}
            {feladat.repeat_freq !== "egyszeri" && ` · ${REPEAT_LABELS[feladat.repeat_freq]}`}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Megjegyzések</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Betöltés…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nincs még megjegyzés.</p>
          ) : (
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md bg-muted/60 p-2 text-xs">
                  <div className="mb-0.5 text-[10px] text-muted-foreground">
                    {c.author ?? "Ismeretlen"} · {c.created_at}
                  </div>
                  {c.comment}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Megjegyzés…"
              className="h-8"
            />
            <Button size="sm" onClick={addComment} disabled={pending || !text.trim()}>
              Küldés
            </Button>
          </div>
        </div>

        {showDoneToggle && (
          <Button
            className="w-full"
            variant={feladat.done ? "outline" : "default"}
            onClick={toggleDone}
            disabled={pending}
          >
            {feladat.done ? "Visszavonás (nincs kész)" : "✓ Elvégezve"}
          </Button>
        )}
        {canEdit && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={remove}
            disabled={pending}
          >
            Törlés
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
