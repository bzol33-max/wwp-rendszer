"use client";

// Kamera KERETTEL (2026-10-23, Budaházi Zoltán: „most egész jó, tedd vissza a
// keretet, amibe igazítsák be a papírt”). Élő kép a hátsó kamerából, rajta egy
// A4-es álló keret; a sofőr a papírt ebbe igazítja, és megnyomja a gombot.
//
// A korábbi élő kamera homályos képet adott, mert a videó egy képkockáját
// mentette. Most a fotót a böngésző FÉNYKÉPEZŐ-funkciója készíti
// (ImageCapture.takePhoto — Androidon Chrome: teljes felbontás, fókusz,
// vaku), és csak ha ez nincs, akkor a videókocka. Folyamatos fókuszt kérünk.
//
// A keret helyét visszaadjuk a fotó arányában — az igazító ezt kínálja fel
// kiinduló sarkoknak, ha a lap-kereső nem talál biztosabbat.

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, X, Zap, ZapOff } from "lucide-react";
import type { Sarkok } from "./lap-kereso";

/** A4 álló: szélesség / magasság. */
const A4 = 210 / 297;
/** A keret a kép szélességének ennyi része. */
const KERET_SZELES = 0.86;

/* eslint-disable @typescript-eslint/no-explicit-any -- ImageCapture és a fókusz-/vaku-képességek típus nélküliek a DOM-típusokban */

export function KeretesKamera({
  cim,
  alcim,
  oldalDb,
  onFoto,
  onTelefonKamera,
  onGaleria,
  onMegse,
}: {
  cim: string;
  alcim: string;
  oldalDb: number;
  /** A fotó, és a keret a fotó arányában (0–1). */
  onFoto: (fajl: File, keret: Sarkok) => void;
  /** Ha az élő kamera nem indul: a telefon saját kamera-appja (a hívó nyitja, a koppintásban). */
  onTelefonKamera: () => void;
  onGaleria: () => void;
  onMegse: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const doboz = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const [indul, setIndul] = useState(true);
  const [vakuVan, setVakuVan] = useState(false);
  const [vaku, setVaku] = useState(false);
  const [fotoz, setFotoz] = useState(false);
  const [meret, setMeret] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let el = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("nincs");
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!el) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const kep = ((track as any)?.getCapabilities?.() ?? {}) as any;
        if (Array.isArray(kep.focusMode) && kep.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => undefined);
        }
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        if (el) setVakuVan(Boolean(kep.torch));
      } catch {
        if (el) setHiba("Az app kamerája nem indult el.");
      } finally {
        if (el) setIndul(false);
      }
    })();
    return () => {
      el = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  // A doboz mérete (a keret rajzolásához és a fotóra vetítéséhez).
  useEffect(() => {
    const d = doboz.current;
    if (!d) return;
    const ro = new ResizeObserver(() => {
      const r = d.getBoundingClientRect();
      setMeret({ w: r.width, h: r.height });
    });
    ro.observe(d);
    return () => ro.disconnect();
  }, []);

  // A keret a dobozban (képernyő-pixel): középen, A4 arányú, a szélesség 86%-a (ha nem fér, a magassághoz igazítva).
  const keret = (() => {
    if (!meret) return null;
    let w = meret.w * KERET_SZELES;
    let h = w / A4;
    if (h > meret.h * 0.9) {
      h = meret.h * 0.9;
      w = h * A4;
    }
    return { x: (meret.w - w) / 2, y: (meret.h - h) / 2, w, h };
  })();

  /**
   * A keret a FOTÓ arányában. A videó a dobozt „cover” módon tölti ki (a széle
   * levágódhat), a fotó pedig a videónál szélesebb látószögű is lehet (4:3
   * szenzor, 16:9 videó) — mindkettőt a középpontból arányosítjuk.
   */
  function keretFotora(fotoW: number, fotoH: number): Sarkok {
    const v = video.current;
    if (!keret || !meret || !v?.videoWidth) {
      return [{ x: 0.07, y: 0.07 }, { x: 0.93, y: 0.07 }, { x: 0.93, y: 0.93 }, { x: 0.07, y: 0.93 }];
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    const skala = Math.max(meret.w / vw, meret.h / vh); // cover
    const lathatoW = meret.w / skala, lathatoH = meret.h / skala;
    // doboz-pixel → videó-arány (0–1)
    const vx = (x: number) => ((x / skala) + (vw - lathatoW) / 2) / vw;
    const vy = (y: number) => ((y / skala) + (vh - lathatoH) / 2) / vh;
    // videó-arány → fotó-arány: közös középpont, a fotó a videó látószögét a rövidebbik irányban tartalmazza
    const vArany = vw / vh, fArany = fotoW / fotoH;
    const fx = (x: number) => (fArany > vArany ? 0.5 + (x - 0.5) * (vArany / fArany) : x);
    const fy = (y: number) => (fArany < vArany ? 0.5 + (y - 0.5) * (fArany / vArany) : y);
    const p = (x: number, y: number) => ({ x: Math.min(1, Math.max(0, fx(vx(x)))), y: Math.min(1, Math.max(0, fy(vy(y)))) });
    return [p(keret.x, keret.y), p(keret.x + keret.w, keret.y), p(keret.x + keret.w, keret.y + keret.h), p(keret.x, keret.y + keret.h)];
  }

  async function fotozz() {
    const s = stream.current;
    const v = video.current;
    if (!s || !v || fotoz) return;
    setFotoz(true);
    try {
      const track = s.getVideoTracks()[0];
      let blob: Blob | null = null;
      const IC = (window as any).ImageCapture;
      if (IC && track) {
        try {
          blob = await new IC(track).takePhoto(vakuVan ? { fillLightMode: vaku ? "flash" : "off" } : undefined);
        } catch {
          blob = null;
        }
      }
      if (!blob) {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
      }
      if (!blob) return;
      const bm = await createImageBitmap(blob);
      const k = keretFotora(bm.width, bm.height);
      bm.close();
      try {
        navigator.vibrate?.(40);
      } catch {
        // nem minden telefon rezeg
      }
      onFoto(new File([blob], "papir.jpg", { type: blob.type || "image/jpeg" }), k);
    } finally {
      setFotoz(false);
    }
  }

  async function vakuValt() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const uj = !vaku;
    try {
      await track.applyConstraints({ advanced: [{ torch: uj } as any] });
      setVaku(uj);
    } catch {
      setVakuVan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-md flex-col gap-3 bg-[#11151C] px-4 pb-5 pt-4 text-white">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <button type="button" aria-label="Bezárás" onClick={onMegse} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#262C38]">
          <X className="h-5 w-5" />
        </button>
        <span className="min-w-0 text-center">
          <span className="block truncate text-[17px] font-bold">{cim}</span>
          <span className="block truncate text-[13px] text-[#AEB6C4]">{alcim} · {oldalDb + 1}. oldal</span>
        </span>
        {vakuVan ? (
          <button type="button" aria-label={vaku ? "Vaku ki" : "Vaku be"} onClick={vakuValt} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#262C38]">
            {vaku ? <Zap className="h-5 w-5 text-amber-300" /> : <ZapOff className="h-5 w-5" />}
          </button>
        ) : (
          <span className="w-11" />
        )}
      </header>

      <div ref={doboz} className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-[#23272F]">
        {hiba ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-[#C7CDD8]">{hiba} A telefon saját kamerájával is fotózhatsz.</p>
            <button type="button" onClick={onTelefonKamera} className="flex h-14 items-center gap-2 rounded-2xl bg-[#2F5BFF] px-6 text-lg font-bold">
              <Camera className="h-5 w-5" />
              Telefon kamerája
            </button>
          </div>
        ) : (
          <>
            <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            {keret && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                  <mask id="keret-lyuk">
                    <rect width="100%" height="100%" fill="white" />
                    <rect x={keret.x} y={keret.y} width={keret.w} height={keret.h} rx={10} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#keret-lyuk)" />
                <rect x={keret.x} y={keret.y} width={keret.w} height={keret.h} rx={10} fill="none" stroke="#FFFFFF" strokeWidth={3} />
                {/* sarokjelek */}
                {[
                  [keret.x, keret.y, 1, 1],
                  [keret.x + keret.w, keret.y, -1, 1],
                  [keret.x + keret.w, keret.y + keret.h, -1, -1],
                  [keret.x, keret.y + keret.h, 1, -1],
                ].map(([x, y, dx, dy], i) => (
                  <path key={i} d={`M ${x} ${y + dy * 34} L ${x} ${y} L ${x + dx * 34} ${y}`} stroke="#4ADE80" strokeWidth={6} fill="none" strokeLinecap="round" />
                ))}
              </svg>
            )}
            <span className="absolute inset-x-0 top-3 flex justify-center px-3">
              <span className="rounded-full bg-[#0B1220]/75 px-3.5 py-1.5 text-sm font-semibold">
                {indul ? "Kamera indul…" : fotoz ? "Fotó készül…" : "Igazítsd a papírt a keretbe"}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onGaleria} className="flex flex-col items-start gap-1 text-xs font-semibold">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-[#262C38]">
            <ImageIcon className="h-6 w-6" />
          </span>
          Galéria
        </button>
        <button
          type="button"
          aria-label="Fotó"
          disabled={Boolean(hiba) || indul || fotoz}
          onClick={() => void fotozz()}
          className="h-20 w-20 rounded-full border-[5px] border-white bg-white shadow-[inset_0_0_0_4px_#11151C] disabled:opacity-40"
        />
        <span />
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
