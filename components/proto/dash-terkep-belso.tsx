"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TerkepAdat } from "@/lib/proto/dashboard";

const CSEMPE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const CSEMPE_FORRAS = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők';
const MAGYARORSZAG: LatLngBoundsExpression = [[45.7, 16.0], [48.6, 23.0]];

function cimke(szoveg: string, szin: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:inline-block;padding:2px 7px;border-radius:5px;background:${szin};color:#fff;font:700 12px Inter,sans-serif;white-space:nowrap;border:1px solid #fff">${szoveg}</span>`,
    iconSize: [78, 22],
    iconAnchor: [39, 11],
  });
}

const PONT = (szin: string, d: number) => L.divIcon({
  className: "",
  html: `<span style="display:block;width:${d}px;height:${d}px;border-radius:50%;background:${szin};border:1.5px solid #fff"></span>`,
  iconSize: [d, d],
  iconAnchor: [d / 2, d / 2],
});

export function DashTerkepBelso({ adat }: { adat: TerkepAdat }) {
  const hatar = useMemo<LatLngBoundsExpression>(() => {
    const p: [number, number][] = [];
    for (const k of adat.kocsik) {
      if (k.pont) p.push([k.pont.lat, k.pont.lon]);
      for (const m of k.megallok) p.push([m.lat, m.lon]);
    }
    for (const t of adat.telepek) p.push([t.lat, t.lon]);
    return p.length > 1 ? p : MAGYARORSZAG;
  }, [adat]);
  // Telefonon az egyujjas húzás a lapot görgesse, ne a térképet.
  const erintos = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <MapContainer bounds={hatar} boundsOptions={{ padding: [24, 24], maxZoom: 9 }} style={{ height: "100%", minHeight: 170, width: "100%" }} scrollWheelZoom={false} dragging={!erintos}>
      <TileLayer url={CSEMPE_URL} attribution={CSEMPE_FORRAS} />
      {adat.telepek.map((t) => (
        <Marker key={t.nev} position={[t.lat, t.lon]} icon={PONT("#14713F", 11)}><Popup>{t.nev}</Popup></Marker>
      ))}
      {adat.kocsik.map((k) => (
        <span key={k.kod}>
          {k.megallok.length > 1 && <Polyline positions={k.megallok.map((m) => [m.lat, m.lon] as [number, number])} pathOptions={{ color: k.szin, weight: 3 }} />}
          {k.megallok.map((m, i) => <Marker key={`${i}-${m.cim}`} position={[m.lat, m.lon]} icon={PONT(k.szin, 8)}><Popup>{k.kod}: {m.cim}</Popup></Marker>)}
          {k.pont && <Marker position={[k.pont.lat, k.pont.lon]} icon={cimke(k.kod, k.szin)}><Popup>{k.kod}, most · {Math.round(k.pont.sebesseg)} km/h</Popup></Marker>}
        </span>
      ))}
    </MapContainer>
  );
}
