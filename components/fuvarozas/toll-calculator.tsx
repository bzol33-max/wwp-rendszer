"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  calculateTollForAddresses,
  calculateTollForPoints,
  searchAddressSuggestions,
} from "@/lib/fuvarozas/actions";
import type { GeocodedAddress, TollRoute } from "@/lib/fuvarozas/utdijkalkulacio";

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}ó ${m}p` : `${m}p`;
}

function formatHuf(n: number): string {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

function AddressField({
  placeholder,
  value,
  onChange,
  onSelect,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (a: GeocodedAddress) => void;
}) {
  const [suggestions, setSuggestions] = useState<GeocodedAddress[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const results = await searchAddressSuggestions(v);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 250);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={`${s.lon},${s.lat}`}
              type="button"
              className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(s);
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteResult({ route }: { route: TollRoute }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-border p-2 text-xs">
      <span className="font-medium">
        {route.distanceKm.toLocaleString("hu-HU")} km · {formatDuration(route.durationMin)}
      </span>
      {route.tollHuf ? (
        <span>
          Útdíj: <span className="font-medium">{formatHuf(route.tollHuf.grossTotal)}</span>
          <span className="text-muted-foreground">
            {" "}
            ({formatHuf(route.tollHuf.infrastructure)} infra + {formatHuf(route.tollHuf.external)} külső)
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">Nincs útdíjköteles szakasz.</span>
      )}
    </div>
  );
}

export function TollCalculator() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fromPoint = useRef<GeocodedAddress | null>(null);
  const toPoint = useRef<GeocodedAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    fromLabel: string;
    toLabel: string;
    route: TollRoute;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) {
      toast.error("Add meg mindkét címet.");
      return;
    }

    setLoading(true);
    setResult(null);
    const res =
      fromPoint.current && toPoint.current
        ? await calculateTollForPoints(fromPoint.current, toPoint.current)
        : await calculateTollForAddresses(from, to);
    setLoading(false);

    if (res.ok) {
      setResult({ fromLabel: res.fromLabel, toLabel: res.toLabel, route: res.route });
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">Útdíj- és km-kalkulátor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
          <AddressField
            placeholder="Honnan"
            value={from}
            onChange={(v) => {
              setFrom(v);
              fromPoint.current = null;
            }}
            onSelect={(a) => {
              setFrom(a.label);
              fromPoint.current = a;
            }}
          />
          <AddressField
            placeholder="Hová"
            value={to}
            onChange={(v) => {
              setTo(v);
              toPoint.current = null;
            }}
            onSelect={(a) => {
              setTo(a.label);
              toPoint.current = a;
            }}
          />
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Számítás…" : "Számítás"}
          </Button>
        </form>

        {result && (
          <div className="mt-2">
            <RouteResult route={result.route} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
