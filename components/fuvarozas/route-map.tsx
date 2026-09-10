"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L, { type LatLngExpression, type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export type RouteMapStop = {
  /** pl. "Honnan", "Megálló 1", "Hová" — a toll-calculator stopLabel()-jéből. */
  role: string;
  label: string;
  lon: number;
  lat: number;
};

export type RouteMapRoute = {
  id: number;
  /** Ez a szín köti össze a térképi vonalat/jelölőket a hozzá tartozó eredmény-csempével. */
  color: string;
  stops: RouteMapStop[];
  geometryLonLat: [number, number][] | null;
  /** A kiválasztott csempéhez tartozó útvonal vastagabb vonalat kap, hogy sok egyidejű útvonal közt is kitűnjön. */
  kiemelt?: boolean;
};

// Magyarország nagyjábóli határai — a térkép induláskor mindig erre a
// kivágatra igazodik, és utána NEM igazodik újra egyes útvonalakhoz: a
// felhasználó kérése szerint a nézet fixen Magyarországot mutatja, akkor is,
// ha egy útvonal (pl. külföldi cím miatt) ezen kívülre esik.
const MAGYARORSZAG_HATAROK: LatLngBoundsExpression = [
  [45.7, 16.0],
  [48.6, 23.0],
];

function allomasIkon(index: number, szin: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:${szin};color:#fff;font-size:10px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${index + 1}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * A Kalkulátor fülön beütött állomásokat és a HU-GO kalkulátor által
 * kiszámított útvonalakat mutató térkép. A nézet fixen Magyarországra van
 * igazítva (nem "ugrál" az egyes számításokkal), és egyszerre AZ ÖSSZES
 * kiszámított útvonalat mutatja — mindegyiket a saját (route.color) színén,
 * hogy az alattuk megjelenő eredmény-csempékkel színben összepárosíthatók
 * legyenek (lásd toll-calculator.tsx). Ha egy útvonalhoz nem sikerült
 * pontos vonalgeometriát kinyerni a HU-GO válaszából, helyette az
 * állomásokat összekötő szaggatott, közelítő egyenes látszik.
 */
export function RouteMap({ routes }: { routes: RouteMapRoute[] }) {
  const vonalak = useMemo(
    () =>
      routes.map((r) => {
        const pontos = r.geometryLonLat != null && r.geometryLonLat.length > 1;
        const positions: LatLngExpression[] = pontos
          ? (r.geometryLonLat as [number, number][]).map(([lon, lat]) => [lat, lon] as LatLngExpression)
          : r.stops.map((s) => [s.lat, s.lon] as LatLngExpression);
        return { ...r, positions, pontos };
      }),
    [routes]
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer bounds={MAGYARORSZAG_HATAROK} scrollWheelZoom className="h-72 w-full sm:h-96">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködői'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {vonalak.map(
          (r) =>
            r.positions.length > 1 && (
              <Polyline
                key={r.id}
                positions={r.positions}
                pathOptions={{
                  color: r.color,
                  weight: r.kiemelt ? 6 : 4,
                  dashArray: r.pontos ? undefined : "6 6",
                }}
              />
            )
        )}
        {vonalak.flatMap((r) =>
          r.stops.map((s, i) => (
            <Marker key={`${r.id}-${i}`} position={[s.lat, s.lon]} icon={allomasIkon(i, r.color)}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{s.role}</div>
                  {s.label}
                </div>
              </Popup>
            </Marker>
          ))
        )}
      </MapContainer>
    </div>
  );
}
