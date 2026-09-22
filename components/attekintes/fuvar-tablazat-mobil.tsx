"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS, SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";
import type { FuvarBlokk, JarmuIdovonalEredmeny, MegalloBejegyzes } from "@/lib/fuvarozas/actions";
import type { JarmuFuvarCsoport } from "@/lib/attekintes/actions";
import {
  allValahol,
  allasokSzoveg,
  eloMozog,
  formatEltelt,
  formatIdo,
  formatSzam,
  fuvarKesz,
  fuvarReszletek,
  jelRegi,
  kovetkezoMegallo,
  kovetkezoSzoveg,
  osszkep,
  sorAdatok,
  type Allapot,
  type SorAdat,
} from "@/lib/fuvarozas/gps-sorok";
import { MegbizasReszlet } from "@/components/attekintes/jarmu-kartya";

// Az Áttekintés mobil "Fuvar" füle — a GPS lap táblázatos napja telefonra
// szabva (M4 látványterv): fent a nap összképe, alatta a három kocsi füle,
// a lapok között balra-jobbra húzással (scroll-snap) vagy a fülre koppintva
// lehet váltani. Kocsinként a "Hol van most" doboz, majd a háromoszlopos
// táblázat (Megálló, Érkezés, Távozás), a rakodás, a sofőr jelzése és a
// gond a sor alatt. A cellák tartalma ugyanabból a sorAdatok függvényből
// jön, mint a /fuvarozas GPS fülön, csak az Áttekintés saját (--at-*)
// színsémájával rajzolva.

const CIMKE = "text-[11px] font-semibold uppercase tracking-wide text-[var(--at-muted)]";

const ALLAPOT_CLASS: Record<Allapot, string> = {
  Kész: "bg-[var(--at-positive)]/15 text-[var(--at-positive)]",
  Rakodik: "bg-[var(--at-accent)]/15 text-[var(--at-accent)]",
  "Úton oda": "bg-[var(--at-accent)]/15 text-[var(--at-accent)]",
  Csúszik: "bg-amber-100 text-amber-800",
  Terv: "bg-[var(--at-tile)] text-[var(--at-muted)]",
};

function Mezo({ cimke, ertek, szeles }: { cimke: string; ertek: ReactNode; szeles?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${szeles ? "col-span-2" : ""}`}>
      <span className={CIMKE}>{cimke}</span>
      <span className="text-sm">{ertek}</span>
    </div>
  );
}

/**
 * Mióta tart a mostani állapot — a nap utolsó, még élő GPS-szakaszából.
 * Az Ecofleet a folyamatban lévő szakaszt nem zárja le, ezért az idővonal
 * `elo` jelzéssel hosszabbítja a jelenig; ennek a kezdete a keresett időpont.
 */
function mostaniSzakaszKezdet(eredmeny: JarmuIdovonalEredmeny | undefined): { kezdet: Date; all: boolean } | null {
  const szakaszok = eredmeny?.szakaszok ?? [];
  for (let i = szakaszok.length - 1; i >= 0; i--) {
    const sz = szakaszok[i];
    if (sz.tipus === "allas" || sz.tipus === "vezetes") {
      return { kezdet: sz.kezdet, all: sz.tipus === "allas" };
    }
  }
  return null;
}

/** "3 ó 51 p" / "48 p" — a nagy állapot-jelzőbe, ahol a másodperc nem érdekes. */
function formatTartam(kezdet: Date, most: number): string {
  const perc = Math.max(0, Math.round((most - new Date(kezdet).getTime()) / 60000));
  if (perc < 60) return `${perc} p`;
  return `${Math.floor(perc / 60)} ó ${perc % 60} p`;
}

function HolVanMost({ eredmeny, most, jarmuNincsGps }: { eredmeny: JarmuIdovonalEredmeny | undefined; most: number; jarmuNincsGps: boolean }) {
  if (jarmuNincsGps) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <b>Nincs GPS-kapcsolat.</b> Az idők a megbízások tervéből jönnek, nem a kocsi helyzetéből.
      </div>
    );
  }
  if (eredmeny?.hiba) {
    return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{eredmeny.hiba}</div>;
  }
  const pos = eredmeny?.eloPozicio ?? null;
  const regi = pos ? jelRegi(pos, most) : false;
  const kovetkezo = kovetkezoMegallo(eredmeny?.fuvarok ?? []);
  const allasok = allasokSzoveg(eredmeny?.nemTervezettAllasok ?? []);
  const szakasz = mostaniSzakaszKezdet(eredmeny);

  // A sebesség a legfontosabb szám ezen a dobozon — ezért nagy, és mellette
  // egy színes jelző mondja meg, hogy áll-e vagy megy, és mióta.
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-[var(--at-tile)] px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold leading-none tabular-nums">{pos ? pos.sebesseg : "—"}</span>
        <span className="text-xs font-semibold text-[var(--at-muted)]">km/h</span>
        <span className="flex-1" />
        {szakasz && (
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold ${
              szakasz.all ? "bg-amber-100 text-amber-800" : "bg-[var(--at-positive)]/15 text-[var(--at-positive)]"
            }`}
          >
            {szakasz.all ? "Áll" : "Megy"} {formatTartam(szakasz.kezdet, most)}
          </span>
        )}
      </div>

      <div className="text-sm font-semibold">{pos ? (pos.cim ?? "ismeretlen hely") : "nincs élő pozíció"}</div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { c: "Motor", e: pos ? (pos.motorJar ? "Jár" : "Áll") : "—" },
          { c: "Km óra", e: pos?.oraallasKm != null ? formatSzam(pos.oraallasKm) : "—" },
          { c: "Ma megtett", e: eredmeny?.napiKm != null ? `${formatSzam(eredmeny.napiKm)} km` : "—" },
        ].map((x) => (
          <div key={x.c} className="rounded-md bg-[var(--at-card)] px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--at-muted)]">{x.c}</div>
            <div className="text-sm font-bold tabular-nums">{x.e}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Mezo
          cimke="Utolsó GPS-jel"
          ertek={
            pos ? (
              regi ? (
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {formatIdo(pos.utolsoAdat)} ({formatEltelt(pos.utolsoAdat, most)})
                </span>
              ) : (
                formatIdo(pos.utolsoAdat)
              )
            ) : (
              "—"
            )
          }
          szeles
        />
        <Mezo cimke="Következő" ertek={kovetkezoSzoveg(kovetkezo, eredmeny?.eloEta ?? null, allValahol(eredmeny?.fuvarok ?? []))} szeles />
        {allasok && <Mezo cimke="Nem tervezett állás ma" ertek={allasok} szeles />}
      </div>
    </div>
  );
}

/** A fuvar egészének állapota a kártya fejlécébe: minden megállója kész, van már érintett/aktuális megállója, csúszik, vagy még terv. */
function fuvarAllapot(f: FuvarBlokk, kovetkezo: MegalloBejegyzes | null, mozog: boolean): Allapot {
  if (fuvarKesz(f)) return "Kész";
  if (f.megallok.some((b) => b.eppenItt)) return "Rakodik";
  if (f.csuszo) return "Csúszik";
  if (mozog && ((f.megallok.some((b) => b.elhagyva) && f.megallok.some((b) => b.napElteres === 0)) || (kovetkezo !== null && kovetkezo.fuvarId === f.fuvarId && kovetkezo.napElteres === 0))) return "Úton oda";
  return "Terv";
}

/**
 * A fuvar kártyájának fejléce: sorszám a kocsi napján belül, megbízó,
 * hivatkozás, áru, díj és a fuvar egészének állapota. Külön, színezett
 * sáv, hogy két egymás utáni megbízás (élesben Micó: Ebes→Balkány, majd
 * Nyírjákó→Mosonmagyaróvár) ne olvadjon egyetlen megállólistává.
 */
function FuvarFejsor({ f, sorszam, osszes, allapot }: { f: FuvarBlokk; sorszam: number; osszes: number; allapot: Allapot }) {
  const r = fuvarReszletek(f);
  return (
    <div className="flex items-start justify-between gap-2 rounded-t-xl border-b border-[var(--at-border)] bg-[var(--at-tile)] px-3 py-2">
      <div className="min-w-0">
        <div className={CIMKE}>
          {sorszam}. fuvar / {osszes}
        </div>
        <div className="truncate text-sm font-bold">{r.megrendelo}</div>
        <div className="text-xs text-[var(--at-muted)]">
          {r.hivatkozas}
          {r.aru && ` · ${r.aru}`}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${ALLAPOT_CLASS[allapot]}`}>{allapot}</span>
        {r.dij && <span className="text-sm font-bold">{r.dij}</span>}
      </div>
    </div>
  );
}

function MegalloSorok({ b, s, utolso }: { b: MegalloBejegyzes; s: SorAdat; utolso: boolean }) {
  const TD = "px-2 py-2 align-top text-sm";
  const vanReszlet = s.rakodas !== "—" || s.sofor.length > 0 || s.gondok.length > 0;
  return (
    <>
      <tr>
        <td className={TD}>
          <div className="text-[11px] text-[var(--at-muted)]">{b.tipus === "felrako" ? "Felrakás" : "Lerakás"}</div>
          <div className="font-semibold">{b.cim}</div>
          <div className="mt-1">
            <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${ALLAPOT_CLASS[s.allapot]}`}>{s.allapot}</span>
          </div>
        </td>
        <td className={TD} title={s.erkezesCim}>
          {s.erkezes}
        </td>
        <td className={TD}>{s.tavozas}</td>
      </tr>
      <tr>
        <td colSpan={3} className={`${utolso ? "" : "border-b border-[var(--at-border)]"} px-2 ${vanReszlet ? "pb-2.5" : "pb-0"}`}>
          {vanReszlet && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="flex flex-col gap-0.5">
                <span className={CIMKE}>Rakodás</span>
                <span className="text-sm">{s.rakodas}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className={CIMKE}>Sofőr jelzése</span>
                <span className="text-xs">{s.sofor.length === 0 ? "—" : s.sofor.map((x, j) => <div key={j}>{x}</div>)}</span>
              </div>
              {s.gondok.length > 0 && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <span className={CIMKE}>Gond</span>
                  {s.gondok.map((g, i) => (
                    <span key={i} className="text-xs text-red-800">
                      {formatIdo(g.mikor)} ({g.nev}): „{g.szoveg}” · {g.nyitott ? <b>nyitott</b> : "lezárva"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

function KocsiLap({ jarmu, eredmeny, csoport, most }: { jarmu: (typeof SAJAT_JARMUVEK)[number]; eredmeny: JarmuIdovonalEredmeny | undefined; csoport: JarmuFuvarCsoport | undefined; most: number }) {
  const fuvarok = eredmeny?.fuvarok ?? [];
  const kovetkezo = kovetkezoMegallo(fuvarok);
  const ctx = { maiNap: true, eloVan: !!eredmeny?.eloPozicio, kovetkezo, allValahol: allValahol(fuvarok), mozog: eloMozog(eredmeny), most };
  const kovetkezok = csoport?.kovetkezok ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        <span className="text-base font-bold">{jarmu.sofor}</span>
        <span className="text-sm text-[var(--at-muted)]">{jarmu.label}</span>
      </div>
      <HolVanMost eredmeny={eredmeny} most={most} jarmuNincsGps={jarmu.ecofleetObjectId === null} />
      {fuvarok.length === 0 ? (
        <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-3 py-2">
          <p className="text-sm text-[var(--at-muted)]">Mára nincs fuvar ezen a kocsin.</p>
        </div>
      ) : (
        fuvarok.map((f, i) => (
          <div key={f.fuvarId} className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
            <FuvarFejsor f={f} sorszam={i + 1} osszes={fuvarok.length} allapot={fuvarAllapot(f, kovetkezo, ctx.mozog)} />
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Megálló", "Érkezés", "Távozás"].map((c) => (
                    <th key={c} className={`border-b border-[var(--at-border)] px-2 py-1.5 text-left ${CIMKE}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.megallok.map((b, j) => (
                  <MegalloSorok
                    key={`${b.fuvarId}-${b.megalloIndex}`}
                    b={b}
                    s={sorAdatok(b, f, { ...ctx, utolsoLerako: j === f.megallok.length - 1 })}
                    utolso={j === f.megallok.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Következő napok</h3>
        {kovetkezok.length === 0 ? (
          <p className="text-sm text-[var(--at-muted)]">Nincs későbbre beütemezett megbízás.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {kovetkezok.map((m) => (
              <MegbizasReszlet key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A sebességmérő sáv felső határa. A magyar tehergépkocsikat a beépített
 * sebességhatároló 90 km/h-ra fogja, tehát a skála pont a valós tartományt
 * fedi le — efölött a sáv telítődik, a szám viszont továbbra is a pontos
 * értéket mutatja. Ha egyszer nagyobb értékek is előfordulnak, ezt az egy
 * számot kell átírni, de akkor a városi 40 km/h rövidebb sávot kap.
 */
const MERO_MAX_KMH = 90;

/** Kiterített sebességmérő: skálás sáv 0-tól MERO_MAX_KMH-ig. */
function MeroSav({ sebesseg, savSzin }: { sebesseg: number | null; savSzin: string }) {
  const arany = sebesseg === null ? 0 : Math.min(Math.max(sebesseg, 0) / MERO_MAX_KMH, 1);
  return (
    <div className="w-[148px] shrink-0">
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--at-tile)]">
        <div className={`h-full rounded-full ${savSzin}`} style={{ width: `${arany * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[5px] w-px bg-[var(--at-border)]" />
        ))}
      </div>
      <div className="flex justify-between text-[9px] tabular-nums text-[var(--at-muted)]">
        <span>0</span>
        <span>30</span>
        <span>60</span>
        <span>{MERO_MAX_KMH}</span>
      </div>
    </div>
  );
}

/**
 * Egy kocsi sora az összefoglaló lapon. Koppintásra a lapozó az adott kocsi
 * lapjára ugrik — ugyanaz, mintha a fülére koppintanál.
 */
function KocsiMeroSor({
  jarmu,
  eredmeny,
  most,
  onValaszt,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  most: number;
  onValaszt: () => void;
}) {
  const pos = eredmeny?.eloPozicio ?? null;
  const nincsNyomkoveto = jarmu.ecofleetObjectId === null;
  const regiJel = pos ? jelRegi(pos, most) : false;
  // Sebességet csak friss jelből mutatunk: egy órája beragadt "78 km/h"
  // rosszabb, mint a bevallott hiány.
  const sebesseg = !pos || nincsNyomkoveto || regiJel ? null : Math.round(pos.sebesseg);
  const mozog = sebesseg !== null && sebesseg > 0;
  const savSzin = mozog
    ? "bg-[var(--at-accent)]"
    : sebesseg === null
      ? "bg-[var(--at-border)]"
      : "bg-[var(--at-muted)]";
  const hely = nincsNyomkoveto
    ? "Nincs nyomkövető a kocsin"
    : !pos
      ? "Nincs GPS-jel"
      : regiJel
        ? `Régi jel · ${pos.cim ?? "ismeretlen hely"} · ${formatEltelt(new Date(pos.utolsoAdat), most)}`
        : (pos.cim ?? "ismeretlen hely");

  return (
    <button
      type="button"
      onClick={onValaszt}
      className="block w-full border-b border-[var(--at-border)] px-3 py-3 text-left last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        <span className="text-[15px] font-semibold">{jarmu.sofor}</span>
        <span className="ml-auto text-[11px] tabular-nums text-[var(--at-muted)]">{jarmu.label}</span>
      </div>
      <div className="mt-2.5 flex items-start gap-3.5">
        <MeroSav sebesseg={sebesseg} savSzin={savSzin} />
        <span className="flex items-baseline gap-1">
          <span className="text-2xl font-bold leading-none tabular-nums">{sebesseg ?? "—"}</span>
          <span className="text-[11px] text-[var(--at-muted)]">km/h</span>
        </span>
      </div>
      <div className="mt-2 truncate text-[13px] text-[var(--at-muted)]">{hely}</div>
    </button>
  );
}

/**
 * A lapozó ELSŐ lapja: három kocsi egy-egy mérősorral, alatta a nap
 * összképe. A négy alapszám mindig látszik; a figyelmeztetések (csúszás,
 * nyitott gond, GPS nélküli kocsi) csak akkor, ha nem nullák — nyugodt
 * napon ne legyen mit átfutni.
 */
function OsszefoglaloLap({
  jarmuvek,
  most,
  onValaszt,
}: {
  jarmuvek: JarmuIdovonalEredmeny[];
  most: number;
  onValaszt: (jarmuIndex: number) => void;
}) {
  const o = osszkep(jarmuvek, true, most);
  const figyelmeztetesek = [
    o.csuszik > 0 ? { kulcs: "csuszik", szoveg: `Csúszik ${o.csuszik}`, piros: false } : null,
    o.nyitottGond > 0 ? { kulcs: "gond", szoveg: `Nyitott gond ${o.nyitottGond}`, piros: true } : null,
    o.gpsNelkul.length > 0
      ? { kulcs: "gps", szoveg: `GPS nélkül ${o.gpsNelkul.length} · ${o.gpsNelkul.join(", ")}`, piros: false }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
        {SAJAT_JARMUVEK.map((j, i) => (
          <KocsiMeroSor
            key={j.sofor}
            jarmu={j}
            eredmeny={jarmuvek.find((a) => a.sofor === j.sofor)}
            most={most}
            onValaszt={() => onValaszt(i)}
          />
        ))}
      </div>

      <div>
        <div className="flex gap-5">
          {[
            { c: "Fuvar ma", v: String(o.fuvar) },
            { c: "Kész", v: String(o.kesz), sz: "text-[var(--at-positive)]" },
            { c: "Folyamatban", v: String(o.folyamatban), sz: "text-[var(--at-accent)]" },
            { c: "Km ma", v: formatSzam(o.km) },
          ].map((x) => (
            <div key={x.c} className="flex flex-col gap-1">
              <span className={`${CIMKE} text-[10px]`}>{x.c}</span>
              <span className={`text-2xl font-bold leading-none tabular-nums ${x.sz ?? ""}`}>{x.v}</span>
            </div>
          ))}
        </div>
        {figyelmeztetesek.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {figyelmeztetesek.map((f) => (
              <span
                key={f.kulcs}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  f.piros ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {f.szoveg}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FuvarTablazatMobil({ jarmuvek, csoportok, most }: { jarmuvek: JarmuIdovonalEredmeny[]; csoportok: JarmuFuvarCsoport[]; most: number }) {
  const [aktiv, setAktiv] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Fülre koppintva a lapozó a megfelelő lapra görget; húzáskor a
  // scroll-snap a legközelebbi lapra áll be, és a fül ahhoz igazodik.
  function ugras(i: number) {
    setAktiv(i);
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }
  function handleScroll() {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== aktiv) setAktiv(i);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex border-b border-[var(--at-border)]">
        <button
          type="button"
          onClick={() => ugras(0)}
          className={`flex flex-1 items-center justify-center py-2.5 text-sm ${
            aktiv === 0 ? "border-b-2 border-[var(--at-text)] font-bold" : "text-[var(--at-muted)]"
          }`}
        >
          Flotta
        </button>
        {SAJAT_JARMUVEK.map((j, i) => (
          <button
            key={j.sofor}
            type="button"
            onClick={() => ugras(i + 1)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm ${
              i + 1 === aktiv ? "border-b-2 border-[var(--at-text)] font-bold" : "text-[var(--at-muted)]"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${JARMU_SZIN_DOT_CLASS[j.szin]}`} />
            {j.sofor}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        onScroll={handleScroll}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="w-full shrink-0 snap-center px-4">
          <OsszefoglaloLap jarmuvek={jarmuvek} most={most} onValaszt={(i) => ugras(i + 1)} />
        </div>
        {SAJAT_JARMUVEK.map((j) => (
          <div key={j.sofor} className="w-full shrink-0 snap-center px-4">
            <KocsiLap
              jarmu={j}
              eredmeny={jarmuvek.find((a) => a.sofor === j.sofor)}
              csoport={csoportok.find((c) => c.jarmu.sofor === j.sofor)}
              most={most}
            />
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-[var(--at-muted)]">
        {aktiv === 0 ? "húzd oldalra a kocsikért →" : "← húzd oldalra a másik laphoz →"}
      </p>
    </div>
  );
}
