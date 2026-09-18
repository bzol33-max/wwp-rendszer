"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Fuel } from "lucide-react";
import {
  getIdovonalak,
  getKovetkezoNapokElonezet,
  type ElakadtFuvar,
  type FuvarBlokk,
  type GondJelzes,
  type JarmuIdovonalEredmeny,
  type KovetkezoNap,
  type MegalloBejegyzes,
} from "@/lib/fuvarozas/actions";
import { setMegalloKesz } from "@/lib/fuvarozas/megbizasok";
import { getFogyasztas, type FogyasztasEredmeny, type FogyasztasOsszeg, type JarmuFogyasztas } from "@/lib/fuvarozas/fogyasztas";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import type { FuvarTipus } from "@/lib/fuvarozas/fuvar-constants";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import {
  allValahol,
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

// GPS lap — táblázatos nap. Fent a nap összképe (hét szám), alatta
// kocsinként: a kocsi neve, a "Hol van most" sáv (hely, sebesség, utolsó
// jel, mai km, következő megálló, nem tervezett állás), és egy táblázat,
// amiben minden fel-/lerakó megálló egy sor, minden adat egy feliratozott
// oszlop: Fuvar · Megálló · Város · Állapot · Érkezés · Távozás · Rakodás ·
// Sofőr jelzése. Az idők a GPS-ből (tényleges érkezés/távozás) vagy az
// élő becslésből ("várható") jönnek, a sofőr jelzései (Megérkeztem,
// készre jelölés, fuvarlevél-fotó, várakozás, gond) a saját oszlopukban.
//
// Telefonon (lg alatt) ugyanez kocsinként egy-egy lapon: fent a három
// kocsi füle, a lapok között balra-jobbra húzással (scroll-snap) vagy a
// fülre koppintva lehet váltani; a táblázat három oszlopos (Megálló,
// Érkezés, Távozás), a rakodás és a sofőr jelzése a sor alatt.

type Jarmu = (typeof SAJAT_JARMUVEK)[number];

const SZIN_SAV: Record<JarmuSzin, string> = {
  blue: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
  yellow: "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/40",
  green: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
};

// FIGYELEM: fordított UI-címkézés (történelmi okokból, lásd megbizasok.ts):
// a DB tipus='sajat' sorok a "Bér fuvarok" fülön jelennek meg, tipus='ber' a "Saját fuvarok" fülön.
const FUVAR_TIPUS_CIMKE: Record<FuvarTipus, string> = {
  sajat: "Bér fuvar",
  ber: "Saját fuvar",
};

const FUVAR_TIPUS_BADGE: Record<FuvarTipus, string> = {
  sajat: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  ber: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
};

const CIMKE = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Egy "YYYY-MM-DD" naptári naphoz `delta` nappal odébbi nap — dél (UTC) horgonnyal, hogy DST-váltás körül se csúszhasson el. */
function napEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatNapCim(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" });
}

function formatNapRovid(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

const ALLAPOT_CLASS: Record<Allapot, string> = {
  Kész: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  Rakodik: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  "Úton oda": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  Csúszik: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  Terv: "bg-muted text-muted-foreground",
};

function AllapotJelveny({ a }: { a: Allapot }) {
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${ALLAPOT_CLASS[a]}`}>{a}</span>;
}

/** A GPS lap pipája: a lerakó megálló kézi készre jelölése (ugyanoda ír, ahová a sofőr mobilos megerősítése). */
function KeszGomb({ b, onKeszJelolve }: { b: MegalloBejegyzes; onKeszJelolve: () => void }) {
  const [folyamatban, setFolyamatban] = useState(false);
  if (b.tipus !== "lerako" || b.elhagyva) return null;

  async function handleKesz() {
    setFolyamatban(true);
    try {
      const { fuvarLezarva } = await setMegalloKesz(b.fuvarId, b.megalloIndex);
      toast.success(
        fuvarLezarva
          ? "Megálló készre jelölve — ez volt az utolsó lerakó, a fuvar Teljesítve lett."
          : "Megálló készre jelölve. A fuvar az utolsó lerakó után zárul le."
      );
      onKeszJelolve();
    } catch {
      toast.error("Nem sikerült készre jelölni a megállót.");
    } finally {
      setFolyamatban(false);
    }
  }

  return (
    <button
      type="button"
      disabled={folyamatban}
      onClick={handleKesz}
      title="Kattintás: a megálló megjelölése készre"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-transparent hover:border-green-600 hover:text-green-600 disabled:cursor-wait"
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

function GondSorok({ gondok }: { gondok: GondJelzes[] }) {
  return (
    <>
      {gondok.map((g, i) => (
        <div key={i} className="text-red-700 dark:text-red-400">
          Gond {formatIdo(g.mikor)} ({g.nev}): „{g.szoveg}” · {g.nyitott ? <b>nyitott</b> : "lezárva"}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kocsi fejléc, "Hol van most" sáv
// ---------------------------------------------------------------------------

function Mezo({ cimke, ertek, szeles }: { cimke: string; ertek: ReactNode; szeles?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${szeles ? "col-span-2" : ""}`}>
      <span className={CIMKE}>{cimke}</span>
      <span className="text-sm">{ertek}</span>
    </div>
  );
}

function KocsiCim({ jarmu, napiKm }: { jarmu: Jarmu; napiKm: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
      <span className="text-base font-bold">{jarmu.sofor}</span>
      <span className="text-sm text-muted-foreground">{jarmu.label}</span>
      {napiKm !== null && <span className="ml-auto text-sm text-muted-foreground">Ma {formatSzam(napiKm)} km</span>}
    </div>
  );
}

function HolVanMostSav({
  jarmu,
  eredmeny,
  maiNap,
  most,
  kovetkezo,
  mobil,
}: {
  jarmu: Jarmu;
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
  most: number;
  kovetkezo: MegalloBejegyzes | null;
  mobil: boolean;
}) {
  const allasSzoveg = allasokSzoveg(eredmeny?.nemTervezettAllasok ?? []);

  if (jarmu.ecofleetObjectId === null) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <b>Nincs GPS-kapcsolat.</b> A táblázat idői a megbízások tervéből jönnek, nem a kocsi helyzetéből.
      </div>
    );
  }
  if (eredmeny?.hiba) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{eredmeny.hiba}</div>;
  }
  if (!maiNap) {
    return (
      <div className={`grid gap-3 rounded-lg border px-3 py-2 ${mobil ? "grid-cols-2" : "grid-cols-4"} ${SZIN_SAV[jarmu.szin]}`}>
        <Mezo cimke="Megtett km" ertek={eredmeny?.napiKm !== null && eredmeny?.napiKm !== undefined ? `${formatSzam(eredmeny.napiKm)} km` : "—"} />
        <Mezo cimke="Nem tervezett állás" ertek={allasSzoveg ?? "nem volt"} szeles={!mobil} />
      </div>
    );
  }

  const pos = eredmeny?.eloPozicio ?? null;
  const regi = pos ? jelRegi(pos, most) : false;

  return (
    <div className={`grid gap-3 rounded-lg border px-3 py-2 ${mobil ? "grid-cols-2" : "grid-cols-5"} ${SZIN_SAV[jarmu.szin]}`}>
      <Mezo cimke="Hol van most" ertek={<span className="font-semibold">{pos ? (pos.cim ?? "ismeretlen hely") : "nincs élő pozíció"}</span>} szeles={mobil} />
      <Mezo cimke="Sebesség" ertek={pos ? (pos.sebesseg > 0 ? `${pos.sebesseg} km/h` : "áll") : "—"} />
      <Mezo
        cimke="Utolsó GPS-jel"
        ertek={
          pos ? (
            regi ? (
              <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400" title="Az Ecofleet utolsó adata ennyi ideje érkezett — a pozíció nem feltétlenül a mostani.">
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
      <Mezo cimke="Következő" ertek={kovetkezoSzoveg(kovetkezo, eredmeny?.eloEta ?? null, allValahol(eredmeny?.fuvarok ?? []))} szeles={mobil} />
      {allasSzoveg && <Mezo cimke="Nem tervezett állás ma" ertek={allasSzoveg} szeles />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Táblázatok
// ---------------------------------------------------------------------------

type TablaCtx = {
  maiNap: boolean;
  eloVan: boolean;
  kovetkezo: MegalloBejegyzes | null;
  allValahol: boolean;
  most: number;
  onKeszJelolve: () => void;
};

function FuvarCella({ f }: { f: FuvarBlokk }) {
  const r = fuvarReszletek(f);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{r.megrendelo}</span>
        <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${FUVAR_TIPUS_BADGE[f.fuvarTipus]}`}>{FUVAR_TIPUS_CIMKE[f.fuvarTipus]}</span>
      </span>
      <span className="text-muted-foreground">{r.hivatkozas}</span>
      {r.aru && <span className="text-muted-foreground">{r.aru}</span>}
      {r.dij && <span className="font-semibold">{r.dij}</span>}
    </div>
  );
}

const TH = "px-2.5 py-2 text-left " + CIMKE + " border-b-2 border-border bg-muted/40";
const TD = "px-2.5 py-2.5 align-top text-sm border-b border-border/60";

function AsztaliTablazat({ fuvarok, ctx }: { fuvarok: FuvarBlokk[]; ctx: TablaCtx }) {
  if (fuvarok.length === 0) return <p className="px-1 text-sm text-muted-foreground">Nincs megbízás ezen a napon.</p>;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Fuvar", "Megálló", "Város", "Állapot", "Érkezés", "Távozás", "Rakodás", "Sofőr jelzése"].map((c) => (
            <th key={c} className={TH}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fuvarok.map((f) =>
          f.megallok.map((b, i) => {
            const utolsoLerako = i === f.megallok.length - 1;
            const s = sorAdatok(b, f, { ...ctx, utolsoLerako });
            return (
              <tr key={`${b.fuvarId}-${b.megalloIndex}`}>
                {i === 0 && (
                  <td rowSpan={f.megallok.length} className={`${TD} w-56 border-r border-border/60`}>
                    <FuvarCella f={f} />
                  </td>
                )}
                <td className={TD}>{b.tipus === "felrako" ? "Felrakás" : "Lerakás"}</td>
                <td className={TD}>
                  <span className="font-semibold">{b.cim}</span>
                  {b.nyersCim && b.nyersCim !== b.cim && (
                    <div className="max-w-[16rem] truncate text-xs text-muted-foreground" title={b.nyersCim}>
                      {b.nyersCim}
                    </div>
                  )}
                </td>
                <td className={TD}>
                  <span className="flex items-center gap-1.5">
                    <AllapotJelveny a={s.allapot} />
                    <KeszGomb b={b} onKeszJelolve={ctx.onKeszJelolve} />
                  </span>
                </td>
                <td className={`${TD} whitespace-nowrap`} title={s.erkezesCim}>
                  {s.erkezes}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{s.tavozas}</td>
                <td className={TD}>{s.rakodas}</td>
                <td className={`${TD} text-xs`}>
                  {s.sofor.length === 0 && s.gondok.length === 0 ? (
                    "—"
                  ) : (
                    <>
                      {s.sofor.map((x, j) => (
                        <div key={j}>{x}</div>
                      ))}
                      <GondSorok gondok={s.gondok} />
                    </>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function MobilTablazat({ fuvarok, ctx }: { fuvarok: FuvarBlokk[]; ctx: TablaCtx }) {
  if (fuvarok.length === 0) return <p className="px-1 text-sm text-muted-foreground">Nincs megbízás ezen a napon.</p>;
  const MTD = "px-2 py-2 align-top text-sm";
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Megálló", "Érkezés", "Távozás"].map((c) => (
            <th key={c} className={`px-2 py-1.5 text-left ${CIMKE} border-b-2 border-border`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fuvarok.map((f) => (
          <FragmentSor key={f.fuvarId} f={f} ctx={ctx} mtd={MTD} />
        ))}
      </tbody>
    </table>
  );
}

function FragmentSor({ f, ctx, mtd }: { f: FuvarBlokk; ctx: TablaCtx; mtd: string }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="px-2 pb-1 pt-3 text-sm">
          <FuvarCella f={f} />
        </td>
      </tr>
      {f.megallok.map((b, i) => {
        const utolsoLerako = i === f.megallok.length - 1;
        const s = sorAdatok(b, f, { ...ctx, utolsoLerako });
        const vanReszlet = s.rakodas !== "—" || s.sofor.length > 0 || s.gondok.length > 0;
        return (
          <FragmentMegallo key={`${b.fuvarId}-${b.megalloIndex}`} b={b} s={s} mtd={mtd} vanReszlet={vanReszlet} onKeszJelolve={ctx.onKeszJelolve} />
        );
      })}
    </>
  );
}

function FragmentMegallo({
  b,
  s,
  mtd,
  vanReszlet,
  onKeszJelolve,
}: {
  b: MegalloBejegyzes;
  s: SorAdat;
  mtd: string;
  vanReszlet: boolean;
  onKeszJelolve: () => void;
}) {
  return (
    <>
      <tr>
        <td className={mtd}>
          <div className="text-[11px] text-muted-foreground">{b.tipus === "felrako" ? "Felrakás" : "Lerakás"}</div>
          <div className="font-semibold">{b.cim}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <AllapotJelveny a={s.allapot} />
            <KeszGomb b={b} onKeszJelolve={onKeszJelolve} />
          </div>
        </td>
        <td className={mtd} title={s.erkezesCim}>
          {s.erkezes}
        </td>
        <td className={mtd}>{s.tavozas}</td>
      </tr>
      <tr>
        <td colSpan={3} className={`px-2 pb-2.5 ${vanReszlet ? "" : "pb-0"} border-b border-border/60`}>
          {vanReszlet && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="flex flex-col gap-0.5">
                <span className={CIMKE}>Rakodás</span>
                <span className="text-sm">{s.rakodas}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className={CIMKE}>Sofőr jelzése</span>
                <span className="text-xs">
                  {s.sofor.length === 0 ? "—" : s.sofor.map((x, j) => <div key={j}>{x}</div>)}
                </span>
              </div>
              {s.gondok.length > 0 && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <span className={CIMKE}>Gond</span>
                  <span className="text-xs">
                    <GondSorok gondok={s.gondok} />
                  </span>
                </div>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fogyasztás és következő napok (a táblázat alatt, kompaktan)
// ---------------------------------------------------------------------------

function FogyasztasSor({ cimke, o, merve, gazolajAr }: { cimke: string; o: FogyasztasOsszeg; merve: boolean; gazolajAr: number }) {
  const atlag = merve && o.km > 0 ? (o.liter / o.km) * 100 : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">{cimke}</span>
      <span>{formatSzam(o.km)} km</span>
      {merve && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>{formatSzam(o.liter, 1)} l</span>
          <span className="text-muted-foreground">·</span>
          <span title="Átlagfogyasztás az időszakra">{atlag === null ? "–" : `${formatSzam(atlag, 1)} l/100 km`}</span>
          <span className="text-muted-foreground">·</span>
          <span title={`${formatSzam(gazolajAr)} Ft/l gázolajárral`}>{formatSzam(o.liter * gazolajAr)} Ft</span>
        </>
      )}
    </div>
  );
}

function FogyasztasDoboz({ f, napISO, maiNap, eredmeny }: { f: JarmuFogyasztas | undefined; napISO: string; maiNap: boolean; eredmeny: FogyasztasEredmeny | null }) {
  if (!eredmeny) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-2.5">
      <span className={`flex items-center gap-1 ${CIMKE}`} title={`Ecofleet útvonal-jelentés · ${eredmeny.gazolajCimke}`}>
        <Fuel className="h-3 w-3" />
        Fogyasztás
      </span>
      {eredmeny.hiba ? (
        <span className="text-xs text-destructive">{eredmeny.hiba}</span>
      ) : !f ? (
        <span className="text-xs text-muted-foreground">Nincs GPS-kapcsolat.</span>
      ) : (
        <>
          <FogyasztasSor cimke={maiNap ? "Ma" : formatNapRovid(napISO)} o={f.nap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          <FogyasztasSor cimke="7 nap" o={f.hetNap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          <FogyasztasSor cimke="14 nap" o={f.tizennegyNap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          {!f.merve && (
            <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title="A jelentésben minden útnál 0 liter áll — a nyomkövető nem olvassa a jármű üzemanyag-adatát.">
              <AlertTriangle className="h-3 w-3" />
              Nincs üzemanyag-mérés a nyomkövetőn.
            </span>
          )}
        </>
      )}
    </div>
  );
}

function KovetkezoNapokDoboz({ napok }: { napok: KovetkezoNap[] }) {
  const nemUresek = napok.filter((n) => n.megallok.length > 0);
  if (nemUresek.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-2.5">
      <span className={CIMKE}>Következő napok</span>
      {nemUresek.map((n) => (
        <div key={n.napISO} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">{formatNapRovid(n.napISO)}</span>
          {n.megallok.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 pl-2 text-xs">
              <span className="w-14 shrink-0 text-muted-foreground">{m.tipus === "felrako" ? "Felrakás" : "Lerakás"}</span>
              <span className="truncate">{m.cim}</span>
              <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${FUVAR_TIPUS_BADGE[m.fuvarTipus]}`}>
                {FUVAR_TIPUS_CIMKE[m.fuvarTipus]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Egy kocsi teljes szakasza (fejléc + sáv + táblázat + alsó dobozok)
// ---------------------------------------------------------------------------

function KocsiSzakasz({
  jarmu,
  eredmeny,
  maiNap,
  most,
  napISO,
  kovetkezoNapok,
  fogyasztas,
  onKeszJelolve,
  mobil,
}: {
  jarmu: Jarmu;
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
  most: number;
  napISO: string;
  kovetkezoNapok: KovetkezoNap[];
  fogyasztas: FogyasztasEredmeny | null;
  onKeszJelolve: () => void;
  mobil: boolean;
}) {
  const fuvarok = eredmeny?.fuvarok ?? [];
  const kovetkezo = kovetkezoMegallo(fuvarok);
  const ctx: TablaCtx = { maiNap, eloVan: !!eredmeny?.eloPozicio, kovetkezo, allValahol: allValahol(fuvarok), most, onKeszJelolve };
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <KocsiCim jarmu={jarmu} napiKm={eredmeny?.napiKm ?? null} />
      <HolVanMostSav jarmu={jarmu} eredmeny={eredmeny} maiNap={maiNap} most={most} kovetkezo={kovetkezo} mobil={mobil} />
      {mobil ? <MobilTablazat fuvarok={fuvarok} ctx={ctx} /> : <AsztaliTablazat fuvarok={fuvarok} ctx={ctx} />}
      <div className={`grid gap-3 ${mobil ? "grid-cols-1" : "grid-cols-2"}`}>
        {jarmu.ecofleetObjectId !== null && (
          <FogyasztasDoboz f={fogyasztas?.jarmuvek.find((x) => x.sofor === jarmu.sofor)} napISO={napISO} maiNap={maiNap} eredmeny={fogyasztas} />
        )}
        {maiNap && <KovetkezoNapokDoboz napok={kovetkezoNapok} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nap összképe
// ---------------------------------------------------------------------------

function OsszkepDoboz({ adatok, maiNap, most, mobil }: { adatok: JarmuIdovonalEredmeny[]; maiNap: boolean; most: number; mobil: boolean }) {
  const o = osszkep(adatok, maiNap, most);
  const { kesz, folyamatban, csuszik, nyitottGond, gpsNelkul, km } = o;
  const cellak: { cimke: string; ertek: string; szin?: string }[] = [
    { cimke: maiNap ? "Fuvar ma" : "Fuvar", ertek: String(o.fuvar) },
    { cimke: "Kész", ertek: String(kesz), szin: "text-green-700 dark:text-green-400" },
    { cimke: "Folyamatban", ertek: String(folyamatban), szin: "text-blue-700 dark:text-blue-400" },
    { cimke: "Csúszik", ertek: String(csuszik), szin: csuszik ? "text-amber-700 dark:text-amber-400" : undefined },
    { cimke: "Nyitott gond", ertek: String(nyitottGond), szin: nyitottGond ? "text-red-700 dark:text-red-400" : undefined },
    { cimke: "GPS nélkül", ertek: gpsNelkul.length ? `${gpsNelkul.length} kocsi (${gpsNelkul.join(", ")})` : "0", szin: gpsNelkul.length ? "text-amber-700 dark:text-amber-400" : undefined },
    { cimke: maiNap ? "Megtett km ma" : "Megtett km", ertek: formatSzam(km) },
  ];
  return (
    <div className={`grid gap-3 rounded-xl border bg-card p-3 ${mobil ? "grid-cols-4" : "grid-cols-7"}`}>
      {cellak.map((c) => (
        <div key={c.cimke} className="flex flex-col gap-0.5">
          <span className={CIMKE}>{c.cimke}</span>
          <span className={`text-lg font-bold ${c.szin ?? ""}`}>{c.ertek}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nincs kocsi hozzárendelve
// ---------------------------------------------------------------------------

function ElakadtakDoboz({ elakadtak }: { elakadtak: ElakadtFuvar[] }) {
  if (elakadtak.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Nincs kocsi hozzárendelve ({elakadtak.length})
      </span>
      <span className="text-xs text-amber-800 dark:text-amber-300/80">
        Ezek a fuvarok erre a napra be vannak ütemezve, de egyik kocsi táblázatában sem jelennek meg. Nyisd meg a megbízást, és állítsd be a
        „Kocsi” mezőt.
      </span>
      {elakadtak.map((f) => (
        <div key={f.fuvarId} className="flex flex-wrap items-center gap-1.5 pl-5 text-xs">
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${FUVAR_TIPUS_BADGE[f.fuvarTipus]}`}>
            {FUVAR_TIPUS_CIMKE[f.fuvarTipus]}
          </span>
          <span className="font-medium">{f.megrendelo ?? "Megbízó ismeretlen"}</span>
          {f.pozicioszam && <span className="text-muted-foreground">· {f.pozicioszam}</span>}
          <span className="text-muted-foreground">
            · {f.honnan ?? "?"} → {f.hova ?? "?"}
          </span>
          <span className="text-amber-800 dark:text-amber-300">
            · {f.ok === "nincs_kocsi" ? "nincs kitöltve a Kocsi/Sofőr mező" : `ismeretlen kocsi: „${f.jarmuSzoveg}”`}
          </span>
          {f.javasoltSofor && (
            <span className="rounded bg-amber-200/60 px-1 py-0.5 font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
              talán {f.javasoltSofor}? — elgépelés lehet
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telefon: kocsi-fülek + balra-jobbra lapozható lapok
// ---------------------------------------------------------------------------

function MobilLapozo({ children, aktiv, setAktiv }: { children: ReactNode[]; aktiv: number; setAktiv: (i: number) => void }) {
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
      <div className="flex border-b">
        {SAJAT_JARMUVEK.map((j, i) => (
          <button
            key={j.sofor}
            type="button"
            onClick={() => ugras(i)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm ${
              i === aktiv ? "border-b-2 border-foreground font-bold" : "text-muted-foreground"
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
        className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((gyerek, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {gyerek}
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">← húzd oldalra a másik kocsihoz →</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A lap
// ---------------------------------------------------------------------------

export function GpsStatus() {
  const maiNapISO = budapestNapISO();
  const [napISO, setNapISO] = useState(maiNapISO);
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [elakadtak, setElakadtak] = useState<ElakadtFuvar[]>([]);
  const [kovetkezoNapok, setKovetkezoNapok] = useState<Record<string, KovetkezoNap[]>>({});
  const [fogyasztas, setFogyasztas] = useState<FogyasztasEredmeny | null>(null);
  const [loading, setLoading] = useState(true);
  const [betoltve, setBetoltve] = useState(0);
  const [aktivKocsi, setAktivKocsi] = useState(0);
  const maiNap = napISO === maiNapISO;

  const load = useCallback(async (nap: string) => {
    // A fogyasztás külön, nem blokkolja a táblázatot (saját hibaüzenete van).
    getFogyasztas(nap).then(setFogyasztas);
    getKovetkezoNapokElonezet(3).then(setKovetkezoNapok);
    const res = await getIdovonalak(nap);
    setAdatok(res.jarmuvek);
    setElakadtak(res.elakadtak);
    setBetoltve(Date.now());
  }, []);

  useEffect(() => {
    setLoading(true);
    load(napISO).finally(() => setLoading(false));
    // A múltbeli (lezárt) napok adata nem változik — csak a mai napi nézetet frissítjük periodikusan.
    if (napISO !== budapestNapISO()) return;
    const interval = setInterval(() => load(napISO), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load, napISO]);

  const kocsik = (mobil: boolean) =>
    SAJAT_JARMUVEK.map((jarmu) => (
      <KocsiSzakasz
        key={jarmu.sofor}
        jarmu={jarmu}
        eredmeny={adatok.find((a) => a.sofor === jarmu.sofor)}
        maiNap={maiNap}
        most={betoltve}
        napISO={napISO}
        kovetkezoNapok={kovetkezoNapok[jarmu.sofor] ?? []}
        fogyasztas={fogyasztas}
        onKeszJelolve={() => load(napISO)}
        mobil={mobil}
      />
    ));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            {formatNapCim(napISO)}
            {maiNap && " (ma)"}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" title="Előző nap" onClick={() => setNapISO((n) => napEltolva(n, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="outline" title="Következő nap" disabled={maiNap} onClick={() => setNapISO((n) => napEltolva(n, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && adatok.length === 0 ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (
          <>
            {/* Asztal (lg-től): összkép + a három kocsi egymás alatt, nyolc oszlopos táblázattal. */}
            <div className="hidden flex-col gap-4 lg:flex">
              <OsszkepDoboz adatok={adatok} maiNap={maiNap} most={betoltve} mobil={false} />
              <ElakadtakDoboz elakadtak={elakadtak} />
              {kocsik(false)}
            </div>
            {/* Telefon (lg alatt): összkép, majd kocsi-fülek, balra-jobbra lapozható lapokkal. */}
            <div className="flex flex-col gap-4 lg:hidden">
              <OsszkepDoboz adatok={adatok} maiNap={maiNap} most={betoltve} mobil />
              <ElakadtakDoboz elakadtak={elakadtak} />
              <MobilLapozo aktiv={aktivKocsi} setAktiv={setAktivKocsi}>
                {kocsik(true)}
              </MobilLapozo>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
