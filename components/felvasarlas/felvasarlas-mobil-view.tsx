"use client";

import { useMemo, useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { logout } from "@/lib/auth/actions";
import { addPurchase, type PriceRow } from "@/lib/keszlet/actions";
import { getCurrentUser } from "@/lib/current-user";

function todayLabel() {
  const raw = new Date().toLocaleDateString("hu-HU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
  return raw;
}

export function FelvasarlasMobilView({ prices }: { prices: PriceRow[] }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [submitting, startSubmit] = useTransition();

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of prices) if (p.default_price) m[p.name] = p.default_price;
    return m;
  }, [prices]);

  const entries = Object.entries(qty).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((sum, [type, v]) => sum + Number(v) * (priceMap[type] ?? 0), 0);

  function submit() {
    if (entries.length === 0) {
      toast.error("Adj meg legalább egy típust darabszámmal.");
      return;
    }
    startSubmit(async () => {
      try {
        for (const [type, v] of entries) {
          await addPurchase({
            type,
            qty: Number(v),
            unitPrice: priceMap[type] ?? 0,
            method: "keszpenz",
            createdBy: getCurrentUser() || undefined,
          });
        }
        setQty({});
        toast.success("Vétel rögzítve a mai napra.");
      } catch {
        toast.error("Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Felvásárlás</h1>
          <p className="text-xs text-muted-foreground capitalize">{todayLabel()}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Kilépés
          </button>
        </form>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 content-start">
        {prices.map((p) => {
          const active = Number(qty[p.name]) > 0;
          return (
            <div
              key={p.name}
              className={`flex flex-col gap-1.5 rounded-xl border p-2.5 ${
                active ? "border-primary bg-accent" : "border-border bg-card"
              }`}
            >
              <div className="min-h-8 text-[13px] leading-tight font-medium">{p.name}</div>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={qty[p.name] ?? ""}
                onChange={(e) => setQty((prev) => ({ ...prev, [p.name]: e.target.value }))}
                className="h-11 text-center text-lg font-bold"
              />
              <div className="text-center text-[11px] text-muted-foreground">
                {p.default_price} Ft/db
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(20,20,30,0.06)]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Összesen · {entries.length} tétel</span>
          <span className="text-xl font-bold tabular-nums">{total.toLocaleString("hu-HU")} Ft</span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="h-[52px] rounded-lg bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Mentés…" : "Rögzítés a mai napra"}
        </button>
      </div>
    </div>
  );
}
