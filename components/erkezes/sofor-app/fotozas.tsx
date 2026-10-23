"use client";

// A papír lefotózása (sofőr app). 2026-10-23, Budaházi Zoltán: „nem jó,
// próbáltuk, keresd meg a legjobb módszert … appon belül kell, ingyenesen”.
// A sofőrök valódi fotóin a szerveroldali automatikus vágó rossz részt vágott
// ki, a „tisztítás” pedig kifakította a lapot. Az új menet — ugyanaz, mint a
// CamScanner-szerű appoké, ingyenes eszközökkel:
//
//  1. a „Fotó” a TELEFON SAJÁT KAMERÁJÁT nyitja (a hívó a koppintásban);
//  2. Igazítás: a fotón négy sarok — a telefon OpenCV-vel megkeresi a lapot
//     (lap-kereso.ts), a sofőr ujjal a lap sarkaira húzza őket (nagyítóval);
//     ha a gép nem biztos, a teljes kép a kiinduló állapot;
//  3. Kész → a lap kiegyenesítve, SZÍNESEN, utólagos tisztítás nélkül; a
//     szerver már nem nyúl hozzá (sofor.ts feltoltFuvarlevelFoto);
//  4. oldalak listája: Újra / + Oldal / Beküldöm; a beküldés a telefon
//     sorába tesz (papir-sor.ts), térerő nélkül ott vár, és magától felmegy.

import { useEffect, useRef, useState } from "react";
import { Camera, Check, CloudUpload, ImageIcon, Plus, RotateCcw, X } from "lucide-react";
import { bekuld, type SorEredmeny } from "./papir-sor";
import { SOFOR_THEME } from "./tema";
import { Igazito } from "./igazito";
import { KeretesKamera } from "./keretes-kamera";
import {
  AJANLOTT_MIN_TERULET,
  TELJES_KEP,
  betoltOpenCv,
  egyenesitsd,
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
  /** Ami beküldésre kerül: a kiegyenesített lap, vagy (teljes képnél) az eredeti. */
  kep: Blob;
  kepUrl: string;
};

type Igazitas = {
  /** Meglévő oldal újraigazítása (vagy cseréje), különben új oldal. */
  helyette: string | null;
  eredeti: File;
  eredetiUrl: string;
  meret: { w: number; h: number };
  javaslat: Sarkok;
  keres: boolean;
};

const ELEMZES_PX = 900;
/** A kiegyenesítés legfeljebb ekkora képen fut — olvasható marad, és a gyengébb telefon memóriája is bírja. */
const KIMENET_MAX_PX = 2400;

const teljesKep = (s: Sarkok) => s.every((p, i) => Math.abs(p.x - TELJES_KEP[i].x) < 0.005 && Math.abs(p.y - TELJES_KEP[i].y) < 0.005);

function rajzol(kep: ImageBitmap, max: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const arany = Math.min(1, max / Math.max(kep.width, kep.height));
  const c = document.createElement("canvas");
  c.width = Math.round(kep.width * arany);
  c.height = Math.round(kep.height * arany);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(kep, 0, 0, c.width, c.height);
  return { c, ctx };
}

/** A megtalált lap sarkai, ha elég nagy és biztos; különben null. */
async function javasol(fajl: File): Promise<Sarkok | null> {
  try {
    const [{ cv }, kep] = await Promise.all([betoltOpenCv(), createImageBitmap(fajl)]);
    try {
      const r = rajzol(kep, ELEMZES_PX);
      if (!r) return null;
      const s = keressLapot(cv, r.ctx.getImageData(0, 0, r.c.width, r.c.height));
      return s && sarkokTerulete(s) >= AJANLOTT_MIN_TERULET ? s : null;
    } finally {
      kep.close();
    }
  } catch {
    return null;
  }
}

/** A lap kiegyenesítése a jóváhagyott sarkokkal; teljes képnél (vagy ha nincs OpenCV) az eredeti marad. */
async function kiegyenesit(fajl: File, s: Sarkok): Promise<Blob> {
  if (teljesKep(s)) return fajl;
  try {
    const [{ cv }, kep] = await Promise.all([betoltOpenCv(), createImageBitmap(fajl)]);
    try {
      const r = rajzol(kep, KIMENET_MAX_PX);
      if (!r) return fajl;
      const lap = egyenesitsd(cv, r.ctx.getImageData(0, 0, r.c.width, r.c.height), s);
      const ki = document.createElement("canvas");
      ki.width = lap.width;
      ki.height = lap.height;
      ki.getContext("2d")?.putImageData(lap, 0, 0);
      const b = await new Promise<Blob | null>((ok) => ki.toBlob(ok, "image/jpeg", 0.9));
      return b ?? fajl;
    } finally {
      kep.close();
    }
  } catch {
    return fajl;
  }
}

async function kepMeret(fajl: File): Promise<{ w: number; h: number }> {
  try {
    const k = await createImageBitmap(fajl);
    const m = { w: k.width, h: k.height };
    k.close();
    return m;
  } catch {
    return { w: 3, h: 4 };
  }
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
  /** A hívó által (a koppintásban) megnyitott kamerából jött kép(ek) az első fuvarhoz. */
  elsoFajlok: File[];
  onBezar: () => void;
  onBekuldve: (fuvarId: string, e: SorEredmeny & { hibas: number }) => void;
  onNemKaptam: (fuvarId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [oldalak, setOldalak] = useState<Oldal[]>([]);
  const [nagy, setNagy] = useState<string | null>(null);
  const [igazitas, setIgazitas] = useState<Igazitas | null>(null);
  /** Nyitva-e a keretes kamera, és melyik oldal helyett fotóz (Újra). */
  const [kameraNyitva, setKameraNyitva] = useState<{ helyette: string | null } | null>(() => (elsoFajlok.length ? null : { helyette: null }));
  const [dolgozik, setDolgozik] = useState(false);
  const [kuldes, setKuldes] = useState<{ kesz: number; osszes: number } | null>(null);
  const [eredmeny, setEredmeny] = useState<(SorEredmeny & { hibas: number }) | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const csere = useRef<string | null>(null);
  const urlek = useRef<string[]>([]);
  const indult = useRef(false);

  const fuvar = fuvarok[index];

  const url = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urlek.current.push(u);
    return u;
  };

  /**
   * Egy kép a kamerából: igazítás-képernyő. Kiinduló sarkok: a kamera kerete
   * (ha a keretes kamerából jött), különben a teljes kép; ha a lap-kereső
   * biztos lapot talál, az lép a helyére.
   */
  async function igazitasra(fajl: File, helyette: string | null, keret: Sarkok | null = null) {
    const meret = await kepMeret(fajl);
    const eredetiUrl = url(fajl);
    const alap = keret ?? TELJES_KEP;
    setIgazitas({ helyette, eredeti: fajl, eredetiUrl, meret, javaslat: alap, keres: true });
    const talalt = await javasol(fajl);
    setIgazitas((g) => (g && g.eredeti === fajl ? { ...g, javaslat: talalt ?? alap, keres: false } : g));
  }

  /** Több kép a galériából: vágás nélkül kerülnek be, rákoppintva igazíthatók. */
  async function galeriabol(fajlok: File[]) {
    const ujak: Oldal[] = [];
    for (const f of fajlok) {
      const u = url(f);
      ujak.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, eredeti: f, eredetiUrl: u, meret: await kepMeret(f), sarkok: TELJES_KEP, kep: f, kepUrl: u });
    }
    setOldalak((t) => [...t, ...ujak]);
    setNagy(ujak.at(-1)?.id ?? null);
  }

  async function igazitasKesz(s: Sarkok) {
    const g = igazitas;
    if (!g) return;
    setDolgozik(true);
    const kep = await kiegyenesit(g.eredeti, s);
    const o: Oldal = {
      id: g.helyette ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eredeti: g.eredeti,
      eredetiUrl: g.eredetiUrl,
      meret: g.meret,
      sarkok: s,
      kep,
      kepUrl: kep === g.eredeti ? g.eredetiUrl : url(kep),
    };
    setOldalak((t) => (g.helyette && t.some((x) => x.id === g.helyette) ? t.map((x) => (x.id === g.helyette ? o : x)) : [...t, o]));
    setNagy(o.id);
    setIgazitas(null);
    setDolgozik(false);
  }

  // Az első kép a hívótól — egyszer; a setState az async függvényben, await után fut.
  useEffect(() => {
    if (indult.current) return;
    indult.current = true;
    // Az OpenCV már most töltődjön, mire a sofőr a Kész-re nyom.
    void betoltOpenCv().catch(() => undefined);
    void Promise.resolve().then(() => (elsoFajlok.length === 1 ? igazitasra(elsoFajlok[0], null) : elsoFajlok.length > 1 ? galeriabol(elsoFajlok) : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      urlek.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  if (!fuvar) return null;

  const kamerabol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    const helyette = csere.current;
    csere.current = null;
    if (fajlok[0]) void igazitasra(fajlok[0], helyette);
  };
  const galeriaValaszt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fajlok.length) void galeriabol(fajlok);
  };

  function ujFoto(helyette: string | null) {
    setKameraNyitva({ helyette });
  }

  async function bekuldom() {
    if (!oldalak.length) return;
    setKuldes({ kesz: 0, osszes: oldalak.length });
    const e = await bekuld(
      fuvar.fuvarId,
      oldalak.map((o) => o.kep),
      (kesz, osszes) => setKuldes({ kesz, osszes })
    );
    setKuldes(null);
    setEredmeny(e);
    onBekuldve(fuvar.fuvarId, e);
  }

  function kovetkezoFuvar() {
    setIndex((i) => i + 1);
    setOldalak([]);
    setNagy(null);
    setEredmeny(null);
    setKameraNyitva({ helyette: null });
  }

  const inputok = (
    <>
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={kamerabol} />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={galeriaValaszt} />
    </>
  );
  const keret = "fixed inset-0 z-50 mx-auto flex max-w-md flex-col gap-4 bg-[var(--sa-bg)] px-[18px] pb-6 pt-5 text-[var(--sa-ink)]";

  if (kameraNyitva && !igazitas) {
    return (
      <div style={SOFOR_THEME}>
        {inputok}
        <KeretesKamera
          cim={fuvar.cim}
          alcim={fuvar.alcim}
          oldalDb={oldalak.length}
          onFoto={(fajl, keret) => {
            const helyette = kameraNyitva.helyette;
            setKameraNyitva(null);
            void igazitasra(fajl, helyette, keret);
          }}
          onTelefonKamera={() => {
            csere.current = kameraNyitva.helyette;
            setKameraNyitva(null);
            kamera.current?.click();
          }}
          onGaleria={() => {
            setKameraNyitva(null);
            galeria.current?.click();
          }}
          onMegse={() => {
            setKameraNyitva(null);
            if (!oldalak.length) onBezar();
          }}
        />
      </div>
    );
  }

  if (igazitas) {
    return (
      <div style={SOFOR_THEME}>
        {inputok}
        <Igazito
          key={igazitas.eredetiUrl}
          kepUrl={igazitas.eredetiUrl}
          kepMeret={igazitas.meret}
          kezdo={igazitas.javaslat}
          keres={igazitas.keres || dolgozik}
          onKesz={(s) => void igazitasKesz(s)}
          onMegse={() => setIgazitas(null)}
        />
      </div>
    );
  }

  // ---- kész
  if (eredmeny) {
    const hatra = fuvarok.slice(index + 1);
    const varakozik = eredmeny.varakozik > 0;
    const elveszett = eredmeny.hibas > 0;
    return (
      <div style={SOFOR_THEME} className={keret}>
        {inputok}
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
          <span
            className={`flex h-24 w-24 items-center justify-center rounded-full ${varakozik || elveszett ? "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]" : "bg-[#DCFCE7] text-[var(--sa-green)] shadow-[0_0_0_14px_#EEFBF2]"}`}
          >
            {varakozik ? <CloudUpload className="h-12 w-12" /> : <Check className="h-12 w-12" strokeWidth={3} />}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight">{elveszett ? "Nem ment fel" : varakozik ? "Elmentve" : "Beküldve"}</h2>
          <p className="max-w-[290px] text-base leading-snug text-[#4B5563]">
            {elveszett
              ? "Néhány oldal nem ment fel. Fotózd le újra, ha lesz térerő."
              : varakozik
                ? "Most nincs térerő. A papír a telefonon van, és magától feltöltjük, amint lesz."
                : eredmeny.figyelmeztetes ?? "A papír beérkezett. A fuvar átkerül a Kész fuvarok közé."}
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
            <button type="button" onClick={kovetkezoFuvar} className="flex h-[60px] items-center justify-center gap-2.5 rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white">
              <Camera className="h-[22px] w-[22px]" />
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

  // ---- az oldalak (egy képernyő)
  const fo = oldalak.find((o) => o.id === nagy) ?? oldalak.at(-1) ?? null;

  return (
    <div style={SOFOR_THEME} className={keret}>
      {inputok}
      <header className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Bezárás"
          onClick={onBezar}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--sa-card)]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[21px] font-extrabold tracking-tight">{fuvar.cim}</h2>
          <p className="truncate text-sm text-[var(--sa-muted)]">{fuvar.alcim} · {fuvar.papirNev}</p>
        </div>
      </header>

      {fo ? (
        <button
          type="button"
          onClick={() => setIgazitas({ helyette: fo.id, eredeti: fo.eredeti, eredetiUrl: fo.eredetiUrl, meret: fo.meret, javaslat: fo.sarkok, keres: false })}
          className="relative flex min-h-0 flex-1 items-center justify-center rounded-3xl bg-[#E4E7EE] p-3"
          aria-label="Sarkok igazítása"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-URL */}
          <img src={fo.kepUrl} alt="A lefotózott lap" className="max-h-full max-w-full rounded-md object-contain shadow" />
          <span className="absolute inset-x-0 bottom-4 flex justify-center px-3">
            <span
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${teljesKep(fo.sarkok) ? "bg-white text-[var(--sa-ink)]" : "bg-[var(--sa-green-soft)] text-[var(--sa-green)]"}`}
            >
              {teljesKep(fo.sarkok) ? "Teljes kép · koppints a vágáshoz" : "✓ Kiegyenesítve · koppints az igazításhoz"}
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setKameraNyitva({ helyette: null })}
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
              <button
                type="button"
                onClick={() => setNagy(o.id)}
                className={`block overflow-hidden rounded-lg ${o.id === fo?.id ? "ring-[3px] ring-[var(--sa-blue)]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- helyi / data-URL */}
                <img src={o.kepUrl} alt={`${i + 1}. oldal`} className="h-[74px] w-[54px] bg-white object-cover" />
              </button>
              <button
                type="button"
                aria-label={`${i + 1}. oldal törlése`}
                onClick={() => setOldalak((t) => t.filter((x) => x.id !== o.id))}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--sa-ink)] text-white"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => galeria.current?.click()}
            className="flex h-[74px] w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[var(--sa-card)] text-[11px] font-bold text-[var(--sa-muted)]"
          >
            <ImageIcon className="h-5 w-5" />
            Galéria
          </button>
        </div>
      )}

      {oldalak.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => ujFoto(fo?.id ?? null)}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-card)] text-base font-bold"
            >
              <RotateCcw className="h-5 w-5" />
              Újra
            </button>
            <button
              type="button"
              onClick={() => ujFoto(null)}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-blue-soft)] text-base font-bold text-[var(--sa-blue)]"
            >
              <Plus className="h-5 w-5" strokeWidth={2.6} />
              Oldal
            </button>
          </div>
          <button
            type="button"
            disabled={kuldes != null}
            onClick={bekuldom}
            className="h-[60px] rounded-[18px] bg-[var(--sa-blue)] text-lg font-bold text-white disabled:opacity-50"
          >
            {kuldes ? `Küldés ${Math.min(kuldes.kesz + 1, kuldes.osszes)}/${kuldes.osszes}…` : `Beküldöm · ${oldalak.length} oldal`}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => galeria.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--sa-card)] font-bold"
          >
            <ImageIcon className="h-5 w-5" />
            Kép a galériából
          </button>
          {fuvar.sajatFuvar && (
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
          )}
        </div>
      )}
    </div>
  );
}
