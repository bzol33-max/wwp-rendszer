"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Lanc } from "@/lib/proto/akciok";

const CSEMPE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const CSEMPE_FORRAS = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők';
const MAGYARORSZAG: LatLngBoundsExpression = [[45.7, 16.0], [48.6, 23.0]];

function ikon(szoveg: string, szin: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${szin};color:#fff;font-size:11px;font-weight:700;border:2px solid #fff">${szoveg}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function ProtoTerkep({ lanc }: { lanc: Lanc }) {
  const pontok = useMemo<LatLngExpression[]>(() => lanc.pontok.map((p) => [p.lat, p.lon]), [lanc]);
  const hatar = useMemo<LatLngBoundsExpression>(() => {
    const mind: [number, number][] = lanc.pontok.map((p) => [p.lat, p.lon]);
    if (lanc.kocsi) mind.push([lanc.kocsi.lat, lanc.kocsi.lon]);
    return mind.length > 0 ? mind : MAGYARORSZAG;
  }, [lanc]);
  return (
    <MapContainer key={lanc.kod} bounds={hatar} boundsOptions={{ padding: [24, 24], maxZoom: 10 }} className="h-72 w-full rounded-lg" scrollWheelZoom={false}>
      <TileLayer url={CSEMPE_URL} attribution={CSEMPE_FORRAS} />
      {pontok.length > 1 && <Polyline positions={pontok} pathOptions={{ color: "#0A84FF", weight: 3 }} />}
      {lanc.pontok.map((p, i) => (
        <Marker key={`${i}-${p.cimke}`} position={[p.lat, p.lon]} icon={ikon(String(i + 1), p.tipus === "felrako" ? "#0A84FF" : "#14713F")}>
          <Popup>{p.tipus === "felrako" ? "Felrakó" : "Lerakó"}: {p.cimke}</Popup>
        </Marker>
      ))}
      {lanc.kocsi && (
        <Marker position={[lanc.kocsi.lat, lanc.kocsi.lon]} icon={ikon("K", "#B3261E")}>
          <Popup>{lanc.kod}, most · {Math.round(lanc.kocsi.sebesseg)} km/h</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
