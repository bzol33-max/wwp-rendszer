"use client";

// A papír lefotózása (sofőr app) — 2026-10-23, kutatás + 5 szakértői bírálat
// után. Budaházi Zoltán: külön app nem kell, a meglévő rendszerben működjön,
// és iPhone-on is (az új sofőröknek lehet iPhone-ja).
//
// Menet (iPhone és Android, böngészőben): a telefon SAJÁT kamerája (a hívó
// nyitja a koppintásban — ez adja a legélesebb, teljes felbontású fotót) → a
// lap automatikus megkeresése és kiegyenesítése, ha biztos (OpenCV,
// lap-kereso.ts) → színes fehérítés (feherites, „szkennelt” kinézet) → az
// oldalak listája, Beküldöm. A sarok-igazítás csak opció (gomb a képen).

import { useEffect, useRef, useState } from "react";
import { Camera, Check, CloudUpload, Plus, RotateCcw, X } from "lucide-react";
import { bekuld, type SorEredmeny } from "./papir-sor";
import { SOFOR_THEME } from "./tema";
import { Igazito } from "./igazito";
import {
  AJANLOTT_MIN_TERULET,
  TELJES_KEP,
  betoltOpenCv,
  egyenesitsd,
  feherites,
  keressLapot,
  sarkokTerulete,
  type Sarkok,
} from "./lap-kereso";

export type FotoFuvar = {
  fuvarId: string;
  /** "Tata → Tompaládony" */
  cim: string;
  /** "Fabrika 2000" */
  alcim: string;
  papirNev: string;
  sajatFuvar: boolean;
};

type Oldal = {
  id: string;
  eredeti: File;
  eredetiUrl: string;
  meret: { w: number; h: number };
  sarkok: Sarkok;
  /** Ami beküldésre kerül. */
  kep: Blob;
  kepUrl: string;
  kesz: boolean;
};

const ELEMZES_PX = 900;
/** ≈205 dpi A4-en — a CMR apró betűje is olvasható (képfeldolgozási bírálat). */
const KIMENET_MAX_PX = 2400;

const teljesKep = (s: Sarkok) => s.every((p, i) => Math.abs(p.x - TELJES_KEP[i].x) < 0.005 && Math.abs(p.y - TELJES_KEP[i].y) < 0.005);

type Kep = { forras: CanvasImageSource; width: number; height: number; close(): void };

/**
 * A fotó dekódolása a telefon helyes állása szerint. Régebbi iPhone-on
 * (Safari) a createImageBitmap opciói vagy maga a függvény hiányozhat — akkor
 * sima <img>, ami az EXIF-forgatást magától alkalmazza.
 */
async function dekodol(b: Blob): Promise<Kep> {
  if (typeof createImageBitmap === "function") {
    try {
      const k = await createImageBitmap(b, { imageOrientation: "from-image" });
      return { forras: k, width: k.width, height: k.height, close: () => k.close() };
    } catch {
      try {
        const k = await createImageBitmap(b);
        return { forras: k, width: k.width, height: k.height, close: () => k.close() };
      } catch {
        // tovább az <img>-re
      }
    }
  }
  const u = URL.createObjectURL(b);
  try {
    const img = new Image();
    img.src = u;
    await img.decode();
    return { forras: img, width: img.naturalWidth, height: img.naturalHeight, close: () => img.removeAttribute("src") };
  } finally {
    URL.revokeObjectURL(u);
  }
}

function rajzol(kep: { forras: CanvasImageSource; width: number; height: number }, max: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const arany = Math.min(1, max / Math.max(kep.width, kep.height));
  const c = document.createElement("canvas");
  c.width = Math.round(kep.width * arany);
  c.height = Math.round(kep.height * arany);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(kep.forras, 0, 0, c.width, c.height);
  return { c, ctx };
}

async function kepMeret(fajl: Blob): Promise<{ w: number; h: number }> {
  try {
    const k = await dekodol(fajl);
    const m = { w: k.width, h: k.height };
    k.close();
    return m;
  } catch {
    return { w: 3, h: 4 };
  }
}

/**
 * Böngészős feldolgozás: ha nincs megadva sarok, a lap-kereső javasol (csak
 * biztos, ≥ 40%-os találatot fogad el, különben a teljes kép), majd
 * kiegyenesítés és színes fehérítés. OpenCV nélkül az eredeti megy.
 */
async function feldolgozBelso(fajl: File, adott: Sarkok | null): Promise<{ kep: Blob; sarkok: Sarkok }> {
  const { cv } = await betoltOpenCv();
  // A teljes felbontású dekódolt kép (12–48 MP = 50–190 MB) csak addig él, amíg
  // a ≤ 2400 px-es vászonra rajzoljuk — utána minden ebből dolgozik (bírálat: OOM).
  const bm = await dekodol(fajl);
  let r: ReturnType<typeof rajzol>;
  try {
    r = rajzol(bm, KIMENET_MAX_PX);
  } finally {
    bm.close();
  }
  if (!r) return { kep: fajl, sarkok: adott ?? TELJES_KEP };
  try {
    let sarkok = adott;
    if (!sarkok) {
      const kis = rajzol({ forras: r.c, width: r.c.width, height: r.c.height }, ELEMZES_PX);
      const t = kis ? keressLapot(cv, kis.ctx.getImageData(0, 0, kis.c.width, kis.c.height)) : null;
      if (kis) kis.c.width = 0;
      sarkok = t && sarkokTerulete(t) >= AJANLOTT_MIN_TERULET ? t : TELJES_KEP;
    }
    let kep = r.ctx.getImageData(0, 0, r.c.width, r.c.height);
    if (!teljesKep(sarkok)) kep = egyenesitsd(cv, kep, sarkok);
    kep = feherites(cv, kep);
    const ki = document.createElement("canvas");
    ki.width = kep.width;
    ki.height = kep.height;
    ki.getContext("2d")?.putImageData(kep, 0, 0);
    const b = await new Promise<Blob | null>((ok) => ki.toBlob(ok, "image/jpeg", 0.9));
    ki.width = 0;
    return { kep: b ?? fajl, sarkok };
  } finally {
    r.c.width = 0;
  }
}

/** Egyszerre egy oldal készül (memória), és legfeljebb 25 mp — utána az eredeti fotó megy (bírálat). */
let feldolgozoSor: Promise<unknown> = Promise.resolve();
function feldolgoz(fajl: File, adott: Sarkok | null): Promise<{ kep: Blob; sarkok: Sarkok }> {
  const tartalek = { kep: fajl as Blob, sarkok: adott ?? TELJES_KEP };
  const munka = feldolgozoSor.then(() =>
    Promise.race([
      feldolgozBelso(fajl, adott).catch(() => tartalek),
      new Promise<typeof tartalek>((ok) => setTimeout(() => ok(tartalek), 25_000)),
    ])
  );
  feldolgozoSor = munka.catch(() => undefined);
  return munka;
}

export function Fotozas({
  fuvarok,
  elsoFajlok,
  onBezar,
  onBekuldve,
  onNemKaptam,
}: {
  /** A lefotózandó fuvarok sorban — „Mind sorban” esetén több, egyébként egy. */
  fuvarok: FotoFuvar[];
  /** Az első fuvar oldalai a telefon kamerájából (a hívó nyitotta). */
  elsoFajlok: File[];
  onBezar: () => void;
  onBekuldve: (fuvarId: string, e: SorEredmeny & { hibas: number }) => void;
  onNemKaptam: (fuvarId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [oldalak, setOldalak] = useState<Oldal[]>([]);
  const [nagy, setNagy] = useState<string | null>(null);
  const [igazit, setIgazit] = useState<string | null>(null);
  const [kuldes, setKuldes] = useState<{ kesz: number; osszes: number } | null>(null);
  const [eredmeny, setEredmeny] = useState<(SorEredmeny & { hibas: number }) | null>(null);
  const [hiba, setHiba] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const csere = useRef<string | null>(null);
  const urlek = useRef<string[]>([]);
  const indult = useRef(false);
  const el = useRef(true);

  const fuvar = fuvarok[index];

  const url = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urlek.current.push(u);
    return u;
  };

  async function oldalLesz(f: File, kesz: boolean): Promise<Oldal> {
    const u = url(f);
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, eredeti: f, eredetiUrl: u, meret: await kepMeret(f), sarkok: TELJES_KEP, kep: f, kepUrl: u, kesz };
  }

  async function bekuldom(fuvarId: string, lapok: Blob[]) {
    if (!lapok.length || kuldes) return;
    setKuldes({ kesz: 0, osszes: lapok.length });
    let e: SorEredmeny & { hibas: number };
    try {
      e = await bekuld(fuvarId, lapok, (kesz, osszes) => setKuldes({ kesz, osszes }));
    } catch {
      setKuldes(null);
      setHiba("Nem sikerült elmenteni a papírt a telefonra. Próbáld újra.");
      return;
    }
    setKuldes(null);
    setEredmeny(e);
    try {
      navigator.vibrate?.(e.hibas ? [80, 60, 80] : 60);
    } catch {
      // nem minden telefon rezeg
    }
    onBekuldve(fuvarId, e);
  }

  /** Böngészős út: az oldal azonnal látszik, a kivágás és a fehérítés a háttérben készül. */
  async function bongeszoOldalak(fajlok: File[], helyette: string | null) {
    for (const f of fajlok) {
      const o = await oldalLesz(f, false);
      const id = helyette ?? o.id;
      if (!el.current) return;
      setOldalak((t) => (helyette && t.some((x) => x.id === helyette) ? t.map((x) => (x.id === helyette ? { ...o, id } : x)) : [...t, { ...o, id }]));
      setNagy(id);
      helyette = null;
      const { kep, sarkok } = await feldolgoz(f, null);
      if (!el.current) return;
      const kepUrl = kep === f ? o.eredetiUrl : url(kep);
      setOldalak((t) => t.map((x) => (x.id === id ? { ...x, kep, kepUrl, sarkok, kesz: true } : x)));
    }
  }

  async function igazitasKesz(id: string, s: Sarkok) {
    const o = oldalak.find((x) => x.id === id);
    setIgazit(null);
    if (!o) return;
    setOldalak((t) => t.map((x) => (x.id === id ? { ...x, kesz: false } : x)));
    const { kep } = await feldolgoz(o.eredeti, s);
    if (!el.current) return;
    const kepUrl = kep === o.eredeti ? o.eredetiUrl : url(kep);
    setOldalak((t) => t.map((x) => (x.id === id ? { ...x, kep, kepUrl, sarkok: s, kesz: true } : x)));
  }

  // Az első oldalak a hívótól — egyszer; a setState az async függvényekben, await után fut.
  useEffect(() => {
    if (indult.current) return;
    indult.current = true;
    void betoltOpenCv().catch(() => undefined);
    void Promise.resolve().then(() => (elsoFajlok.length ? bongeszoOldalak(elsoFajlok, null) : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    el.current = true;
    const lista = urlek.current;
    return () => {
      el.current = false;
      lista.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  if (!fuvar) return null;

  const kamerabol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    const helyette = csere.current;
    csere.current = null;
    if (fajlok.length) void bongeszoOldalak(fajlok, helyette);
  };

  function ujFoto(helyette: string | null) {
    csere.current = helyette;
    kamera.current?.click();
  }

  function kovetkezoFuvar() {
    const kov = fuvarok[index + 1];
    if (!kov) return;
    setIndex((i) => i + 1);
    setOldalak([]);
    setNagy(null);
    setEredmeny(null);
    setHiba(null);
    csere.current = null;
    // Ugyanabban a koppintásban nyílik a kamera — különben a böngésző nem engedi.
    kamera.current?.click();
  }

  const inputok = <input ref={kamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={kamerabol} />;
  const keret = "fixed inset-0 z-50 mx-auto flex max-w-md flex-col gap-4 bg-[var(--sa-bg)] px-[18px] pb-6 pt-5 text-[var(--sa-ink)]";

  const igazitando = igazit ? oldalak.find((o) => o.id === igazit) : null;
  if (igazitando) {
    return (
      <div style={SOFOR_THEME}>
        <Igazito
          key={igazitando.id}
          kepUrl={igazitando.eredetiUrl}
          kepMeret={igazitando.meret}
          kezdo={igazitando.sarkok}
          keres={false}
          onKesz={(s) => void igazitasKesz(igazitando.id, s)}
          onMegse={() => setIgazit(null)}
        />
      </div>
    );
  }

  // ---- kész (natív úton rögtön a szkennelés után)
  if (eredmeny || kuldes) {
    const hatra = fuvarok.slice(index + 1);
    const varakozik = (eredmeny?.varakozik ?? 0) > 0;
    const elveszett = (eredmeny?.hibas ?? 0) > 0;
    // A szerver figyelmeztetése (pl. a fuvar még nem zárult le) ne bújjon zöld pipa alá (UX-bírálat).
    const figyelj = Boolean(eredmeny?.figyelmeztetes) && !varakozik && !elveszett;
    const sarga = varakozik || elveszett || figyelj;
    const folyik = Boolean(kuldes);
    return (
      <div style={SOFOR_THEME} className={keret}>
        {inputok}
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
          {folyik ? (
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--sa-blue-soft)] text-[var(--sa-blue)]">
              <CloudUpload className="h-12 w-12 animate-pulse" />
            </span>
          ) : (
            <span
              className={`flex h-24 w-24 items-center justify-center rounded-full ${sarga ? "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]" : "bg-[#DCFCE7] text-[var(--sa-green)] shadow-[0_0_0_14px_#EEFBF2]"}`}
            >
              {varakozik ? <CloudUpload className="h-12 w-12" /> : <Check className="h-12 w-12" strokeWidth={3} />}
            </span>
          )}
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
            {kuldes ? `Küldés ${Math.min(kuldes.kesz + 1, kuldes.osszes)}/${kuldes.osszes}…` : folyik ? "Egy pillanat…" : elveszett ? "Nem ment fel" : varakozik ? "Még nem ment el" : figyelj ? "Elküldve — nézd meg" : "Elküldve"}
          </h2>
          <p className="max-w-[300px] text-base font-semibold leading-snug">
            {oldalak.length} oldal · {fuvar.cim}
          </p>
          {!folyik && (
            <p className={`max-w-[300px] text-base leading-snug ${figyelj ? "font-semibold text-[var(--sa-amber)]" : "text-[#4B5563]"}`}>
              {elveszett
                ? "Néhány oldal nem ment fel. Fotózd le újra, ha lesz térerő."
                : varakozik
                  ? "Most nincs térerő. A papír a telefonon van, és magától elküldjük, amint lesz."
                  : (eredmeny?.figyelmeztetes?.replace(/\s*\(#\d+\)/g, "") ?? "A papír beérkezett az irodába.")}
            </p>
          )}
          {oldalak.length > 0 && (
            <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
              {oldalak.map((o, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL
                <img key={o.id} src={o.kepUrl} alt={`${i + 1}. oldal`} className="h-[96px] w-[70px] shrink-0 rounded-md bg-white object-cover shadow" />
              ))}
            </div>
          )}
        </div>
        {!folyik &&
          (hatra.length > 0 ? (
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
              <button type="button" onClick={kovetkezoFuvar} className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
                <Camera className="h-[22px] w-[22px]" />
                Következő papír
              </button>
              <button type="button" onClick={onBezar} className="h-[52px] rounded-2xl bg-[var(--sa-card)] text-base font-bold">
                Majd később
              </button>
            </>
          ) : (
            <button type="button" onClick={onBezar} className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
              Kész
            </button>
          ))}
      </div>
    );
  }

  // ---- böngészős út: az oldalak listája
  const fo = oldalak.find((o) => o.id === nagy) ?? oldalak.at(-1) ?? null;
  const dolgozik = oldalak.some((o) => !o.kesz);

  return (
    <div style={SOFOR_THEME} className={keret}>
      {inputok}
      <header className="flex items-center gap-3">
        <button type="button" aria-label="Bezárás" onClick={onBezar} className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--sa-card)]">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[21px] font-extrabold tracking-tight">{fuvar.cim}</h2>
          <p className="truncate text-sm text-[var(--sa-muted)]">{fuvar.alcim} · {fuvar.papirNev}</p>
        </div>
      </header>

      {hiba && <p className="rounded-xl bg-[var(--sa-red-soft)] px-3 py-2 text-sm font-semibold text-[var(--sa-red)]">{hiba}</p>}

      {fo ? (
        <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-3xl bg-[#E4E7EE] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL */}
          <img src={fo.kepUrl} alt="A lefotózott lap" className={`max-h-full max-w-full rounded-md object-contain shadow ${fo.kesz ? "" : "opacity-60"}`} />
          <span className="absolute inset-x-0 bottom-4 flex justify-center gap-2 px-3">
            {fo.kesz ? (
              <button type="button" onClick={() => setIgazit(fo.id)} className="rounded-full bg-white/90 px-3.5 py-1.5 text-sm font-bold text-[var(--sa-ink)] shadow">
                Igazítás
              </button>
            ) : (
              <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-bold">Egy pillanat…</span>
            )}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ujFoto(null)}
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[#C3CAD8] bg-[var(--sa-card)] text-lg font-bold text-[var(--sa-blue)]"
        >
          <Camera className="h-12 w-12" />
          Fotózd le a papírt
          <span className="text-sm font-semibold text-[var(--sa-muted)]">Minden oldalt külön</span>
        </button>
      )}

      {oldalak.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1" aria-label="Oldalak">
          {oldalak.map((o, i) => (
            <div key={o.id} className="relative shrink-0">
              <button type="button" onClick={() => setNagy(o.id)} className={`block overflow-hidden rounded-lg ${o.id === fo?.id ? "ring-[3px] ring-[var(--sa-blue)]" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL */}
                <img src={o.kepUrl} alt={`${i + 1}. oldal`} className="h-[74px] w-[54px] bg-white object-cover" />
              </button>
              <button
                type="button"
                aria-label={`${i + 1}. oldal törlése`}
                onClick={() => setOldalak((t) => t.filter((x) => x.id !== o.id))}
                className="absolute -right-2.5 -top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sa-ink)] text-white"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {oldalak.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => ujFoto(fo?.id ?? null)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-card)] text-base font-bold">
              <RotateCcw className="h-5 w-5" />
              Újrafotózom
            </button>
            <button type="button" onClick={() => ujFoto(null)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-blue-soft)] text-base font-bold text-[var(--sa-blue)]">
              <Plus className="h-5 w-5" strokeWidth={2.6} />
              Oldal
            </button>
          </div>
          <button
            type="button"
            disabled={dolgozik}
            onClick={() => void bekuldom(fuvar.fuvarId, oldalak.map((o) => o.kep))}
            className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white disabled:opacity-50"
          >
            {dolgozik ? "Egy pillanat…" : `Beküldöm · ${oldalak.length} oldal`}
          </button>
        </>
      ) : (
        fuvar.sajatFuvar && (
          <button
            type="button"
            onClick={() => {
              onNemKaptam(fuvar.fuvarId);
              onBezar();
            }}
            className="h-12 text-[15px] font-semibold text-[var(--sa-muted)]"
          >
            Nem kaptam papírt
          </button>
        )
      )}
    </div>
  );
}
