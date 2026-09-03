"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { recordInventoryCount } from "@/lib/keszlet/actions";
import { kbNav } from "@/lib/keszlet/kbnav";

type Props = {
  site: string;
  types: string[];
  currentStock: Record<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded?: () => void | Promise<void>;
};

export function InventoryDialog({
  site,
  types,
  currentStock,
  open,
  onOpenChange,
  onRecorded,
}: Props) {
  const [step, setStep] = useState(0);
  const [counted, setCounted] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setCounted("");
      setComment("");
    }
  }, [open]);

  const type = types[step];
  const expected = currentStock[type] ?? 0;
  const countedNum = counted === "" ? null : Number(counted);
  const diff = countedNum === null ? 0 : countedNum - expected;
  const done = step >= types.length;

  async function next(accept: boolean | null) {
    if (accept !== null && countedNum !== null && diff !== 0) {
      setSaving(true);
      try {
        await recordInventoryCount({
          site,
          type,
          expectedQty: expected,
          countedQty: countedNum,
          accepted: accept,
          comment: comment || undefined,
        });
        if (accept) {
          toast.success(`${type}: készlet korrigálva ${countedNum} db-ra.`);
        } else {
          toast.info(`${type}: eltérés elutasítva, marad ${expected} db.`);
        }
      } catch {
        toast.error("Nem sikerült menteni a leltári tételt.");
      } finally {
        setSaving(false);
      }
    }
    setCounted("");
    setComment("");
    setStep((s) => s + 1);
  }

  async function finish() {
    onOpenChange(false);
    await onRecorded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-kbnav-group>
        {!done ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Leltár — {site} ({step + 1}/{types.length})
              </DialogTitle>
              <DialogDescription>{type}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Nyilvántartott mennyiség</span>
                <span className="font-semibold tabular-nums">{expected}</span>
              </div>

              <div className="space-y-1.5">
                <Label>Ténylegesen megszámolt darabszám</Label>
                <Input
                  type="number"
                  autoFocus
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  data-kbnav-item
                  onKeyDown={kbNav}
                />
              </div>

              {countedNum !== null && diff !== 0 && (
                <div className="space-y-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Eltérés</span>
                    <Badge className="bg-warning/20 text-warning hover:bg-warning/20">
                      {diff > 0 ? "+" : ""}
                      {diff} db
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Megjegyzés (opcionális)</Label>
                    <Input
                      placeholder="pl. törés, minőségromlás"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      data-kbnav-item
                      onKeyDown={kbNav}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" disabled={saving} onClick={() => next(null)}>
                Kihagy
              </Button>
              <div className="flex gap-2">
                {countedNum !== null && diff !== 0 ? (
                  <>
                    <Button variant="outline" disabled={saving} onClick={() => next(false)}>
                      Eltérés elutasítása
                    </Button>
                    <Button disabled={saving} onClick={() => next(true)} data-kbnav-submit>
                      Korrekció elfogadása
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => next(null)}
                    disabled={countedNum === null}
                    data-kbnav-submit
                  >
                    Tovább
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Leltár kész</DialogTitle>
              <DialogDescription>
                {site} — minden típus végigellenőrizve. A rendszer rögzíti, ki és mikor
                csinálta a leltárt.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={finish}>Bezárás</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
