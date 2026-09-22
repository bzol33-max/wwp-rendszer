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

export function FuvarTablazatMobil({ jarmuvek, csoportok, most }: { jarmuvek: JarmuIdovonalEredmeny[]; csoportok: JarmuFuvarCsoport[]; most: number }) {
  const [aktiv, setAktiv] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const o = osszkep(jarmuvek, true, most);

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
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] p-3">
        {[
          { c: "Fuvar ma", v: String(o.fuvar) },
          { c: "Kész", v: String(o.kesz), sz: "text-[var(--at-positive)]" },
          { c: "Folyamatban", v: String(o.folyamatban), sz: "text-[var(--at-accent)]" },
          { c: "Csúszik", v: String(o.csuszik), sz: o.csuszik ? "text-amber-700" : "" },
          { c: "Nyitott gond", v: String(o.nyitottGond), sz: o.nyitottGond ? "text-red-700" : "" },
          { c: "GPS nélkül", v: o.gpsNelkul.length ? `${o.gpsNelkul.length} (${o.gpsNelkul.join(", ")})` : "0", sz: o.gpsNelkul.length ? "text-amber-700" : "" },
          { c: "Km ma", v: formatSzam(o.km) },
        ].map((x) => (
          <div key={x.c} className="flex flex-col gap-0.5">
            <span className={`${CIMKE} text-[10px]`}>{x.c}</span>
            <span className={`text-base font-bold ${x.sz ?? ""}`}>{x.v}</span>
          </div>
        ))}
      </div>

      <div className="flex border-b border-[var(--at-border)]">
        {SAJAT_JARMUVEK.map((j, i) => (
          <button
            key={j.sofor}
            type="button"
            onClick={() => ugras(i)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm ${
              i === aktiv ? "border-b-2 border-[var(--at-text)] font-bold" : "text-[var(--at-muted)]"
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
      <p className="text-center text-xs text-[var(--at-muted)]">← húzd oldalra a másik kocsihoz →</p>
    </div>
  );
}
