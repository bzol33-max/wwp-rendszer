"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getFleetPositions } from "@/lib/fuvarozas/actions";
import type { EcofleetPosition } from "@/lib/fuvarozas/ecofleet";

/** "2026-09-04 13:35:05+0200" -> Date (a +0200 már helyi eltolás, nincs újraszámolás) */
function parseEcofleetTimestamp(ts: string): Date | null {
  const normalized = ts.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAgo(d: Date | null): string {
  if (!d) return "ismeretlen időpont";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "most";
  if (diffMin < 60) return `${diffMin} perce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} órája`;
  return d.toLocaleString("hu-HU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function VehicleCard({ pos }: { pos: EcofleetPosition }) {
  const when = parseEcofleetTimestamp(pos.timestamp);
  const mapsUrl = `https://www.google.com/maps?q=${pos.latitude},${pos.longitude}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{pos.plate || pos.name}</CardTitle>
          <Badge variant={pos.engineOn ? "default" : "secondary"}>
            {pos.engineOn ? "Fut a motor" : "Áll"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Utolsó adat</span>
            <span>{formatAgo(when)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sebesség</span>
            <span>{pos.speed} km/h</span>
          </div>
          {pos.odometerKm !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Óraállás</span>
              <span>{pos.odometerKm.toLocaleString("hu-HU")} km</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pozíció</span>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              térképen
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GpsStatus() {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<EcofleetPosition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const result = await getFleetPositions();
    if (result.ok) {
      setPositions(result.positions);
      setError(null);
    } else {
      setError(result.error);
      if (opts?.silent) toast.error(result.error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setLoading(true);
    await load({ silent: true });
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Járművek GPS-pozíciója</CardTitle>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            {loading ? "Frissítés…" : "Frissítés"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && positions.length === 0 && (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        )}
        {!loading && error && positions.length === 0 && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {positions.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {positions.map((pos) => (
              <VehicleCard key={pos.objectId} pos={pos} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
