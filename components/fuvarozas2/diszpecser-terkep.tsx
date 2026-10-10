"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { GPS_FRISSESSEG_CIMKE, type GpsFrissesseg } from "@/lib/fuvarozas2/diszpecser-alap";

// A Diszpécser „Térkép” nézete: kocsinként az utolsó ismert GPS-pozíció
// (idővel és frissességgel), szaggatott vonallal a következő megállóig, ha
// annak ismert a koordinátája. Jel nélküli kocsit NEM rajzol (a lista a
// térkép alatt sorolja fel). A csempe-forrás és a magyarországi kivágat a
// components/fuvarozas/route-map.tsx mintáját követi.

const CSEMPE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const CSEMPE_FORRAS =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködői';

const MAGYARORSZAG_HATAROK: LatLngBoundsExpression = [
  [45.7, 16.0],
  [48.6, 23.0],
];

// A .fuvarozas2 jelzőszínei (globals.css) — a Leaflet HTML-ikonja nem látja a CSS-változókat.
const SZIN: Record<GpsFrissesseg, string> = { friss: "#1f8f6e", kesoi: "#a8690f", elavult: "#b93a2f", nincs: "#5f6b6b" };

export type TerkepKocsi = {
  kod: string;
  cimke: string;
  sofor: string;
  lat: number;
  lon: number;
  ido: string;
  kor: string | null;
  frissesseg: GpsFrissesseg;
  cim: string | null;
  kovetkezo: { lat: number; lon: number; cim: string } | null;
  kijelolt: boolean;
};

function kocsiIkon(k: TerkepKocsi) {
  const szin = SZIN[k.frissesseg];
  const cimke = k.cimke.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "",
    html: `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;padding:2px 6px;border-radius:9999px;background:#1e2325;color:#fff;font:600 11px/1.3 system-ui,sans-serif;border:2px solid ${szin};box-shadow:0 1px 3px rgba(0,0,0,.4)${k.kijelolt ? ";outline:3px solid #2f6fa8" : ""}"><span style="width:8px;height:8px;border-radius:9999px;background:${szin}"></span>${cimke}</span>`,
    iconAnchor: [6, 10],
  });
}

const CEL_IKON = L.divIcon({
  className: "",
  html: `<span style="display:block;width:12px;height:12px;border-radius:3px;background:#fff;border:2px solid #1e2325"></span>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export function DiszpecserTerkep({ kocsik, onValaszt }: { kocsik: TerkepKocsi[]; onValaszt: (kod: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10">
      <MapContainer bounds={MAGYARORSZAG_HATAROK} boundsOptions={{ padding: [0, 0] }} scrollWheelZoom className="h-[420px] w-full md:h-[560px]">
        <TileLayer attribution={CSEMPE_FORRAS} url={CSEMPE_URL} />
        {kocsik.map((k) =>
          k.kovetkezo ? (
            <Polyline key={`v-${k.kod}`} positions={[[k.lat, k.lon], [k.kovetkezo.lat, k.kovetkezo.lon]]} pathOptions={{ color: "#1e2325", weight: 3, dashArray: "6 6" }} />
          ) : null
        )}
        {kocsik.map((k) =>
          k.kovetkezo ? (
            <Marker key={`c-${k.kod}`} position={[k.kovetkezo.lat, k.kovetkezo.lon]} icon={CEL_IKON}>
              <Tooltip>{k.cimke} következő megállója: {k.kovetkezo.cim}</Tooltip>
            </Marker>
          ) : null
        )}
        {kocsik.map((k) => (
          <Marker key={k.kod} position={[k.lat, k.lon]} icon={kocsiIkon(k)} eventHandlers={{ click: () => onValaszt(k.kod) }}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{k.cimke} · {k.sofor}</div>
                <div>Utolsó jel: {k.ido}{k.kor ? ` (${k.kor})` : ""} — {GPS_FRISSESSEG_CIMKE[k.frissesseg]}</div>
                {k.cim ? <div>{k.cim}</div> : null}
                {k.kovetkezo ? <div>Következő: {k.kovetkezo.cim}</div> : <div>Következő megálló: nincs ismert koordináta</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
