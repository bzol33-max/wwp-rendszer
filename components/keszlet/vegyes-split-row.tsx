"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SzetvalogatasTetel = { type: string; qty: number };

/**
 * Szétválogatható ("vegyes") készletsor: rákattintva egy kis inline ablak
 * nyílik, ahol a célokhoz darabszámot lehet írni. A beírt mennyiség levonódik
 * a vegyes készletből, és hozzáadódik a megfelelő típushoz.
 *
 * Két forrása van: a "Vegyes EUR" (EUR világos / szürke / törött), és a
 * "Vegyes" (bármelyik, a telepen aktív típus — pl. színes, egyutas), ahol a
 * célokat a hívó adja meg a `celok` listában.
 */
export function VegyesSplitRow({
  source,
  qty,
  celok,
  onSubmit,
}: {
  source: string;
  qty: number;
  celok: string[];
  onSubmit: (tetelek: SzetvalogatasTetel[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [ertekek, setErtekek] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const beirt = celok.map((c) => ertekek[c] ?? "");
  const total = beirt.reduce((s, v) => s + (Number(v) || 0), 0);
  const over = total > qty;
  const nemEgesz = beirt.some((v) => v !== "" && !Number.isInteger(Number(v)));
  const negativ = beirt.some((v) => v !== "" && Number(v) < 0);
  const hibas = total <= 0 || over || nemEgesz || negativ;

  function close() {
    setOpen(false);
    setErtekek({});
  }

  async function handleSubmit() {
    if (hibas) return;
    setSubmitting(true);
    try {
      await onSubmit(
        celok
          .map((c) => ({ type: c, qty: Number(ertekek[c]) || 0 }))
          .filter((t) => t.qty > 0)
      );
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
        <span>{source}</span>
        <span className="font-semibold tabular-nums">{qty}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-2 gap-2">
            {celok.map((cel, i) => (
              <div key={cel} className="space-y-1">
                <label className="text-[11px] text-muted-foreground">{cel}</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="db"
                  value={ertekek[cel] ?? ""}
                  onChange={(e) => setErtekek((prev) => ({ ...prev, [cel]: e.target.value }))}
                  className="h-8"
                  autoFocus={i === 0}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Szétválogatva: {total} db</span>
            <span>Marad: {Math.max(qty - total, 0)} db</span>
          </div>
          {over && (
            <p className="text-xs text-destructive">
              A megadott összeg ({total}) meghaladja az elérhető {source} mennyiséget.
            </p>
          )}
          {(nemEgesz || negativ) && (
            <p className="text-xs text-destructive">Csak egész, nem negatív szám adható meg.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={submitting} onClick={close}>
              Mégse
            </Button>
            <Button size="sm" disabled={hibas || submitting} onClick={handleSubmit}>
              {submitting ? "Mentés…" : "Szétválogatás"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
