"use client";

import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

// A Ma oldal élő térképe (2026-10-11): kocsinként a mostani hely (iránynyíllal,
// sebességgel), a mai megtett út (folytonos) és a hátralévő megállók
// (szaggatott). A csempe-forrás a diszpecser-terkep.tsx mintáját követi.

const CSEMPE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const CSEMPE_FORRAS =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködői';

const MAGYARORSZAG: LatLngBoundsExpression = [
  [45.7, 16.0],
  [48.6, 23.0],
];

// A Leaflet HTML-ikonja nem látja a CSS-változókat — a .fuvarozas2 színei.
const ALLAPOT_SZIN = { kek: "#2f6fa8", borostyan: "#a8690f", szurke: "#5f6b6b" } as const;

export type TerkepKocsiElo = {
  kod: string;
  nev: string;
  lat: number;
  lon: number;
  irany: number | null;
  allapot: "MEGY" | "ÁLL" | "NINCS JEL";
  szam: string;
  szin: "kek" | "borostyan" | "szurke";
  nyomvonal: [number, number][];
  hatraVan: { lat: number; lon: number; cim: string }[];
  /** A hátralévő terv úthálózaton; null: egyenes vonalak a megállók között. */
  tervUt?: [number, number][] | null;
  kovetkezoCim: string | null;
  vonalSzin: string;
};

function esc(s: string) {
  return s.replace(/[<>&"]/g, "");
}

function kocsiIkon(k: TerkepKocsiElo) {
  const szin = ALLAPOT_SZIN[k.szin];
  const nyil =
    k.allapot === "MEGY" && k.irany != null
      ? `<svg width="16" height="16" viewBox="0 0 24 24" style="transform:rotate(${Math.round(k.irany)}deg)"><path d="M12 3l7 18-7-4-7 4z" fill="#fff"/></svg>`
      : `<span style="display:block;width:10px;height:10px;border-radius:2px;background:#fff"></span>`;
  return L.divIcon({
    className: "",
    html:
      `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transform:translate(-15px,-15px)">` +
      `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${szin};box-shadow:0 0 0 3px #fff,0 2px 6px rgba(0,0,0,.35)">${nyil}</span>` +
      `<span style="background:#fff;border-radius:8px;padding:3px 8px;box-shadow:0 1px 4px rgba(0,0,0,.25);font:600 12px/1.3 system-ui,sans-serif;color:#1e2325">${esc(k.nev)} · <span style="color:${szin}">${k.allapot === "MEGY" ? esc(k.szam) : `${k.allapot.toLowerCase()} ${esc(k.szam)}`}</span></span>` +
      `</span>`,
    iconSize: [0, 0],
  });
}

const CEL_IKON = L.divIcon({
  className: "",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#fff;border:3px solid #1e2325;transform:translate(-7px,-7px)"></span>`,
  iconSize: [0, 0],
});

export function MaEloTerkep({ kocsik }: { kocsik: TerkepKocsiElo[] }) {
  const pontok: [number, number][] = kocsik.flatMap((k) => [[k.lat, k.lon] as [number, number], ...k.hatraVan.slice(0, 1).map((h) => [h.lat, h.lon] as [number, number])]);
  const hatarok: LatLngBoundsExpression = pontok.length >= 2 ? (pontok as LatLngBoundsExpression) : MAGYARORSZAG;
  return (
    <MapContainer bounds={hatarok} boundsOptions={{ padding: [60, 60], maxZoom: 10 }} scrollWheelZoom className="absolute inset-0 h-full w-full">
      <TileLayer attribution={CSEMPE_FORRAS} url={CSEMPE_URL} />
      {kocsik.map((k) =>
        k.nyomvonal.length >= 2 ? (
          <Polyline key={`ny-${k.kod}`} positions={k.nyomvonal} pathOptions={{ color: k.vonalSzin, weight: 5, opacity: 0.85 }} />
        ) : null
      )}
      {kocsik.map((k) =>
        k.hatraVan.length ? (
          <Polyline
            key={`h-${k.kod}`}
            positions={k.tervUt && k.tervUt.length >= 2 ? k.tervUt : [[k.lat, k.lon], ...k.hatraVan.map((h) => [h.lat, h.lon] as [number, number])]}
            pathOptions={{ color: k.vonalSzin, weight: 3, dashArray: "8 8", opacity: 0.8 }}
          />
        ) : null
      )}
      {/* A további hátralévő megállók kis pöttyel, sorszámmal (a következő a nagy célkarika). */}
      {kocsik.flatMap((k) =>
        k.hatraVan.slice(1).map((h, i) => (
          <Marker key={`m-${k.kod}-${i}`} position={[h.lat, h.lon]} icon={L.divIcon({
            className: "",
            html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:${k.vonalSzin};border:2px solid #fff;transform:translate(-5px,-5px)"></span>`,
            iconSize: [0, 0],
          })}>
            <Tooltip direction="top" offset={[0, -6]}>{k.nev} · {i + 2}. megálló: {h.cim}</Tooltip>
          </Marker>
        ))
      )}
      {kocsik.flatMap((k) =>
        k.hatraVan.slice(0, 1).map((h) => (
          <Marker key={`c-${k.kod}`} position={[h.lat, h.lon]} icon={CEL_IKON}>
            <Tooltip direction="top" offset={[0, -8]}>{k.nev} következő: {h.cim}</Tooltip>
          </Marker>
        ))
      )}
      {kocsik.map((k) => (
        <Marker key={k.kod} position={[k.lat, k.lon]} icon={kocsiIkon(k)} zIndexOffset={1000} />
      ))}
    </MapContainer>
  );
}
