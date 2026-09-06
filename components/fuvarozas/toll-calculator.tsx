"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  calculateTollForAddresses,
  calculateTollForPoints,
  getGazolajAr,
  searchAddressSuggestions,
  type GazolajArResult,
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

// A flotta átlagfogyasztása — nincs kocsinkénti/terhelésenkénti adat, ezért
// egyetlen fix átlaggal számolunk (a spec 17. pontja: km alapján üzemanyag-
// költség is a fuvarköltség számításához).
const ATLAG_FOGYASZTAS_L_PER_100KM = 30;

function formatLiter(l: number): string {
  return `${l.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} l`;
}

function AddressField({
  placeholder,
  value,
  onChange,
  onSelect,
  onRemove,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (a: GeocodedAddress) => void;
  /** Csak a köztes megállóknál — ha meg van adva, egy "x" gomb eltávolítja a mezőt. */
  onRemove?: () => void;
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
        className={onRemove ? "pr-7" : undefined}
      />
      {onRemove && (
        <button
          type="button"
          aria-label="Megálló eltávolítása"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
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

let tileIdCounter = 0;
function nextTileId() {
  tileIdCounter += 1;
  return tileIdCounter;
}

type ResultTile = {
  id: number;
  stopLabels: string[];
  route: TollRoute;
  /** A számításkor érvényes gázolajár — rögzítve, hogy egy régi csempe eredménye ne változzon utólag. */
  gazolajAr: GazolajArResult | null;
};

function ResultTileCard({ tile, onClose }: { tile: ResultTile; onClose: () => void }) {
  const { route, stopLabels, gazolajAr } = tile;
  const literek = (route.distanceKm * ATLAG_FOGYASZTAS_L_PER_100KM) / 100;
  const uzemanyagKoltseg = gazolajAr ? Math.round(literek * gazolajAr.ar) : null;
  const utdijKoltseg = route.tollHuf?.grossTotal ?? 0;
  const osszKoltseg = (uzemanyagKoltseg ?? 0) + utdijKoltseg;

  return (
    <Card size="sm" className="relative w-full min-w-[220px] sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]">
      <button
        type="button"
        aria-label="Eredmény eltávolítása"
        className="absolute top-2 right-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <CardContent className="flex flex-col gap-1.5 pr-6 text-xs">
        <div className="pr-2 font-medium">{stopLabels.join(" → ")}</div>
        <div className="flex flex-col gap-0.5 text-muted-foreground">
          <div>
            Táv: <span className="font-medium text-foreground">{route.distanceKm.toLocaleString("hu-HU")} km</span>
            {" "}({formatDuration(route.durationMin)})
          </div>
          {route.tollHuf ? (
            <div>
              Útdíj: <span className="font-medium text-foreground">{formatHuf(route.tollHuf.grossTotal)}</span>
            </div>
          ) : (
            <div>Útdíj: nincs útdíjköteles szakasz.</div>
          )}
          <div>
            Üzemanyag: <span className="font-medium text-foreground">{formatLiter(literek)}</span>
            {gazolajAr && uzemanyagKoltseg != null && (
              <>
                {" "}({formatHuf(uzemanyagKoltseg)}, {gazolajAr.ar} Ft/l – {gazolajAr.cimke}
                {!gazolajAr.friss && ", nem sikerült frissíteni"})
              </>
            )}
          </div>
          <div className="pt-0.5 text-sm font-semibold text-foreground">
            Össz. költség: {formatHuf(osszKoltseg)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

let stopIdCounter = 0;
function nextStopId() {
  stopIdCounter += 1;
  return stopIdCounter;
}

type Stop = {
  id: number;
  value: string;
  point: GeocodedAddress | null;
};

function newStop(): Stop {
  return { id: nextStopId(), value: "", point: null };
}

/** Első mező mindig "Honnan", utolsó mindig "Hová", a köztesek "Megálló N". */
function stopLabel(index: number, count: number): string {
  if (index === 0) return "Honnan";
  if (index === count - 1) return "Hová";
  return `Megálló ${index}`;
}

export function TollCalculator() {
  // Több-megállós útvonal: a lista mindig "Honnan" + "Hová" két mezővel indul.
  // Amint minden mező ki van töltve (nincs üres), automatikusan megjelenik egy
  // új, üres mező a lista végén, az eddigi utolsó cím után — így tetszőleges
  // számú megálló felvehető anélkül, hogy külön "+" gombot kellene keresni.
  const [stops, setStops] = useState<Stop[]>([newStop(), newStop()]);
  const [loading, setLoading] = useState(false);
  // Minden sikeres számítás egy külön csempeként megmarad a kalkulátor alatt
  // (legújabb elöl), amíg valaki be nem zárja — így egyszerre több eredmény
  // is összehasonlítható.
  const [tiles, setTiles] = useState<ResultTile[]>([]);
  // A NAV aktuális hivatalos gázolajárát automatikusan, a szerverről kérjük
  // le (lásd lib/fuvarozas/uzemanyagar.ts) — soha nem kell kézzel frissíteni.
  const [gazolajAr, setGazolajAr] = useState<GazolajArResult | null>(null);

  useEffect(() => {
    getGazolajAr().then(setGazolajAr);
  }, []);

  function updateStop(id: number, patch: Partial<Stop>) {
    setStops((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      const mindKitoltve = next.every((s) => s.value.trim().length > 0);
      // Ha minden mező ki van töltve, egy új üres mező kerül a lista végére
      // (a jelenlegi utolsó cím után) — az addig utolsó mezőből "Hová"
      // helyett köztes megálló lesz, az új mező veszi át a "Hová" helyet.
      if (mindKitoltve) {
        next.push(newStop());
      }
      return next;
    });
  }

  function removeStop(id: number) {
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((s) => s.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Az esetleges üres, még kitöltetlen "következő megálló" mezőt (ami a
    // legutóbbi kitöltés miatt automatikusan megjelent) figyelmen kívül
    // hagyjuk a számításnál.
    const kitoltottek = stops.filter((s) => s.value.trim().length > 0);
    if (kitoltottek.length < 2) {
      toast.error("Add meg legalább a Honnan és a Hová címet.");
      return;
    }

    setLoading(true);
    const res = kitoltottek.every((s) => s.point)
      ? await calculateTollForPoints(kitoltottek.map((s) => s.point as GeocodedAddress))
      : await calculateTollForAddresses(kitoltottek.map((s) => s.value));
    setLoading(false);

    if (res.ok) {
      setTiles((prev) => [
        { id: nextTileId(), stopLabels: res.stopLabels, route: res.route, gazolajAr },
        ...prev,
      ]);
    } else {
      toast.error(res.error);
    }
  }

  function removeTile(id: number) {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Útdíj- és km-kalkulátor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
            {stops.map((stop, i) => (
              <AddressField
                key={stop.id}
                placeholder={stopLabel(i, stops.length)}
                value={stop.value}
                onChange={(v) => updateStop(stop.id, { value: v, point: null })}
                onSelect={(a) => updateStop(stop.id, { value: a.label, point: a })}
                onRemove={i > 0 && i < stops.length - 1 ? () => removeStop(stop.id) : undefined}
              />
            ))}
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Számítás…" : "Számítás"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tiles.map((tile) => (
            <ResultTileCard key={tile.id} tile={tile} onClose={() => removeTile(tile.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
