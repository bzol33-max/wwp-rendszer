"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS, SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";
import type { FuvarBlokk, JarmuIdovonalEredmeny, MegalloBejegyzes } from "@/lib/fuvarozas/actions";
import type { JarmuFuvarCsoport } from "@/lib/attekintes/actions";
import {
  allasokSzoveg,
  formatEltelt,
  formatIdo,
  formatSzam,
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
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-[var(--at-tile)] px-3 py-2.5">
      <Mezo cimke="Hol van most" ertek={<span className="font-semibold">{pos ? (pos.cim ?? "ismeretlen hely") : "nincs élő pozíció"}</span>} szeles />
      <Mezo cimke="Sebesség" ertek={pos ? (pos.sebesseg > 0 ? `${pos.sebesseg} km/h` : "áll") : "—"} />
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
      />
      <Mezo cimke="Ma megtett" ertek={eredmeny?.napiKm !== null && eredmeny?.napiKm !== undefined ? `${formatSzam(eredmeny.napiKm)} km` : "—"} />
      <Mezo cimke="Következő" ertek={kovetkezoSzoveg(kovetkezo, eredmeny?.eloEta ?? null)} szeles />
      {allasok && <Mezo cimke="Nem tervezett állás ma" ertek={allasok} szeles />}
    </div>
  );
}

function FuvarFejsor({ f }: { f: FuvarBlokk }) {
  const r = fuvarReszletek(f);
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{r.megrendelo}</div>
        <div className="text-xs text-[var(--at-muted)]">
          {r.hivatkozas}
          {r.aru && ` · ${r.aru}`}
        </div>
      </div>
      {r.dij && <span className="shrink-0 text-sm font-bold">{r.dij}</span>}
    </div>
  );
}

function MegalloSorok({ b, s }: { b: MegalloBejegyzes; s: SorAdat }) {
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
        <td colSpan={3} className={`border-b border-[var(--at-border)] px-2 ${vanReszlet ? "pb-2.5" : "pb-0"}`}>
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
  const ctx = { maiNap: true, eloVan: !!eredmeny?.eloPozicio, kovetkezo, most };
  const kovetkezok = csoport?.kovetkezok ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        <span className="text-base font-bold">{jarmu.sofor}</span>
        <span className="text-sm text-[var(--at-muted)]">{jarmu.label}</span>
      </div>
      <HolVanMost eredmeny={eredmeny} most={most} jarmuNincsGps={jarmu.ecofleetObjectId === null} />
      <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-1 py-1">
        {fuvarok.length === 0 ? (
          <p className="px-2 py-2 text-sm text-[var(--at-muted)]">Mára nincs fuvar ezen a kocsin.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Megálló", "Érkezés", "Távozás"].map((c) => (
                  <th key={c} className={`border-b-2 border-[var(--at-border)] px-2 py-1.5 text-left ${CIMKE}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fuvarok.map((f) => (
                <FuvarSorok key={f.fuvarId} f={f} ctx={ctx} />
              ))}
            </tbody>
          </table>
        )}
      </div>
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

function FuvarSorok({ f, ctx }: { f: FuvarBlokk; ctx: { maiNap: boolean; eloVan: boolean; kovetkezo: MegalloBejegyzes | null; most: number } }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="px-2 pb-1 pt-3">
          <FuvarFejsor f={f} />
        </td>
      </tr>
      {f.megallok.map((b, i) => (
        <MegalloSorok key={`${b.fuvarId}-${b.megalloIndex}`} b={b} s={sorAdatok(b, f, { ...ctx, utolsoLerako: i === f.megallok.length - 1 })} />
      ))}
    </>
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
