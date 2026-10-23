"use client";

// A papír lefotózása (sofőr app) — 2026-10-23-i újragondolás. Budaházi
// Zoltán: „a szkennelő nem jó az appban, jobb megoldás kell” — az élő,
// böngészős kamera homályos volt, nem fotózott magától, nem vágta ki a lapot,
// és sok lépés volt. Helyette (az ő választása):
//
//  1. A „Fotó” gomb a TELEFON SAJÁT KAMERÁJÁT nyitja (éles, vaku, fókusz,
//     amit a sofőr megszokott) — ezt a hívó a koppintásban nyitja meg, így
//     a Fotozas már a kész képpel indul.
//  2. A kép azonnal a szerverre megy előnézetre (szkennelElonezet — ugyanaz a
//     szkenner, mint a beküldéskor): a sofőr a KIVÁGOTT, KIEGYENESÍTETT lapot
//     látja. Ha nincs térerő, az eredeti kép látszik, a vágás beküldéskor lesz.
//  3. Egy képernyő: nagyban a lap, alatta az oldalak, és három gomb: Újra,
//     + Oldal, Beküldöm. A beküldés a telefon sorába tesz (papir-sor.ts):
//     térerő nélkül ott vár, és magától felmegy.
//  4. Kész — ha van még papírra váró fuvar, egy gombbal jön a következő.

import { useEffect, useRef, useState } from "react";
import { Camera, Check, CloudUpload, ImageIcon, Plus, RotateCcw, X } from "lucide-react";
import { szkennelElonezet } from "@/lib/fuvarozas/sofor-app";
import { bekuld, type SorEredmeny } from "./papir-sor";
import { SOFOR_THEME } from "./tema";

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
  fajl: File;
  /** A kivágott lap (szerver), vagy amíg / ha az nincs, az eredeti fotó helyi URL-je. */
  kep: string;
  allapot: "keszul" | "kivagva" | "nincs_lap" | "offline";
};

/** Az előnézethez elég egy ~1600 px-es kép (gyenge térerőn is gyorsan felmegy); beküldéskor a teljes megy. */
async function elonezetKep(fajl: File): Promise<Blob> {
  try {
    const kep = await createImageBitmap(fajl);
    try {
      const arany = Math.min(1, 1600 / Math.max(kep.width, kep.height));
      const c = document.createElement("canvas");
      c.width = Math.round(kep.width * arany);
      c.height = Math.round(kep.height * arany);
      c.getContext("2d")?.drawImage(kep, 0, 0, c.width, c.height);
      const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
      return b ?? fajl;
    } finally {
      kep.close();
    }
  } catch {
    return fajl;
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
  const [kuldes, setKuldes] = useState<{ kesz: number; osszes: number } | null>(null);
  const [eredmeny, setEredmeny] = useState<(SorEredmeny & { hibas: number }) | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const csere = useRef<string | null>(null);
  const urlek = useRef<string[]>([]);
  const indult = useRef(false);

  const fuvar = fuvarok[index];

  async function hozzaad(fajlok: File[], helyette: string | null) {
    const ujak: Oldal[] = fajlok.map((fajl) => {
      const url = URL.createObjectURL(fajl);
      urlek.current.push(url);
      return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, fajl, kep: url, allapot: "keszul" };
    });
    setOldalak((t) => {
      if (!helyette) return [...t, ...ujak];
      const i = t.findIndex((o) => o.id === helyette);
      return i < 0 ? [...t, ...ujak] : [...t.slice(0, i), ...ujak, ...t.slice(i + 1)];
    });
    setNagy(ujak.at(-1)?.id ?? null);
    for (const o of ujak) {
      try {
        const form = new FormData();
        form.append("foto", await elonezetKep(o.fajl), "elonezet.jpg");
        const e = await szkennelElonezet(form);
        setOldalak((t) => t.map((x) => (x.id === o.id ? { ...x, kep: e.kep, allapot: e.kivagva ? "kivagva" : "nincs_lap" } : x)));
      } catch {
        setOldalak((t) => t.map((x) => (x.id === o.id ? { ...x, allapot: "offline" } : x)));
      }
    }
  }

  // Az első kép(ek) a hívótól — egyszer, a megjelenéskor; a setState az async hozzaad-ban, await után fut.
  useEffect(() => {
    if (indult.current) return;
    indult.current = true;
    if (elsoFajlok.length) void hozzaad(elsoFajlok, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      urlek.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  if (!fuvar) return null;

  const fajlValaszt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fajlok = Array.from(e.target.files ?? []);
    e.target.value = "";
    const helyette = csere.current;
    csere.current = null;
    if (fajlok.length) void hozzaad(fajlok, helyette);
  };

  function ujFoto(helyette: string | null) {
    csere.current = helyette;
    kamera.current?.click();
  }

  async function bekuldom() {
    if (!oldalak.length) return;
    setKuldes({ kesz: 0, osszes: oldalak.length });
    const e = await bekuld(
      fuvar.fuvarId,
      oldalak.map((o) => o.fajl),
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
    // Ugyanabban a koppintásban nyílik a kamera — különben a böngésző nem engedi.
    kamera.current?.click();
  }

  const inputok = (
    <>
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={fajlValaszt} />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={fajlValaszt} />
    </>
  );
  const keret = "fixed inset-0 z-50 mx-auto flex max-w-md flex-col gap-4 bg-[var(--sa-bg)] px-[18px] pb-6 pt-5 text-[var(--sa-ink)]";

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
  const keszul = oldalak.some((o) => o.allapot === "keszul");
  const nincsLap = oldalak.filter((o) => o.allapot === "nincs_lap").length;

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
        <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-3xl bg-[#E4E7EE] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- szerverről jött data-URL vagy helyi blob-URL */}
          <img src={fo.kep} alt="A lefotózott lap" className={`max-h-full max-w-full rounded-md object-contain shadow ${fo.allapot === "keszul" ? "opacity-60" : ""}`} />
          <span className="absolute inset-x-0 bottom-4 flex justify-center px-3">
            <span
              role="status"
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${fo.allapot === "kivagva" ? "bg-[var(--sa-green-soft)] text-[var(--sa-green)]" : fo.allapot === "keszul" ? "bg-white text-[var(--sa-ink)]" : "bg-[var(--sa-amber-soft)] text-[var(--sa-amber)]"}`}
            >
              {fo.allapot === "kivagva"
                ? "✓ Kivágva, kiegyenesítve"
                : fo.allapot === "keszul"
                  ? "Kivágás…"
                  : fo.allapot === "offline"
                    ? "Nincs térerő — a kivágás beküldéskor lesz"
                    : "Nem találtam a lap szélét — fotózd sötétebb alapon"}
            </span>
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
              <button
                type="button"
                onClick={() => setNagy(o.id)}
                className={`block overflow-hidden rounded-lg ${o.id === fo?.id ? "ring-[3px] ring-[var(--sa-blue)]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- helyi / data-URL */}
                <img src={o.kep} alt={`${i + 1}. oldal`} className="h-[74px] w-[54px] bg-white object-cover" />
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

      {nincsLap > 0 && (
        <p className="-mt-1 px-1 text-[13px] leading-snug text-[var(--sa-muted)]">
          Ha a lap szélét nem találta, a kép vágatlanul megy be — ez is jó, ha olvasható.
        </p>
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
            {kuldes
              ? `Küldés ${Math.min(kuldes.kesz + 1, kuldes.osszes)}/${kuldes.osszes}…`
              : keszul
                ? `Beküldöm (${oldalak.length} oldal)`
                : `Beküldöm · ${oldalak.length} oldal`}
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
