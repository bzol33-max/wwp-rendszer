"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Vegyes EUR" készletsor, amelyikre rákattintva egy kis inline ablak nyílik
 * Világos/Szürke mezőkkel — a beírt mennyiség levonódik a Vegyesből, és
 * hozzáadódik a megfelelő típushoz. Bármelyik telephelyen használható, ahol
 * aktív a Vegyes EUR típus.
 */
export function VegyesSplitRow({
  qty,
  onSubmit,
}: {
  qty: number;
  onSubmit: (vilagos: number, szurke: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [vilagos, setVilagos] = useState("");
  const [szurke, setSzurke] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const total = (Number(vilagos) || 0) + (Number(szurke) || 0);
  const over = total > qty;

  function close() {
    setOpen(false);
    setVilagos("");
    setSzurke("");
  }

  async function handleSubmit() {
    if (total <= 0 || over) return;
    setSubmitting(true);
    try {
      await onSubmit(Number(vilagos) || 0, Number(szurke) || 0);
      close();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm"
      >
        <span>Vegyes EUR</span>
        <span className="font-semibold tabular-nums">{qty}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Világos</label>
              <Input
                type="number"
                placeholder="db"
                value={vilagos}
                onChange={(e) => setVilagos(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Szürke</label>
              <Input
                type="number"
                placeholder="db"
                value={szurke}
                onChange={(e) => setSzurke(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          {over && (
            <p className="text-xs text-destructive">
              A megadott összeg ({total}) meghaladja az elérhető Vegyes EUR mennyiséget.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={submitting} onClick={close}>
              Mégse
            </Button>
            <Button size="sm" disabled={total <= 0 || over || submitting} onClick={handleSubmit}>
              {submitting ? "Mentés…" : "Szétválogatás"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
