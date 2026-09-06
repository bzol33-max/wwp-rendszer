"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getFleetPositions, type EcofleetPositionWithCim } from "@/lib/fuvarozas/actions";
import { SAJAT_JARMUVEK, findJarmuByPlate, JARMU_SZIN_DOT_CLASS, type SajatJarmu } from "@/lib/fuvarozas/vehicles";

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

function VehicleCardHeader({
  jarmu,
  cim,
  badge,
}: {
  jarmu: SajatJarmu | null;
  cim: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <CardTitle className="flex items-center gap-1.5 text-sm">
        {jarmu && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        )}
        {cim}
      </CardTitle>
      {badge}
    </div>
  );
}

function VehicleCard({ pos, jarmu }: { pos: EcofleetPositionWithCim; jarmu: SajatJarmu | null }) {
  const when = parseEcofleetTimestamp(pos.timestamp);
  const mapsUrl = `https://www.google.com/maps?q=${pos.latitude},${pos.longitude}`;
  const nev = jarmu ? `${jarmu.sofor} — ${pos.plate || pos.name}` : pos.plate || pos.name;

  return (
    <Card>
      <CardHeader>
        <VehicleCardHeader
          jarmu={jarmu}
          cim={nev}
          badge={
            <Badge variant={pos.engineOn ? "default" : "secondary"}>
              {pos.engineOn ? "Fut a motor" : "Áll"}
            </Badge>
          }
        />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground shrink-0">Cím</span>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-right text-primary hover:underline"
            >
              {pos.cim ?? "térképen"}
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sebesség</span>
            <span>{pos.speed} km/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Utolsó adat</span>
            <span>{formatAgo(when)}</span>
          </div>
          {pos.odometerKm !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Óraállás</span>
              <span>{pos.odometerKm.toLocaleString("hu-HU")} km</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Saját jármű, aminek még nincs élő GPS-adata (nincs rendszáma, vagy az Ecofleet nem ad rá pozíciót). */
function PlaceholderVehicleCard({ jarmu, ismeretlen }: { jarmu: SajatJarmu; ismeretlen: boolean }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <VehicleCardHeader
          jarmu={jarmu}
          cim={`${jarmu.sofor} — ${jarmu.label}`}
          badge={<Badge variant="secondary">Nincs GPS-adat</Badge>}
        />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {jarmu.rendszamok.length === 0
            ? "A jármű még gyártás alatt van, egyelőre nincs rendszáma és Ecofleet-kapcsolata."
            : ismeretlen
              ? "Rendszáma megvan, de az Ecofleet jelenleg nem ad vissza rá pozíciót."
              : "Egyelőre nincs elérhető pozícióadat."}
        </p>
      </CardContent>
    </Card>
  );
}

export function GpsStatus() {
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<EcofleetPositionWithCim[]>([]);
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

  // Minden saját jármű mindig megjelenik egy kártyával — akinek van élő
  // Ecofleet-pozíciója, azt mutatjuk; akinek nincs (mert még gyártás alatt
  // van, vagy az Ecofleet épp nem ad rá adatot), az egy "Nincs GPS-adat"
  // helykitöltő kártyát kap ugyanazzal a végleges dizájnnal — így amint egy
  // jármű rendszámot kap és bekötésre kerül az Ecofleet-be, csak a
  // vehicles.ts-t kell frissíteni, a felület már kész.
  const matchedPositions = new Set<string>();
  const jarmuCards = SAJAT_JARMUVEK.map((jarmu) => {
    const pos = positions.find((p) => findJarmuByPlate(p.plate)?.sofor === jarmu.sofor);
    if (pos) matchedPositions.add(pos.objectId);
    return { jarmu, pos };
  });
  const ismeretlenPozicok = positions.filter((p) => !matchedPositions.has(p.objectId));

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
        {!(loading && positions.length === 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jarmuCards.map(({ jarmu, pos }) =>
              pos ? (
                <VehicleCard key={jarmu.sofor} pos={pos} jarmu={jarmu} />
              ) : (
                <PlaceholderVehicleCard
                  key={jarmu.sofor}
                  jarmu={jarmu}
                  ismeretlen={jarmu.rendszamok.length > 0 && !error}
                />
              )
            )}
            {ismeretlenPozicok.map((pos) => (
              <VehicleCard key={pos.objectId} pos={pos} jarmu={findJarmuByPlate(pos.plate)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
