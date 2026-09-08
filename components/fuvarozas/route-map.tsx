"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L, { type LatLngExpression, type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export type RouteMapStop = {
  /** pl. "Honnan", "Megálló 1", "Hová" — a toll-calculator stopLabel()-jéből. */
  role: string;
  label: string;
  lon: number;
  lat: number;
};

const ROLE_SZIN: Record<string, string> = {
  honnan: "#16a34a",
  hova: "#dc2626",
};

function allomasIkon(index: number, role: string) {
  const kulcs = role.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const bg = ROLE_SZIN[kulcs] ?? "#2563eb";
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${bg};color:#fff;font-size:11px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${index + 1}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** A MapContainer belsejéből (useMap) automatikusan ráigazítja a nézetet az adott pontokra/vonalra. */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [map, bounds]);
  return null;
}

/**
 * A Kalkulátor fülön beütött állomásokat és a HU-GO kalkulátor által
 * kiszámított leggyorsabb útvonalat mutató térkép. Ha a HU-GO válaszából nem
 * sikerül vonalgeometriát kinyerni (lásd extractRouteGeometry a
 * utdijkalkulacio.ts-ben), az állomásokat egy szaggatott, jól láthatóan
 * "közelítő" egyenes köti össze a tényleges útvonal helyett.
 */
export function RouteMap({
  stops,
  geometryLonLat,
}: {
  stops: RouteMapStop[];
  geometryLonLat: [number, number][] | null;
}) {
  const pontosVonal = geometryLonLat && geometryLonLat.length > 1;

  const routeLine: LatLngExpression[] | null = useMemo(() => {
    if (geometryLonLat && geometryLonLat.length > 1) {
      return geometryLonLat.map(([lon, lat]) => [lat, lon] as LatLngExpression);
    }
    if (stops.length > 1) {
      return stops.map((s) => [s.lat, s.lon] as LatLngExpression);
    }
    return null;
  }, [geometryLonLat, stops]);

  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    const pontok = routeLine ?? stops.map((s) => [s.lat, s.lon] as LatLngExpression);
    return pontok.length > 0 ? L.latLngBounds(pontok) : null;
  }, [routeLine, stops]);

  if (stops.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer
        center={[stops[0].lat, stops[0].lon]}
        zoom={7}
        scrollWheelZoom
        className="h-72 w-full sm:h-96"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködői'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routeLine && (
          <Polyline
            positions={routeLine}
            pathOptions={
              pontosVonal
                ? { color: "#2563eb", weight: 4 }
                : { color: "#94a3b8", weight: 3, dashArray: "6 6" }
            }
          />
        )}
        {stops.map((s, i) => (
          <Marker
            key={`${s.lon},${s.lat},${i}`}
            position={[s.lat, s.lon]}
            icon={allomasIkon(i, s.role)}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{s.role}</div>
                {s.label}
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds bounds={bounds} />
      </MapContainer>
      {!pontosVonal && (
        <p className="border-t bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          A HU-GO kalkulátor válaszából nem sikerült pontos útvonal-geometriát kinyerni ehhez a
          számításhoz — a szaggatott vonal itt csak az állomásokat köti össze egyenesen, nem a
          tényleges útvonalat mutatja.
        </p>
      )}
    </div>
  );
}
