"use client";

// A papír lefotózása négy lépésben (sofőr app, 2026-10-21 — Budaházi Zoltán:
// „a fotózás … nézd át újra, tökéletes legyen”):
//
//  1. Kamera — élő kép a telefon hátsó kamerájából. Fent a fuvar és hogy
//     MILYEN papír kell (bérfuvar: fuvarlevél/CMR, saját: szállítólevél — a
//     sofőrnek nem kell választania). Ha a lap a képen van, a keret zöld; ha
//     a telefon kb. 1 mp-ig stabil és a kép éles, magától fotóz. Kézi gomb,
//     vaku és Galéria is van. Ha a böngésző nem ad élő kamerát, a telefon
//     saját kamera-appja nyílik (a régi módszer).
//  2. Jó lett? — a kép nagyban, mellette az automatikus ellenőrzés: éles,
//     elég világos, az egész lap rajta van. Újra / Még egy oldal / Jó.
//  3. Beküldés — az oldalak bélyegképen, törölhető, hozzáadható. A beküldés
//     a telefon sorába tesz (papir-sor.ts): térerő nélkül ott vár, és
//     magától felmegy. Saját fuvarnál „Nem kaptam papírt” (a régi szabály).
//  4. Kész — ha van még papírra váró fuvar, egy gombbal jön a következő.
//
// A kivágást és kiegyenesítést a SZERVER végzi feltöltéskor
// (lib/fuvarozas/doksi-kivagas.ts) — a telefonon csak ellenőrzünk, nem
// vágunk, hogy egy rossz vágás ne vihesse el az aláírást.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, CloudUpload, ImageIcon, Plus, RotateCcw, X, Zap, ZapOff } from "lucide-react";
import {
  AUTO_FOTO_KOCKA,
  RESZLET_PX,
  STABIL_ELTERES,
  elesseg,
  kepMinoseg,
  reszletKivagasok,
  kepkockaElteres,
  szurkeArnyalat,
  type KepMinoseg,
} from "@/lib/fuvarozas/sofor-app-alap";
import { bekuld, type SorEredmeny } from "./papir-sor";
import { SOFOR_THEME } from "./tema";

export type FotoFuvar = {
  fuvarId: string;
  /** "Tata → Tompaládony" */
  cim: string;
  /** "#325 · saját fuvar" */
  alcim: string;
  papirNev: string;
  sajatFuvar: boolean;
};

type Oldal = { id: string; blob: Blob; url: string; m: KepMinoseg | null };

const ELEMZES_SZELESSEG = 320;

function kicsiSzurke(forras: CanvasImageSource, w0: number, h0: number, vaszon: HTMLCanvasElement): { g: Uint8Array; w: number; h: number } | null {
  if (!w0 || !h0) return null;
  const w = ELEMZES_SZELESSEG;
  const h = Math.max(1, Math.round((ELEMZES_SZELESSEG * h0) / w0));
  vaszon.width = w;
  vaszon.height = h;
  const ctx = vaszon.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(forras, 0, 0, w, h);
  return { g: szurkeArnyalat(ctx.getImageData(0, 0, w, h).data, w, h), w, h };
}

/**
 * Az élesség teljes felbontásból: három RESZLET_PX-es kivágás (a kép
 * függőleges 25/50/75%-án), a legélesebb számít — a 320 px-es kicsinyített
 * képen a betűk elmosódása nem látszana (lásd sofor-app-alap.ts).
 */
function reszletElesseg(forras: CanvasImageSource, w0: number, h0: number, vaszon: HTMLCanvasElement): number | undefined {
  const c = Math.min(RESZLET_PX, w0, h0);
  if (c < 50) return undefined;
  vaszon.width = c;
  vaszon.height = c;
  const ctx = vaszon.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  let max = 0;
  for (const k of reszletKivagasok(w0, h0)) {
    ctx.drawImage(forras, k.x, k.y, c, c, 0, 0, c, c);
    max = Math.max(max, elesseg(szurkeArnyalat(ctx.getImageData(0, 0, c, c).data, c, c), c, c));
  }
  return max;
}

async function minosegFajlbol(blob: Blob): Promise<KepMinoseg | null> {
  try {
    const kep = await createImageBitmap(blob);
    try {
      const vaszon = document.createElement("canvas");
      const k = kicsiSzurke(kep, kep.width, kep.height, vaszon);
      return k ? kepMinoseg(k.g, k.w, k.h, reszletElesseg(kep, kep.width, kep.height, vaszon)) : null;
    } finally {
      kep.close();
    }
  } catch {
    return null;
  }
}

function ujOldal(blob: Blob, m: KepMinoseg | null): Oldal {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, blob, url: URL.createObjectURL(blob), m };
}

// --------------------------------------------------------------- 1. kamera

function Kamera({
  fuvar,
  oldalDb,
  onFoto,
  onFajlok,
  onMegse,
}: {
  fuvar: FotoFuvar;
  oldalDb: number;
  onFoto: (blob: Blob, m: KepMinoseg | null) => void;
  onFajlok: (fajlok: File[], kamerabol: boolean) => void;
  onMegse: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const kisVaszon = useRef<HTMLCanvasElement | null>(null);
  const reszletVaszon = useRef<HTMLCanvasElement | null>(null);
  const elozo = useRef<Uint8Array | null>(null);
  const stabilDb = useRef(0);
  const fotoz = useRef(false);
  const utolsoM = useRef<KepMinoseg | null>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const nativ = useRef<HTMLInputElement>(null);

  const [hiba, setHiba] = useState<string | null>(null);
  const [indul, setIndul] = useState(true);
  const [arany, setArany] = useState<number | null>(null);
  const [vakuVan, setVakuVan] = useState(false);
  const [vaku, setVaku] = useState(false);
  const [jelzes, setJelzes] = useState<{ szoveg: string; kesz: number; lap: KepMinoseg["lap"]; jo: boolean }>({
    szoveg: "Tartsd a lapot a képbe",
    kesz: 0,
    lap: null,
    jo: false,
  });

  useEffect(() => {
    let el = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("nincs");
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (!el) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
        const track = s.getVideoTracks()[0];
        const kep = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (el) setVakuVan(Boolean(kep.torch));
      } catch {
        if (el) setHiba("Az élő kamera nem indult el. A telefon saját kamerájával is fotózhatsz.");
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

  function fotozz(m: KepMinoseg | null) {
    const v = video.current;
    if (!v || fotoz.current || !v.videoWidth) return;
    fotoz.current = true;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (b) => {
        fotoz.current = false;
        stabilDb.current = 0;
        if (b) {
          try {
            navigator.vibrate?.(40);
          } catch {
            // nem minden telefon rezeg
          }
          onFoto(b, m);
        }
      },
      "image/jpeg",
      0.92
    );
  }

  // Elemzés 150 ms-onként egy 320 px széles szürke képkockán: lap-keret,
  // élesség, fény, és hogy mozog-e a telefon. Stabil + éles + egész lap
  // ≈1 mp-ig → magától fotóz.
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth || fotoz.current) return;
      if (!kisVaszon.current) kisVaszon.current = document.createElement("canvas");
      const k = kicsiSzurke(v, v.videoWidth, v.videoHeight, kisVaszon.current);
      if (!k) return;
      setArany((a) => (a === v.videoWidth / v.videoHeight ? a : v.videoWidth / v.videoHeight));
      if (!reszletVaszon.current) reszletVaszon.current = document.createElement("canvas");
      const m = kepMinoseg(k.g, k.w, k.h, reszletElesseg(v, v.videoWidth, v.videoHeight, reszletVaszon.current));
      utolsoM.current = m;
      const elteres = elozo.current ? kepkockaElteres(elozo.current, k.g) : 255;
      elozo.current = k.g;
      const stabil = elteres < STABIL_ELTERES;
      const jo = stabil && m.eles && m.vilagos && m.egeszLap;
      stabilDb.current = jo ? stabilDb.current + 1 : 0;
      const szoveg = !m.lap
        ? "Tartsd a lapot a képbe"
        : !m.egeszLap
          ? "Kicsit távolabb — az egész lap látsszon"
          : !m.vilagos
            ? m.fenyesseg < 128
              ? "Sötét van — kapcsold be a vakut"
              : "Túl világos — fordítsd el a lapot"
            : !stabil
              ? "Tartsd stabilan…"
              : !m.eles
                ? "Életlen — tartsd stabilan"
                : "Megvan a lap — tartsd még…";
      setJelzes({ szoveg, kesz: Math.min(1, stabilDb.current / AUTO_FOTO_KOCKA), lap: m.lap, jo: m.egeszLap && m.vilagos });
      if (stabilDb.current >= AUTO_FOTO_KOCKA) fotozz(m);
    }, 150);
    return () => window.clearInterval(id);
    // fotozz és onFoto: a legfrissebb változat a ref-eken át fut, a ciklust nem indítjuk újra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function vakuValt() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const uj = !vaku;
    try {
      await track.applyConstraints({ advanced: [{ torch: uj } as MediaTrackConstraintSet] });
      setVaku(uj);
    } catch {
      setVakuVan(false);
    }
  }

  const fajlValaszt = (kamerabol: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fajlok.length) onFajlok(fajlok, kamerabol);
  };

  const r = 10;
  const kor = 2 * Math.PI * r;

  return (
    <div style={SOFOR_THEME} className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col gap-3 bg-[#11151C] px-4 pb-5 pt-4 text-white">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onMegse} className="justify-self-start py-2 text-base font-semibold">
          Mégse
        </button>
        <span className="text-center">
          <span className="block text-[17px] font-bold">{fuvar.cim}</span>
          <span className="block text-[13px] text-[#AEB6C4]">{fuvar.alcim}</span>
        </span>
        {vakuVan ? (
          <button
            type="button"
            aria-label={vaku ? "Vaku ki" : "Vaku be"}
            onClick={vakuValt}
            className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full bg-[#262C38]"
          >
            {vaku ? <Zap className="h-5 w-5 text-amber-300" /> : <ZapOff className="h-5 w-5" />}
          </button>
        ) : (
          <span />
        )}
      </header>
      <div className="flex justify-center">
        <span className="rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-[#0B1220]">
          {fuvar.papirNev[0].toUpperCase() + fuvar.papirNev.slice(1)} · {oldalDb + 1}. oldal
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-3xl bg-[#23272F]">
        {hiba ? (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <p className="text-sm text-[#C7CDD8]">{hiba}</p>
            <button
              type="button"
              onClick={() => nativ.current?.click()}
              className="h-14 rounded-2xl bg-[#2F5BFF] px-6 text-lg font-bold"
            >
              Fotó a kamerával
            </button>
          </div>
        ) : (
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: arany ?? 3 / 4, height: "100%" }}>
            <video ref={video} playsInline muted className="h-full w-full rounded-3xl object-cover" />
            {jelzes.lap && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
                <rect
                  x={jelzes.lap.x0}
                  y={jelzes.lap.y0}
                  width={jelzes.lap.x1 - jelzes.lap.x0}
                  height={jelzes.lap.y1 - jelzes.lap.y0}
                  rx={0.01}
                  fill={jelzes.jo ? "rgba(74,222,128,0.10)" : "rgba(251,191,36,0.08)"}
                  stroke={jelzes.jo ? "#4ADE80" : "#FBBF24"}
                  strokeWidth={0.008}
                  vectorEffect="non-scaling-stroke"
                  style={{ strokeWidth: 4 }}
                />
              </svg>
            )}
            {indul && <p className="absolute inset-0 flex items-center justify-center text-sm text-[#AEB6C4]">Kamera indul…</p>}
            <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">
              <span role="status" className="flex items-center gap-2.5 rounded-full bg-[#0B1220]/75 py-2 pl-2 pr-4 text-[15px] font-semibold">
                <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
                  <circle cx="13" cy="13" r={r} stroke="#3B4252" strokeWidth="4" fill="none" />
                  <circle
                    cx="13"
                    cy="13"
                    r={r}
                    stroke="#4ADE80"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${kor * jelzes.kesz} ${kor}`}
                    transform="rotate(-90 13 13)"
                  />
                </svg>
                {jelzes.szoveg}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        <span className="flex flex-col items-start gap-1 text-xs font-semibold text-[#AEB6C4]">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border-2 border-dashed border-[#3B4252] text-[#C7CDD8]">
            {oldalDb}
          </span>
          kész oldal
        </span>
        <button
          type="button"
          aria-label="Fotó most"
          disabled={Boolean(hiba) || indul}
          onClick={() => fotozz(utolsoM.current)}
          className="h-20 w-20 rounded-full border-[5px] border-white bg-white shadow-[inset_0_0_0_4px_#11151C] disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => galeria.current?.click()}
          className="flex flex-col items-center gap-1 justify-self-end text-xs font-semibold"
        >
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-[#262C38]">
            <ImageIcon className="h-6 w-6" />
          </span>
          Galéria
        </button>
      </div>
      {!hiba && <p className="text-center text-[13px] text-[#8A93A3]">Magától lefotózza, ha a keret zöld és a kép stabil.</p>}
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={fajlValaszt(false)} />
      <input ref={nativ} type="file" accept="image/*" capture="environment" className="hidden" onChange={fajlValaszt(true)} />
    </div>
  );
}

// ------------------------------------------------------- közös apróságok

function Pipa({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[15px] font-medium">
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${ok ? "bg-[#DCFCE7] text-[var(--sa-green)]" : "bg-[#FEF3C7] text-[var(--sa-amber)]"}`}
      >
        {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      {children}
    </span>
  );
}

function MinosegPipak({ m }: { m: KepMinoseg | null }) {
  if (!m) return <p className="text-sm text-[var(--sa-muted)]">Nézd meg, hogy olvasható-e.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Pipa ok={m.eles}>{m.eles ? "Éles" : "Életlen"}</Pipa>
      <Pipa ok={m.vilagos}>{m.vilagos ? "Elég világos" : m.fenyesseg < 128 ? "Sötét" : "Túl világos"}</Pipa>
      <Pipa ok={m.egeszLap}>{m.egeszLap ? "Egész lap" : "Lelóg a lap"}</Pipa>
    </div>
  );
}

const joOldal = (o: Oldal) => !o.m || (o.m.eles && o.m.vilagos && o.m.egeszLap);

// --------------------------------------------------------- a teljes folyamat

export function Fotozas({
  fuvarok,
  onBezar,
  onBekuldve,
  onNemKaptam,
}: {
  /** A lefotózandó fuvarok sorban — „Mind sorban” esetén több, egyébként egy. */
  fuvarok: FotoFuvar[];
  onBezar: () => void;
  onBekuldve: (fuvarId: string, e: SorEredmeny & { hibas: number }) => void;
  onNemKaptam: (fuvarId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [lepes, setLepes] = useState<"kamera" | "ellenorzes" | "bekuldes" | "kesz">("kamera");
  const [oldalak, setOldalak] = useState<Oldal[]>([]);
  const [friss, setFriss] = useState<Oldal | null>(null);
  const [kuldes, setKuldes] = useState<{ kesz: number; osszes: number } | null>(null);
  const [eredmeny, setEredmeny] = useState<(SorEredmeny & { hibas: number }) | null>(null);
  const urlek = useRef<string[]>([]);

  useEffect(
    () => () => {
      urlek.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const fuvar = fuvarok[index];
  if (!fuvar) return null;

  function felvesz(o: Oldal) {
    urlek.current.push(o.url);
    return o;
  }

  function torol(id: string) {
    setOldalak((t) => t.filter((o) => o.id !== id));
  }

  async function fajlokbol(fajlok: File[], kamerabol: boolean) {
    const uj: Oldal[] = [];
    for (const f of fajlok) uj.push(felvesz(ujOldal(f, await minosegFajlbol(f))));
    if (kamerabol && uj.length === 1) {
      setFriss(uj[0]);
      setLepes("ellenorzes");
    } else {
      setOldalak((t) => [...t, ...uj]);
      setLepes("bekuldes");
    }
  }

  async function bekuldom() {
    if (!oldalak.length) return;
    setKuldes({ kesz: 0, osszes: oldalak.length });
    const e = await bekuld(
      fuvar.fuvarId,
      oldalak.map((o) => o.blob),
      (kesz, osszes) => setKuldes({ kesz, osszes })
    );
    setKuldes(null);
    setEredmeny(e);
    onBekuldve(fuvar.fuvarId, e);
    setLepes("kesz");
  }

  function kovetkezoFuvar() {
    setIndex((i) => i + 1);
    setOldalak([]);
    setFriss(null);
    setEredmeny(null);
    setLepes("kamera");
  }

  if (lepes === "kamera") {
    return (
      <Kamera
        key={`${fuvar.fuvarId}-${oldalak.length}`}
        fuvar={fuvar}
        oldalDb={oldalak.length}
        onMegse={() => (oldalak.length ? setLepes("bekuldes") : onBezar())}
        onFoto={(blob, m) => {
          setFriss(felvesz(ujOldal(blob, m)));
          setLepes("ellenorzes");
        }}
        onFajlok={fajlokbol}
      />
    );
  }

  const keret = "fixed inset-0 z-50 mx-auto flex max-w-md flex-col gap-4 bg-[var(--sa-bg)] px-[18px] pb-6 pt-5 text-[var(--sa-ink)]";

  const tema = SOFOR_THEME;

  if (lepes === "ellenorzes" && friss) {
    const elfogad = (tovabb: "kamera" | "bekuldes") => {
      setOldalak((t) => [...t, friss]);
      setFriss(null);
      setLepes(tovabb);
    };
    return (
      <div style={tema} className={keret}>
        <header className="grid grid-cols-[1fr_auto_1fr] items-center">
          <button type="button" onClick={() => { setFriss(null); setLepes(oldalak.length ? "bekuldes" : "kamera"); }} className="justify-self-start py-2 font-semibold">
            Mégse
          </button>
          <span className="text-[17px] font-bold">{oldalak.length + 1}. oldal · jó lett?</span>
          <span />
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-3xl bg-[#E4E7EE] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL, a next/image nem kell hozzá */}
          <img src={friss.url} alt="A most készült fotó" className="max-h-full max-w-full rounded-lg object-contain shadow" />
        </div>
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-[var(--sa-card)] px-4 py-3.5">
          <MinosegPipak m={friss.m} />
          <p className="text-[13px] text-[var(--sa-muted)]">
            {joOldal(friss) ? "Nézd meg, hogy látszik-e az aláírás és a pecsét." : "Inkább fotózd újra — így nehezen olvasható."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { setFriss(null); setLepes("kamera"); }}
            className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-bold ${joOldal(friss) ? "bg-[var(--sa-card)]" : "bg-[var(--sa-blue)] text-white"}`}
          >
            <RotateCcw className="h-5 w-5" />
            Újra
          </button>
          <button
            type="button"
            onClick={() => elfogad("kamera")}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-blue-soft)] text-base font-bold text-[var(--sa-blue)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.6} />
            Még egy oldal
          </button>
        </div>
        <button
          type="button"
          onClick={() => elfogad("bekuldes")}
          className={`h-[60px] rounded-[18px] text-lg font-bold ${joOldal(friss) ? "bg-[var(--sa-blue)] text-white" : "bg-[var(--sa-card)] text-[var(--sa-ink)]"}`}
        >
          Jó, ennyi oldal
        </button>
      </div>
    );
  }

  if (lepes === "bekuldes") {
    const rosszak = oldalak.filter((o) => !joOldal(o)).length;
    return (
      <div style={tema} className={keret}>
        <header className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Vissza a kamerához"
            onClick={() => setLepes("kamera")}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[var(--sa-card)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-extrabold tracking-tight">{fuvar.cim}</h2>
            <p className="text-sm text-[var(--sa-muted)]">{fuvar.alcim} · {fuvar.papirNev}</p>
          </div>
        </header>
        <section aria-label="Oldalak" className="flex flex-wrap gap-3 rounded-3xl bg-[var(--sa-card)] px-[18px] py-5">
          {oldalak.map((o, i) => (
            <div key={o.id} className="relative flex flex-col items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL */}
              <img src={o.url} alt={`${i + 1}. oldal`} className={`h-[132px] w-[96px] rounded-lg object-cover shadow ${joOldal(o) ? "" : "ring-2 ring-amber-400"}`} />
              <span className="text-[13px] font-semibold text-[var(--sa-muted)]">{i + 1}. oldal</span>
              <button
                type="button"
                aria-label={`${i + 1}. oldal törlése`}
                onClick={() => torol(o.id)}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--sa-ink)] text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLepes("kamera")}
            className="flex h-[132px] w-[96px] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#C3CAD8] bg-[#F7F8FB] text-[13px] font-bold text-[var(--sa-blue)]"
          >
            <Plus className="h-6 w-6" strokeWidth={2.6} />
            Oldal
          </button>
        </section>
        {oldalak.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-[var(--sa-card)] px-4 py-3.5">
            <Pipa ok={rosszak === 0}>
              {rosszak === 0 ? `${oldalak.length} oldal, mind olvasható` : `${rosszak} oldal nehezen olvasható — érdemes újrafotózni`}
            </Pipa>
          </div>
        )}
        <p className="flex items-start gap-2.5 px-1 text-sm leading-snug text-[var(--sa-muted)]">
          <CloudUpload className="mt-0.5 h-5 w-5 shrink-0" />
          Ha nincs térerő, a telefonon marad, és magától feltöltjük, amint lesz. A lapot a rendszer kivágja és kiegyenesíti.
        </p>
        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            disabled={!oldalak.length || kuldes != null}
            onClick={bekuldom}
            className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white disabled:opacity-50"
          >
            {kuldes ? `Küldés ${Math.min(kuldes.kesz + 1, kuldes.osszes)}/${kuldes.osszes}…` : "Beküldöm"}
          </button>
          {fuvar.sajatFuvar && oldalak.length === 0 && (
            <button
              type="button"
              onClick={() => {
                onNemKaptam(fuvar.fuvarId);
                if (index + 1 < fuvarok.length) kovetkezoFuvar();
                else onBezar();
              }}
              className="h-12 text-[15px] font-semibold text-[var(--sa-muted)]"
            >
              Nem kaptam papírt
            </button>
          )}
        </div>
      </div>
    );
  }

  // 4. kész
  const hatra = fuvarok.slice(index + 1);
  const varakozik = (eredmeny?.varakozik ?? 0) > 0;
  const elveszett = (eredmeny?.hibas ?? 0) > 0;
  return (
    <div style={tema} className={keret}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
        <span
          className={`flex h-24 w-24 items-center justify-center rounded-full ${varakozik || elveszett ? "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]" : "bg-[#DCFCE7] text-[var(--sa-green)] shadow-[0_0_0_14px_#EEFBF2]"}`}
        >
          {varakozik ? <CloudUpload className="h-12 w-12" /> : <Check className="h-12 w-12" strokeWidth={3} />}
        </span>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
          {elveszett ? "Nem ment fel" : varakozik ? "Elmentve" : "Beküldve"}
        </h2>
        <p className="max-w-[290px] text-base leading-snug text-[#4B5563]">
          {elveszett
            ? "Néhány oldal nem ment fel. Fotózd le újra, ha lesz térerő."
            : varakozik
              ? "Most nincs térerő. A papír a telefonon van, és magától feltöltjük, amint lesz."
              : eredmeny?.figyelmeztetes ?? "A papír beérkezett. A fuvar átkerül a Kész fuvarok közé."}
        </p>
      </div>
      {hatra.length > 0 ? (
        <>
          <div className="flex items-center gap-3.5 rounded-[22px] bg-[var(--sa-amber-soft)] px-[18px] py-4">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white font-extrabold text-[var(--sa-amber)]">
              {hatra.length}
            </span>
            <span className="min-w-0">
              <span className="block font-bold">Még {hatra.length} papír vár</span>
              <span className="block truncate text-sm text-[var(--sa-amber)]">következő: {hatra[0].cim} · {hatra[0].papirNev}</span>
            </span>
          </div>
          <button type="button" onClick={kovetkezoFuvar} className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
            Következő fotózása
          </button>
          <button type="button" onClick={onBezar} className="h-[52px] rounded-2xl bg-[var(--sa-card)] text-base font-bold">
            Majd később
          </button>
        </>
      ) : (
        <button type="button" onClick={onBezar} className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
          Kész
        </button>
      )}
    </div>
  );
}
