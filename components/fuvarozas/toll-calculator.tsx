"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { calculateTollForAddresses } from "@/lib/fuvarozas/actions";
import {
  EURO_CATEGORIES,
  VEHICLE_CATEGORIES,
  type EuroCategory,
  type TollRoute,
  type VehicleCategory,
} from "@/lib/fuvarozas/utdijkalkulacio";

const METHOD_LABEL: Record<string, string> = {
  FAST: "Leggyorsabb",
  ECONOMY: "Legolcsóbb",
};

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} óra ${m} perc` : `${m} perc`;
}

function formatHuf(n: number): string {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

function RouteResult({ route }: { route: TollRoute }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{METHOD_LABEL[route.method] ?? route.method}</span>
        <span className="text-muted-foreground">{formatDuration(route.durationMin)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Távolság</span>
        <span>{route.distanceKm.toLocaleString("hu-HU")} km</span>
      </div>
      {route.tollHuf ? (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Infrastruktúra díj</span>
            <span>{formatHuf(route.tollHuf.infrastructure)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Külsőköltség-díj</span>
            <span>{formatHuf(route.tollHuf.external)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Bruttó összesen</span>
            <span>{formatHuf(route.tollHuf.grossTotal)}</span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Ezen az útvonalon nincs útdíjköteles szakasz.</p>
      )}
    </div>
  );
}

export function TollCalculator() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("J5");
  const [euroCategory, setEuroCategory] = useState<EuroCategory>("EURO6");
  const [weight, setWeight] = useState("40");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    fromLabel: string;
    toLabel: string;
    routes: TollRoute[];
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) {
      toast.error("Add meg mindkét címet.");
      return;
    }
    const weightNum = Number(weight);
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      toast.error("Az össztömeg nem érvényes.");
      return;
    }

    setLoading(true);
    setResult(null);
    const res = await calculateTollForAddresses({
      from,
      to,
      vehicleCategory,
      euroCategory,
      weight: weightNum,
    });
    setLoading(false);

    if (res.ok) {
      setResult({ fromLabel: res.fromLabel, toLabel: res.toLabel, routes: res.routes });
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Útdíj- és távolságkalkulátor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="toll-from">Honnan</Label>
              <Input
                id="toll-from"
                placeholder="pl. Szakoly, Rákóczi út 26"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="toll-to">Hová</Label>
              <Input
                id="toll-to"
                placeholder="pl. Sárvár"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Jármű-kategória</Label>
              <Select
                value={vehicleCategory}
                onValueChange={(v) => v && setVehicleCategory(v as VehicleCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Környezetvédelmi besorolás</Label>
              <Select
                value={euroCategory}
                onValueChange={(v) => v && setEuroCategory(v as EuroCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EURO_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="toll-weight">Össztömeg (t)</Label>
              <Input
                id="toll-weight"
                type="number"
                min={3.5}
                max={44}
                step={0.5}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="self-start">
            {loading ? "Számítás…" : "Számítás"}
          </Button>
        </form>

        {result && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {result.fromLabel} → {result.toLabel}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.routes.map((route, i) => (
                <RouteResult key={`${route.method}-${i}`} route={route} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
