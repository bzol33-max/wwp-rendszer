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

export function SzetvalogatasDialog({
  open,
  onOpenChange,
  vegyesAvailable,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vegyesAvailable: number;
  onConfirm: (result: { vilagos: number; szurke: number; torott: number }) => void;
}) {
  const [vilagos, setVilagos] = useState("");
  const [szurke, setSzurke] = useState("");
  const [torott, setTorott] = useState("");

  const total = (Number(vilagos) || 0) + (Number(szurke) || 0) + (Number(torott) || 0);
  const over = total > vegyesAvailable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Szétválogatás</DialogTitle>
          <DialogDescription>
            Vegyes EUR tétel szétbontása. Elvégezhető részletekben, több napra elhúzódva is —
            most csak a ma elvégzett mennyiséget add meg.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Elérhető Vegyes EUR</span>{" "}
          <span className="font-semibold tabular-nums">{vegyesAvailable} db</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Világos</Label>
            <Input type="number" value={vilagos} onChange={(e) => setVilagos(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Szürke</Label>
            <Input type="number" value={szurke} onChange={(e) => setSzurke(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Törött</Label>
            <Input type="number" value={torott} onChange={(e) => setTorott(e.target.value)} />
          </div>
        </div>

        {over && (
          <p className="text-xs text-destructive">
            A megadott összeg ({total}) meghaladja az elérhető Vegyes EUR mennyiséget.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Mégse
          </Button>
          <Button
            disabled={total <= 0 || over}
            onClick={() => {
              onConfirm({
                vilagos: Number(vilagos) || 0,
                szurke: Number(szurke) || 0,
                torott: Number(torott) || 0,
              });
              setVilagos("");
              setSzurke("");
              setTorott("");
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
