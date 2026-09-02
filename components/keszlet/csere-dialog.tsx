"use client";

import { useState } from "react";
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

const CSERE_PRICE = 800;

export function CsereDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (qty: number) => void;
}) {
  const [qty, setQty] = useState("");
  const n = Number(qty) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Csere rögzítése</DialogTitle>
          <DialogDescription>
            Szürke raklapot adunk, világosat kapunk — plusz 800 Ft/db készpénzt is kapunk
            a különbözetért. Egy lépésben rendezi mindkét EUR-típust és a kasszát.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Cserélt darabszám</Label>
          <Input
            type="number"
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {n > 0 && (
          <div className="space-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            <div>
              Automatikus hatás: <b className="text-foreground">+{n} db</b> EUR világos
            </div>
            <div>
              <b className="text-foreground">−{n} db</b> EUR szürke
            </div>
            <div>
              <b className="text-foreground">
                +{(n * CSERE_PRICE).toLocaleString("hu-HU")} Ft
              </b>{" "}
              kassza ({n} × {CSERE_PRICE} Ft)
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Mégse
          </Button>
          <Button
            disabled={n <= 0}
            onClick={() => {
              onConfirm(n);
              setQty("");
              onOpenChange(false);
            }}
          >
            Rögzítés
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
