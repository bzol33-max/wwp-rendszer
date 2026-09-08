"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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

// Leaflet a böngésző `window` objektumát használja betöltéskor, ezért csak
// kliensoldalon szabad renderelni — dynamic import + ssr:false nélkül a
// szerveroldali renderelés elhasalna.
const RouteMap = dynamic(
  () => import("@/components/fuvarozas/route-map").then((m) => m.RouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-lg border text-xs text-muted-foreground sm:h-96">
        Térkép betöltése…
      </div>
    ),
  }
);

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

const TILES_STORAGE_KEY = "wwp-kalkulator-eredmenyek";

let tileIdCounter = 0;
function nextTileId() {
  tileIdCounter += 1;
  return tileIdCounter;
}

type ResultTile = {
  id: number;
  stops: GeocodedAddress[];
  route: TollRoute;
  /** A számításkor érvényes gázolajár — rögzítve, hogy egy régi csempe eredménye ne változzon utólag. */
  gazolajAr: GazolajArResult | null;
};

function ResultTileCard({
  tile,
  selected,
  onSelect,
  onClose,
}: {
  tile: ResultTile;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { route, stops, gazolajAr } = tile;
  const literek = (route.distanceKm * ATLAG_FOGYASZTAS_L_PER_100KM) / 100;
  const uzemanyagKoltseg = gazolajAr ? Math.round(literek * gazolajAr.ar) : null;
  const utdijKoltseg = route.tollHuf?.grossTotal ?? 0;
  const osszKoltseg = (uzemanyagKoltseg ?? 0) + utdijKoltseg;

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      title="Mutasd a térképen"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative w-full min-w-[220px] cursor-pointer sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        aria-label="Eredmény eltávolítása"
        className="absolute top-2 right-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <CardContent className="flex flex-col gap-1.5 pr-6 text-xs">
        <div className="pr-2 font-medium">{stops.map((s) => s.label).join(" → ")}</div>
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
                {" "}({formatHuf(uzemanyagKoltseg)}, {gazolajAr.ar} Ft/l – {gazolajAr.cimke}, NAV {gazolajAr.navAr}{" "}
                Ft/l - {gazolajAr.kedvezmeny} Ft/l tankolási kedvezmény
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
  // Az eredménycsempéket a böngésző localStorage-ában is megőrizzük, hogy
  // lapváltáskor vagy oldalfrissítéskor is megmaradjanak — csak az "x"
  // gombbal tűnnek el. `betoltve` jelzi, hogy a mentett állapot betöltése
  // megtörtént, hogy az induláskori üres tiles ne írja felül a tárolt
  // adatot, mielőtt beolvasnánk.
  const [betoltve, setBetoltve] = useState(false);
  // A NAV aktuális hivatalos gázolajárát automatikusan, a szerverről kérjük
  // le (lásd lib/fuvarozas/uzemanyagar.ts) — soha nem kell kézzel frissíteni.
  const [gazolajAr, setGazolajAr] = useState<GazolajArResult | null>(null);
  // Melyik eredménycsempe útvonala látszik a térképen — csempére kattintva
  // válatható. `null` = nincs kézzel kiválasztva, ilyenkor (és ha a
  // kiválasztott csempe időközben törlődött) a legutóbbi csempe számít
  // kiválasztottnak, lásd selectedTile lentebb.
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);

  useEffect(() => {
    getGazolajAr().then(setGazolajAr);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ResultTile[];
        if (Array.isArray(parsed)) {
          // A korábbi (stops mező nélküli, stopLabels-alapú) mentett
          // csempéket eldobjuk — a térképhez szükséges koordináták azokból
          // hiányoznak.
          const ervenyes = parsed.filter((t) => Array.isArray(t?.stops));
          setTiles(ervenyes);
          const maxId = ervenyes.reduce((m, t) => Math.max(m, t.id), 0);
          if (maxId >= tileIdCounter) tileIdCounter = maxId + 1;
        }
      }
    } catch {
      // sérült/hiányzó tárolt adat — üresen indulunk
    }
    setBetoltve(true);
  }, []);

  useEffect(() => {
    if (!betoltve) return;
    try {
      localStorage.setItem(TILES_STORAGE_KEY, JSON.stringify(tiles));
    } catch {
      // pl. privát böngészés — nem kritikus, csak a megőrzés marad el
    }
  }, [tiles, betoltve]);

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
      // A végére kerül, nem az elejére — a csempék sorban követik egymást
      // ahogy születnek, a legutóbbi nem ugrik előre.
      const ujCsempe: ResultTile = { id: nextTileId(), stops: res.stops, route: res.route, gazolajAr };
      setTiles((prev) => [...prev, ujCsempe]);
      setSelectedTileId(ujCsempe.id);
    } else {
      toast.error(res.error);
    }
  }

  function removeTile(id: number) {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }

  const selectedTile =
    (selectedTileId != null ? tiles.find((t) => t.id === selectedTileId) : undefined) ??
    tiles[tiles.length - 1] ??
    null;

  return (
    <div className="flex flex-col gap-3">
      {/* overflow-visible: a Card alapból overflow-hidden, ami levágta a
          címmezők alá nyíló javaslat-legördülőt — emiatt nem látszott. */}
      <Card size="sm" className="overflow-visible">
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
                onRemove={i < stops.length - 1 ? () => removeStop(stop.id) : undefined}
              />
            ))}
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Számítás…" : "Számítás"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {selectedTile && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">
              Térkép — {selectedTile.stops.map((s) => s.label).join(" → ")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RouteMap
              stops={selectedTile.stops.map((s, i) => ({
                role: stopLabel(i, selectedTile.stops.length),
                label: s.label,
                lon: s.lon,
                lat: s.lat,
              }))}
              geometryLonLat={selectedTile.route.geometryLonLat}
            />
          </CardContent>
        </Card>
      )}

      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tiles.map((tile) => (
            <ResultTileCard
              key={tile.id}
              tile={tile}
              selected={tile.id === selectedTile?.id}
              onSelect={() => setSelectedTileId(tile.id)}
              onClose={() => removeTile(tile.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
