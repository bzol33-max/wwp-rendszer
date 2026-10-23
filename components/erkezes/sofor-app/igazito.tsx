"use client";

// A lap sarkainak igazítása — a sofőr látja a fotót, rajta a négy sarkot, és
// ujjal a lap sarkaira húzza őket (2026-10-23). A gép csak JAVASOL (OpenCV
// élkeresés, lap-kereso.ts); ha nem biztos, a teljes kép a kiinduló állapot.
// Húzás közben nagyító mutatja az ujj alatti részt, hogy pontosan a sarokra
// lehessen tenni.

import { useEffect, useRef, useState } from "react";
import { Check, Maximize2, ScanLine } from "lucide-react";
import { TELJES_KEP, type Pont, type Sarkok } from "./lap-kereso";

const NAGYITO_PX = 110;
const NAGYITAS = 2.2;

export function Igazito({
  kepUrl,
  kepMeret,
  kezdo,
  keres,
  onKesz,
  onMegse,
}: {
  kepUrl: string;
  kepMeret: { w: number; h: number };
  kezdo: Sarkok;
  /** Fut-e még a lap-keresés (OpenCV töltés / elemzés). */
  keres: boolean;
  onKesz: (s: Sarkok) => void;
  onMegse: () => void;
}) {
  // Amíg a sofőr nem nyúlt a sarkokhoz, a (később is megérkező) javaslat látszik.
  const [sajat, setSajat] = useState<Sarkok | null>(null);
  const sarkok = sajat ?? kezdo;
  const [huz, setHuz] = useState<number | null>(null);
  const doboz = useRef<HTMLDivElement>(null);
  const [hely, setHely] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // A kép tényleges helye a dobozban (object-contain), hogy a sarkok rajta legyenek.
  useEffect(() => {
    const el = doboz.current;
    if (!el) return;
    const szamol = () => {
      const r = el.getBoundingClientRect();
      const arany = Math.min(r.width / kepMeret.w, r.height / kepMeret.h);
      const w = kepMeret.w * arany, h = kepMeret.h * arany;
      setHely({ x: (r.width - w) / 2, y: (r.height - h) / 2, w, h });
    };
    szamol();
    const ro = new ResizeObserver(szamol);
    ro.observe(el);
    return () => ro.disconnect();
  }, [kepMeret.w, kepMeret.h]);

  function pontbol(e: React.PointerEvent): Pont | null {
    const el = doboz.current;
    if (!el || !hely) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left - hely.x) / hely.w)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top - hely.y) / hely.h)),
    };
  }

  function mozgat(e: React.PointerEvent) {
    if (huz == null) return;
    const p = pontbol(e);
    if (!p) return;
    setSajat(sarkok.map((q, i) => (i === huz ? p : q)) as Sarkok);
  }

  const px = (p: Pont) => (hely ? { x: hely.x + p.x * hely.w, y: hely.y + p.y * hely.h } : { x: 0, y: 0 });
  const teljes = sarkok.every((p, i) => Math.abs(p.x - TELJES_KEP[i].x) < 0.005 && Math.abs(p.y - TELJES_KEP[i].y) < 0.005);
  const aktiv = huz != null ? sarkok[huz] : null;

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-md flex-col gap-3 bg-[#11151C] px-4 pb-5 pt-4 text-white">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onMegse} className="justify-self-start py-2 font-semibold">
          Mégse
        </button>
        <span className="text-[17px] font-bold">Húzd a sarkokat a lapra</span>
        <span />
      </header>

      <div
        ref={doboz}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-2xl bg-[#23272F]"
        onPointerMove={mozgat}
        onPointerUp={() => setHuz(null)}
        onPointerCancel={() => setHuz(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL */}
        <img src={kepUrl} alt="A lefotózott lap" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        {hely && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <polygon
              points={sarkok.map((p) => `${px(p).x},${px(p).y}`).join(" ")}
              fill="rgba(47,91,255,0.14)"
              stroke="#4F7BFF"
              strokeWidth={3}
            />
          </svg>
        )}
        {hely &&
          sarkok.map((p, i) => {
            const q = px(p);
            return (
              <button
                key={i}
                type="button"
                aria-label={["Bal felső", "Jobb felső", "Jobb alsó", "Bal alsó"][i] + " sarok"}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  setHuz(i);
                }}
                onPointerMove={mozgat}
                onPointerUp={() => setHuz(null)}
                className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: q.x, top: q.y }}
              >
                <span className={`block h-6 w-6 rounded-full border-[3px] border-white ${huz === i ? "bg-[#4F7BFF]" : "bg-[#2F5BFF]/80"} shadow-[0_0_0_2px_rgba(0,0,0,.35)]`} />
              </button>
            );
          })}
        {hely && aktiv && (
          <div
            className="pointer-events-none absolute overflow-hidden rounded-full border-[3px] border-white shadow-lg"
            style={{
              width: NAGYITO_PX,
              height: NAGYITO_PX,
              left: Math.min(Math.max(8, px(aktiv).x - NAGYITO_PX / 2), hely.x * 2 + hely.w - NAGYITO_PX - 8),
              top: Math.max(8, px(aktiv).y - NAGYITO_PX - 40),
              backgroundImage: `url(${kepUrl})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${hely.w * NAGYITAS}px ${hely.h * NAGYITAS}px`,
              backgroundPosition: `${NAGYITO_PX / 2 - aktiv.x * hely.w * NAGYITAS}px ${NAGYITO_PX / 2 - aktiv.y * hely.h * NAGYITAS}px`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#4F7BFF]" />
          </div>
        )}
        {keres && (
          <span className="absolute inset-x-0 top-3 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-[#0B1220]/75 px-3.5 py-1.5 text-sm font-semibold">
              <ScanLine className="h-4 w-4 animate-pulse" />
              Lap keresése…
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2.5">
        <button
          type="button"
          onClick={() => {
            setSajat(TELJES_KEP);
          }}
          className={`flex h-14 items-center justify-center gap-2 rounded-2xl px-4 font-bold ${teljes ? "bg-white text-[#0B1220]" : "bg-[#262C38]"}`}
        >
          <Maximize2 className="h-5 w-5" />
          Teljes kép
        </button>
        <button
          type="button"
          onClick={() => onKesz(sarkok)}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#2F5BFF] text-lg font-bold"
        >
          <Check className="h-5 w-5" strokeWidth={3} />
          Kész
        </button>
      </div>
    </div>
  );
}
