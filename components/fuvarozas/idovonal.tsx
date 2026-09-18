"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Fuel, Truck } from "lucide-react";
import {
  getIdovonalak,
  getKovetkezoNapokElonezet,
  type ElakadtFuvar,
  type FuvarBlokk,
  type JarmuIdovonalEredmeny,
  type KovetkezoNap,
  type MegalloBejegyzes,
} from "@/lib/fuvarozas/actions";
import { setMegalloKesz } from "@/lib/fuvarozas/megbizasok";
import { getFogyasztas, type FogyasztasEredmeny, type FogyasztasOsszeg, type JarmuFogyasztas } from "@/lib/fuvarozas/fogyasztas";
import { SAJAT_JARMUVEK, JARMU_SZIN_DOT_CLASS, type JarmuSzin } from "@/lib/fuvarozas/vehicles";
import type { FuvarTipus } from "@/lib/fuvarozas/fuvar-constants";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";

// Egy csempe = egy saját jármű: fent egy kompakt, a jármű színével
// kiemelt infó-doboz (jelenlegi hely, sebesség, utolsó adat, óraállás),
// alatta az aznapi (Bér fuvarok ÉS Saját fuvarok fülről egyaránt) tervezett
// fel-/lerakó pontok listája, csak városnévvel, időrendben — a jármű
// színével kiemelt kamion-ikon jelzi, hol tart most a listában (a
// legutóbb elhagyott pont alatt, a következő fölött), mellette a
// következő pontra becsült élő érkezés. A következő naptári napra csúszott
// pontok külön kis csemp[é]n jelennek meg alul.

const SZIN_DOBOZ: Record<JarmuSzin, string> = {
  blue: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40",
  yellow: "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40",
  green: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
};

const SZIN_KAMION: Record<JarmuSzin, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  yellow: "text-yellow-700 dark:text-yellow-500",
  green: "text-green-700 dark:text-green-500",
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

function formatIdo(d: Date): string {
  return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

/** Ennél régebbi élő GPS-adatnál figyelmeztetünk: a pozíció nem "most", a készülék kieshetett. */
const REGI_JEL_PERC = 30;

function formatEltelt(d: Date, most: number): string {
  const perc = Math.round((most - d.getTime()) / 60000);
  if (perc < 60) return `${perc} perce`;
  const ora = Math.floor(perc / 60);
  return `${ora} óra ${perc - ora * 60} perce`;
}

/**
 * Idő a nap jelölésével, ha a pont nem a megjelenített napra esik: "tegnap
 * 07:10", "holnap 08:00", távolabb "szept. 14., 08:00". A többnapos fuvar
 * tegnapi felrakója / holnapi lerakója így a saját blokkjában marad, és
 * látszik, melyik napról van szó.
 */
function formatIdoNapJelolessel(d: Date, napElteres: number): string {
  if (napElteres === 0) return formatIdo(d);
  if (napElteres === -1) return `tegnap ${formatIdo(d)}`;
  if (napElteres === 1) return `holnap ${formatIdo(d)}`;
  return `${d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" })}, ${formatIdo(d)}`;
}

/** Egy "YYYY-MM-DD" naptári naphoz `delta` nappal odébbi nap — dél (UTC) horgonnyal, hogy DST-váltás körül se csúszhasson el. */
function napEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatNapCim(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" });
}

function formatNapRovid(napISO: string): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return d.toLocaleDateString("hu-HU", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function JarmuInfoDoboz({
  jarmu,
  eredmeny,
  maiNap,
  most,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
  /** Az adatok betöltésének pillanata (ms) — ehhez mérjük, mennyire régi az élő jel (a renderben nem hívunk Date.now()-t). */
  most: number;
}) {
  const pos = eredmeny?.eloPozicio;
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${SZIN_DOBOZ[jarmu.szin]}`}>
      <div className="flex items-center gap-1.5 font-medium">
        <span className={`h-2 w-2 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        {jarmu.sofor} <span className="font-normal text-muted-foreground">{jarmu.label}</span>
      </div>
      {!maiNap ? (
        <span className="text-muted-foreground">Élő pozíció csak a mai napon.</span>
      ) : jarmu.ecofleetObjectId === null ? (
        <span className="text-muted-foreground">Nincs GPS-kapcsolat.</span>
      ) : eredmeny?.hiba ? (
        <span className="text-destructive">{eredmeny.hiba}</span>
      ) : pos ? (
        <>
          <span>{pos.cim ?? "ismeretlen hely"}</span>
          <span className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span>{pos.sebesseg} km/h</span>
            <span>·</span>
            {/* Régi adatnál a puszta óra:perc frissnek látszana — kiírjuk, mióta nincs jel. */}
            {most - pos.utolsoAdat.getTime() > REGI_JEL_PERC * 60000 ? (
              <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400" title="Az Ecofleet utolsó adata ennyi ideje érkezett — a pozíció nem feltétlenül a mostani.">
                <AlertTriangle className="h-3 w-3" />
                utolsó jel {formatEltelt(pos.utolsoAdat, most)} ({formatIdo(pos.utolsoAdat)})
              </span>
            ) : (
              <span>{formatIdo(pos.utolsoAdat)}</span>
            )}
            {pos.oraallasKm !== null && (
              <>
                <span>·</span>
                <span>{pos.oraallasKm.toLocaleString("hu-HU")} km</span>
              </>
            )}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">Nincs élő pozíció.</span>
      )}
    </div>
  );
}

function formatSzam(n: number, tizedes = 0): string {
  return n.toLocaleString("hu-HU", { minimumFractionDigits: tizedes, maximumFractionDigits: tizedes });
}

function FogyasztasSor({ cimke, o, merve, gazolajAr }: { cimke: string; o: FogyasztasOsszeg; merve: boolean; gazolajAr: number }) {
  const atlag = merve && o.km > 0 ? (o.liter / o.km) * 100 : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
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

/**
 * Üzemanyag-fogyasztás a kiválasztott napra és az azzal záruló 7/14 napra
 * (Ecofleet Útvonal jelentés). Ha a nyomkövető nem ad üzemanyag-adatot,
 * csak a km látszik, és jelezzük, hogy nincs mérés.
 */
function FogyasztasDoboz({ f, napISO, maiNap, eredmeny }: { f: JarmuFogyasztas | undefined; napISO: string; maiNap: boolean; eredmeny: FogyasztasEredmeny | null }) {
  if (!eredmeny) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-2">
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground" title={`Ecofleet útvonal-jelentés · ${eredmeny.gazolajCimke}`}>
        <Fuel className="h-3 w-3" />
        Fogyasztás
      </span>
      {eredmeny.hiba ? (
        <span className="text-[11px] text-destructive">{eredmeny.hiba}</span>
      ) : !f ? (
        <span className="text-[11px] text-muted-foreground">Nincs GPS-kapcsolat.</span>
      ) : (
        <>
          <FogyasztasSor cimke={maiNap ? "Ma" : formatNapRovid(napISO)} o={f.nap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          <FogyasztasSor cimke="7 nap" o={f.hetNap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          <FogyasztasSor cimke="14 nap" o={f.tizennegyNap} merve={f.merve} gazolajAr={eredmeny.gazolajAr} />
          {!f.merve && (
            <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400" title="A jelentésben minden útnál 0 liter áll — a nyomkövető nem olvassa a jármű üzemanyag-adatát.">
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
    <div className="flex flex-col gap-1.5 rounded-lg border p-2">
      <span className="text-[10px] font-medium text-muted-foreground">Következő napok</span>
      {nemUresek.map((n) => (
        <div key={n.napISO} className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium">{formatNapRovid(n.napISO)}</span>
          {n.megallok.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 pl-2 text-[11px]">
              <span className="w-9 shrink-0 text-muted-foreground">{m.tipus === "felrako" ? "Fel:" : "Le:"}</span>
              <span className="truncate">{m.cim}</span>
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${FUVAR_TIPUS_BADGE[m.fuvarTipus]}`}>
                {FUVAR_TIPUS_CIMKE[m.fuvarTipus]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function KamionSor({
  jarmu,
  eta,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eta: { erkezes: Date; bizonytalan: boolean };
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] font-medium">
      <Truck className={`h-3.5 w-3.5 shrink-0 ${SZIN_KAMION[jarmu.szin]}`} />
      {/* Bizonytalan becslésnél szándékosan NEM írunk ki órát: a régi
          változat ilyenkor a megbízás statikus menetrendjét mutatta, ami
          gyakran több órával korábbi időpont volt, mint a jelen pillanat. */}
      {eta.bizonytalan ? (
        <span className="text-muted-foreground" title="Nem sikerült élő útvonalat számolni ehhez a ponthoz — ellenőrizd a megbízáson a címet.">
          Érkezés: nem becsülhető
        </span>
      ) : (
        <span className={SZIN_KAMION[jarmu.szin]}>Becsült érkezés: {formatIdo(eta.erkezes)}</span>
      )}
    </div>
  );
}

function MegalloSor({
  b,
  aktiv,
  mutasdTeljesCimet,
  onKeszJelolve,
}: {
  b: MegalloBejegyzes;
  /** Igaz, ha ez a fuvar van éppen folyamatban (a kamion-ikon a hozzá tartozó ponthoz áll legközelebb). */
  aktiv: boolean;
  /** Igaz, ha ezen a listán több megálló is ugyanabban a városban van — ilyenkor a puszta városnév nem különbözteti meg őket, ezért a teljes cím is kiírjuk. */
  mutasdTeljesCimet?: boolean;
  onKeszJelolve: () => void;
}) {
  const [folyamatban, setFolyamatban] = useState(false);

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

  const keszCim = b.elhagyva
    ? b.keszForras === "kezi"
      ? `Készre jelölve kézzel${b.keszBy ? ` (${b.keszBy})` : ""}`
      : "Kész — a GPS szerint a jármű itt járt és továbbment"
    : "Kattintás: a megálló megjelölése készre";

  return (
    <div
      className={`flex flex-col gap-0.5 rounded px-1.5 py-1 text-[11px] ${
        b.elhagyva ? "bg-success/10" : b.eppenItt ? "bg-primary/15" : aktiv ? "bg-primary/10" : ""
      } ${b.napElteres < 0 ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="w-9 shrink-0 text-muted-foreground">{b.tipus === "felrako" ? "Fel:" : "Le:"}</span>
          <span className="truncate font-medium">{b.cim}</span>
          {b.eppenItt ? (
            <span className="flex shrink-0 items-center gap-1 rounded bg-primary/25 px-1 py-0.5 text-[9px] font-medium text-primary">
              <Truck className="h-2.5 w-2.5" />
              Itt van most
            </span>
          ) : (
            aktiv &&
            !b.elhagyva && (
              <span className="shrink-0 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-medium text-primary">Folyamatban</span>
            )
          )}
          {b.varakozasKezdete && (
            <span
              className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              title={
                b.varakozasVege
                  ? `A sofőr várakozást jelölt: ${formatIdo(b.varakozasKezdete)}–${formatIdo(b.varakozasVege)}`
                  : `A sofőr várakozást jelölt ${formatIdo(b.varakozasKezdete)} óta — még tart`
              }
            >
              {b.varakozasVege
                ? `várakozás ${Math.round((new Date(b.varakozasVege).getTime() - new Date(b.varakozasKezdete).getTime()) / 60000)} perc`
                : `várakozik ${formatIdo(b.varakozasKezdete)} óta`}
            </span>
          )}
          {/* Már érintett pontnál a GPS szerinti tényleges megérkezés idejét mutatjuk, nem a becslést.
              Elavult (már elmúlt) statikus becslésnél nem írunk ki órát — az félrevezető lenne. */}
          {b.becslesElavult ? (
            <span className="shrink-0 italic text-muted-foreground" title="A megbízás tervezett időpontja elmúlt, és nem sikerült élő becslést számolni (nem geokódolható cím vagy hálózati hiba) — ellenőrizd a megbízáson a címet.">
              nincs friss becslés
            </span>
          ) : (
            <span
              className="shrink-0 text-muted-foreground"
              title={
                b.elhagyva || b.eppenItt
                  ? b.keszForras === "kezi" && !b.eppenItt
                    ? "Kézi jelölés — a mutatott idő a tervezett/GPS szerinti időpont"
                    : b.bizonytalanFelismeres
                      ? "A GPS szerint a jármű a város közelében állt meg — a megbízáson csak a város szerepel, ezért ez nem biztos, hogy EZ a rakodás volt."
                      : "Tényleges érkezés (GPS)"
                  : "Becsült érkezés"
              }
            >
              {b.elhagyva || b.eppenItt ? (b.bizonytalanFelismeres ? "?" : "") : "~"}
              {formatIdoNapJelolessel(b.idopont, b.napElteres)}
            </span>
          )}
        </span>
        {b.tipus === "lerako" && (
          <button
            type="button"
            disabled={folyamatban || b.elhagyva}
            onClick={handleKesz}
            title={keszCim}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              b.elhagyva
                ? "border-success bg-success text-success-foreground"
                : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success disabled:cursor-wait"
            }`}
          >
            <Check className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      {/* Ha két megálló ugyanabba a városba esik, a puszta városnév alapján
          duplikátumnak látszanának — a teljes cím különbözteti meg őket. */}
      {mutasdTeljesCimet && b.nyersCim && b.nyersCim !== b.cim && (
        <span className="truncate pl-11 text-[10px] text-muted-foreground/80" title={b.nyersCim}>
          {b.nyersCim}
        </span>
      )}
    </div>
  );
}

function FuvarBlokkFejlec({ f, aktiv }: { f: FuvarBlokk; aktiv: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 pt-1 text-[11px]">
      <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${FUVAR_TIPUS_BADGE[f.fuvarTipus]}`}>
        {FUVAR_TIPUS_CIMKE[f.fuvarTipus]}
      </span>
      <span className="truncate font-medium">{f.megrendelo ?? "Megbízó ismeretlen"}</span>
      {f.pozicioszam && <span className="shrink-0 text-muted-foreground">· {f.pozicioszam}</span>}
      {f.csuszo && (
        <span
          className="shrink-0 rounded bg-amber-200/70 px-1 py-0.5 text-[9px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
          title="A lerakás tervezett napja elmúlt, a fuvar még nincs készre jelölve — a kocsi még viszi."
        >
          Csúszik (korábbról)
        </span>
      )}
      {aktiv && <span className="shrink-0 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-medium text-primary">Folyamatban</span>}
    </div>
  );
}

function JarmuCsempe({
  jarmu,
  eredmeny,
  maiNap,
  most,
  napISO,
  kovetkezoNapok,
  fogyasztas,
  onKeszJelolve,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  maiNap: boolean;
  most: number;
  napISO: string;
  kovetkezoNapok: KovetkezoNap[];
  fogyasztas: FogyasztasEredmeny | null;
  onKeszJelolve: () => void;
}) {
  const fuvarok = eredmeny?.fuvarok ?? [];
  const eloEta = eredmeny?.eloEta;
  // A fuvarok blokkonként, útvonal-sorrendben (Fel, majd Le) — a kamion-ikon
  // (becsült érkezéssel) a blokkok sorrendjében az első olyan pont elé
  // kerül, ahol a jármű MÉG NEM járt; ha éppen egy megállónál áll, az a
  // pont már mögötte van.
  const osszesPont = fuvarok.flatMap((f) => f.megallok);
  const kovetkezo = osszesPont.find((b) => !b.elhagyva && !b.eppenItt) ?? null;
  // "Folyamatban": ahol a kamion most áll, egyébként amelyik fuvarhoz a következő pont tartozik.
  const aktivFuvarId = osszesPont.find((b) => b.eppenItt)?.fuvarId ?? kovetkezo?.fuvarId ?? null;

  // Azok a városok, amik a listán többször is szerepelnek — ott a puszta
  // városnév alapján két külön rakodóhely duplikált sornak látszana, ezért
  // náluk a teljes címet is kiírjuk.
  const tobbszorosVarosok = new Set(osszesPont.map((b) => b.cim).filter((cim, i, t) => t.indexOf(cim) !== i));

  const kamionIde = (b: MegalloBejegyzes) =>
    maiNap && eloEta && kovetkezo && b.fuvarId === kovetkezo.fuvarId && b.megalloIndex === kovetkezo.megalloIndex;

  return (
    <div className="flex flex-col gap-3">
      <JarmuInfoDoboz jarmu={jarmu} eredmeny={eredmeny} maiNap={maiNap} most={most} />

      {fuvarok.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nincs megbízás ezen a napon.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fuvarok.map((f) => (
            <div key={f.fuvarId} className={`flex flex-col gap-0.5 rounded-lg border ${f.fuvarId === aktivFuvarId && maiNap ? "border-primary/40" : "border-border/60"}`}>
              <FuvarBlokkFejlec f={f} aktiv={maiNap && f.fuvarId === aktivFuvarId} />
              {f.megallok.map((b) => (
                <div key={`${b.fuvarId}-${b.megalloIndex}`}>
                  {kamionIde(b) && <KamionSor jarmu={jarmu} eta={eloEta!} />}
                  <MegalloSor
                    b={b}
                    aktiv={maiNap && b.fuvarId === aktivFuvarId}
                    mutasdTeljesCimet={tobbszorosVarosok.has(b.cim)}
                    onKeszJelolve={onKeszJelolve}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {jarmu.ecofleetObjectId !== null && (
        <FogyasztasDoboz f={fogyasztas?.jarmuvek.find((x) => x.sofor === jarmu.sofor)} napISO={napISO} maiNap={maiNap} eredmeny={fogyasztas} />
      )}
      {maiNap && <KovetkezoNapokDoboz napok={kovetkezoNapok} />}
    </div>
  );
}

/**
 * Azok a fuvarok, amiket egyik saját kocsihoz sem sikerült hozzárendelni.
 * Korábban ezek némán eltűntek a GPS idővonalról — most látszanak, hogy ki
 * lehessen javítani a megbízáson a Kocsi mezőt.
 */
function ElakadtakDoboz({ elakadtak }: { elakadtak: ElakadtFuvar[] }) {
  if (elakadtak.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Nincs kocsi hozzárendelve ({elakadtak.length})
      </span>
      <span className="text-[11px] text-amber-800 dark:text-amber-300/80">
        Ezek a fuvarok erre a napra be vannak ütemezve, de egyik kocsi idővonalán sem jelennek meg. Nyisd meg a megbízást, és állítsd
        be a „Kocsi” mezőt.
      </span>
      {elakadtak.map((f) => (
        <div key={f.fuvarId} className="flex flex-wrap items-center gap-1.5 pl-5 text-[11px]">
          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${FUVAR_TIPUS_BADGE[f.fuvarTipus]}`}>
            {FUVAR_TIPUS_CIMKE[f.fuvarTipus]}
          </span>
          <span className="font-medium">{f.megrendelo ?? "Megbízó ismeretlen"}</span>
          {f.pozicioszam && <span className="text-muted-foreground">· {f.pozicioszam}</span>}
          <span className="text-muted-foreground">
            · {f.honnan ?? "?"} → {f.hova ?? "?"}
          </span>
          <span className="text-amber-800 dark:text-amber-300">
            ·{" "}
            {f.ok === "nincs_kocsi"
              ? "nincs kitöltve a Kocsi/Sofőr mező"
              : `ismeretlen kocsi: „${f.jarmuSzoveg}”`}
          </span>
          {/* Elgépelt rendszámnál megmondjuk, mire gondolhatott a kitöltő —
              de a hozzárendelést nem végezzük el magunktól, mert egy téves
              találat a fuvart rossz kocsi idővonalára tenné. */}
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

export function GpsStatus() {
  const maiNapISO = budapestNapISO();
  const [napISO, setNapISO] = useState(maiNapISO);
  const [adatok, setAdatok] = useState<JarmuIdovonalEredmeny[]>([]);
  const [elakadtak, setElakadtak] = useState<ElakadtFuvar[]>([]);
  const [kovetkezoNapok, setKovetkezoNapok] = useState<Record<string, KovetkezoNap[]>>({});
  const [fogyasztas, setFogyasztas] = useState<FogyasztasEredmeny | null>(null);
  const [loading, setLoading] = useState(true);
  const [betoltve, setBetoltve] = useState(0);
  const maiNap = napISO === maiNapISO;

  const load = useCallback(async (nap: string) => {
    // A fogyasztás külön, nem blokkolja az idővonalat (saját hibaüzenete van).
    getFogyasztas(nap).then(setFogyasztas);
    // A "Következő napok" doboz is minden frissítéssel újratöltődik — eddig
    // csak egyszer, a lap megnyitásakor kérdeztük le, így egy közben a
    // Megbízásokon javított felrakó/lerakó vagy kocsi itt a régi maradt,
    // amíg az egész lapot újra nem töltötték.
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            Járművek — {formatNapCim(napISO)}
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
            <ElakadtakDoboz elakadtak={elakadtak} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {SAJAT_JARMUVEK.map((jarmu) => (
              <JarmuCsempe
                key={jarmu.sofor}
                jarmu={jarmu}
                eredmeny={adatok.find((a) => a.sofor === jarmu.sofor)}
                maiNap={maiNap}
                most={betoltve}
                napISO={napISO}
                kovetkezoNapok={kovetkezoNapok[jarmu.sofor] ?? []}
                fogyasztas={fogyasztas}
                onKeszJelolve={() => load(napISO)}
              />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
