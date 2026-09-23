"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Truck } from "lucide-react";
import { JARMU_SZIN_DOT_CLASS, SAJAT_JARMUVEK } from "@/lib/fuvarozas/vehicles";
import type { FuvarBlokk, JarmuIdovonalEredmeny, MegalloBejegyzes } from "@/lib/fuvarozas/actions";
import { varosNev } from "@/lib/fuvarozas/varos";
import type { JarmuFuvarCsoport } from "@/lib/attekintes/actions";
import {
  allValahol,
  allasokSzoveg,
  eloMozog,
  formatEltelt,
  formatIdo,
  formatSzam,
  formatOsszeg,
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

// Az Áttekintés mobil "Fuvar" füle. A lapozó ELSŐ lapja a Flotta
// ("műszerfal, megbízás-állással" — F10+ terv, Budaházi Zoltán 2026-09-23):
// a nap számai, kocsinként állapot-csík, sebesség, hely, a mostani megbízás
// díja és megállósávja egy mondattal, a 7 napos átlagfogyasztás. A kocsik
// lapjai a "Tükör" (Z8 terv): ugyanaz a menetjegy, amit a sofőr lát, a
// díjjal és a sofőr jelzéseivel (GPS-idővel mellette), alatta a következő
// megbízás és a kocsi részletei. A lapok között balra-jobbra húzással
// (scroll-snap) vagy a fülre koppintva lehet váltani. A megállók
// részletes táblázata ugyanabból a sorAdatok függvényből jön, mint a
// /fuvarozas GPS fülön, csak az Áttekintés saját (--at-*) színsémájával.

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

/** A megállók háromoszlopos táblázata — a csempe kinyitva ezt mutatja. */
// A `utolsoLerako` soronként dől el, ezért a csempe szintjén még nincs benne.
function MegalloTabla({ f, ctx }: { f: FuvarBlokk; ctx: Omit<Parameters<typeof sorAdatok>[2], "utolsoLerako"> }) {
  const r = fuvarReszletek(f);
  return (
    <>
    <div className="px-3 py-2 text-xs text-[var(--at-muted)]">
      {r.hivatkozas}
      {r.aru && ` · ${r.aru}`}
    </div>
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
    </>
  );
}

/**
 * Egy megbízás csempéje Budaházi Zoltán telefonján (2026-09-22): megbízó,
 * honnan hová CSAK VÁROS, a fuvardíj, és két jelölés — "Saját fuvar", és
 * hogy "Felpakolva"-e már. Ennyi kell a telefonon; a megállók pontos
 * idejét a csempét kinyitva adja.
 *
 * A "Saját fuvar" a `fuvarTipus === "ber"`-ből jön, és ez NEM elírás: a
 * `fuvar_megbizasok.tipus` elnevezése történelmi okokból fordított a
 * felülethez képest (tipus='ber' → "Saját fuvarok" fül). Lásd
 * lib/fuvarozas/megbizasok.ts getMaiValodiSajatFuvarok.
 */
function MegbizasCsempe({
  cimke,
  megrendelo,
  honnan,
  hova,
  dij,
  sajat,
  felpakolva,
  allapot,
  kiemelt,
  reszletek,
}: {
  cimke: string;
  megrendelo: string | null;
  honnan: string | null;
  hova: string | null;
  dij: string | null;
  sajat: boolean;
  felpakolva: boolean;
  allapot?: Allapot;
  kiemelt?: boolean;
  reszletek?: ReactNode;
}) {
  const [nyitva, setNyitva] = useState(false);
  const fej = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`${CIMKE} text-[10px]`}>{cimke}</span>
          {allapot && (
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${ALLAPOT_CLASS[allapot]}`}>
              {allapot}
            </span>
          )}
        </span>
        {dij && <span className="shrink-0 text-sm font-bold tabular-nums">{dij}</span>}
      </div>
      <span className="truncate text-sm font-semibold">
        {megrendelo ?? (sajat ? "Saját fuvar" : "Megbízás")}
      </span>
      {honnan && hova && (
        <span className="text-base font-bold leading-tight">
          {honnan} → {hova}
        </span>
      )}
      {(sajat || felpakolva) && (
        <span className="flex flex-wrap items-center gap-1.5">
          {sajat && (
            <span className="rounded-full bg-[var(--at-tile)] px-2 py-0.5 text-[11px] font-semibold">
              Saját fuvar
            </span>
          )}
          {felpakolva && (
            <span className="flex items-center gap-1 rounded-full bg-[var(--at-positive)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--at-positive)]">
              <Check className="h-3 w-3" />
              Felpakolva
            </span>
          )}
        </span>
      )}
    </>
  );

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl bg-[var(--at-card)] ${
        kiemelt ? "border-2 border-[var(--at-accent)]" : "border border-[var(--at-border)]"
      }`}
    >
      {reszletek ? (
        <button
          type="button"
          onClick={() => setNyitva((v) => !v)}
          className="flex items-start gap-2 px-3 py-2.5 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">{fej}</span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-[var(--at-muted)] transition-transform ${nyitva ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex flex-col gap-1 px-3 py-2.5">{fej}</div>
      )}
      {reszletek && nyitva && <div className="border-t border-[var(--at-border)]">{reszletek}</div>}
    </div>
  );
}

/** Egy fuvar honnan-hová városa — a megállók teljes címéből kivágva. */
function honnanHova(f: FuvarBlokk): { honnan: string | null; hova: string | null } {
  const fel = f.megallok.find((m) => m.tipus === "felrako");
  const le = [...f.megallok].reverse().find((m) => m.tipus === "lerako");
  return { honnan: fel ? varosNev(fel.cim) : null, hova: le ? varosNev(le.cim) : null };
}

/** Igaz, ha a fuvar minden felrakó megállóját elhagyta már a kocsi. */
function felpakoltE(f: FuvarBlokk): boolean {
  const felrakok = f.megallok.filter((m) => m.tipus === "felrako");
  return felrakok.length > 0 && felrakok.every((m) => m.elhagyva);
}

/** A jármű színe hexában — a JARMU_SZIN_DOT_CLASS (Tailwind 500-as árnyalat) megfelelője, a sávokhoz és karikákhoz. */
const JARMU_SZIN_HEX: Record<(typeof SAJAT_JARMUVEK)[number]["szin"], string> = {
  blue: "#3b82f6",
  yellow: "#eab308",
  green: "#22c55e",
};

/**
 * A kocsi AKTUÁLIS megbízása: amelyiknek egyik megállóján éppen áll (GPS)
 * vagy a sofőr jelezte, hogy megérkezett; ha ilyen nincs, az első még nem
 * kész fuvar. (A kovetkezoMegallo az éppen-itt megállót kihagyja, ezért
 * lerakás közben a KÖVETKEZŐ fuvart adná — itt épp a mostani kell.)
 */
function aktivFuvar(fuvarok: FuvarBlokk[]): FuvarBlokk | null {
  return (
    fuvarok.find((f) => f.megallok.some((m) => !m.elhagyva && (m.eppenItt || m.keziErkezes))) ??
    fuvarok.find((f) => !fuvarKesz(f)) ??
    null
  );
}

type MegalloAllas = "kesz" | "itt" | "kov" | "terv";

/** Megállónként: kész, itt áll most (GPS vagy a sofőr "Megérkeztem"-je), a soron következő, vagy későbbi terv. */
function megalloAllasok(f: FuvarBlokk): MegalloAllas[] {
  let kovMegvan = false;
  return f.megallok.map((m) => {
    if (m.elhagyva) return "kesz";
    if (!kovMegvan && (m.eppenItt || m.keziErkezes)) {
      kovMegvan = true;
      return "itt";
    }
    if (!kovMegvan) {
      kovMegvan = true;
      return "kov";
    }
    return "terv";
  });
}

function napSzo(napElteres: number): string | null {
  if (napElteres === 0) return null;
  if (napElteres === 1) return "holnap";
  if (napElteres === -1) return "tegnap";
  return napElteres > 0 ? `+${napElteres} nap` : `${napElteres} nap`;
}

/** A megálló alatti kis felirat: "✓ 08:05", "itt 09:38 óta", "~17:30 · holnap". */
function megalloIdoFelirat(m: MegalloBejegyzes, allas: MegalloAllas): string {
  const nap = napSzo(m.napElteres);
  if (allas === "kesz") {
    const ido = m.tenylegesTavozas ?? m.keszAt ?? m.idopont;
    return `✓ ${nap ? `${nap} ` : ""}${formatIdo(ido)}`;
  }
  if (allas === "itt") {
    return m.eppenItt ? `itt ${formatIdo(m.idopont)} óta` : `itt ${formatIdo(m.keziErkezes!)} (sofőr)`;
  }
  if (allas === "kov") {
    if (m.becslesElavult) return nap ?? "ma";
    return `~${formatIdo(m.idopont)}${nap ? ` · ${nap}` : ""}`;
  }
  return nap ?? "ma";
}

/** Egy mondat a megbízás állásáról: "Felpakolva · Miskolc következik · lerakás holnap". */
function allasMondat(f: FuvarBlokk, allasok: MegalloAllas[], most: number, pos: Pont | null = null): string {
  if (allasok.every((a) => a === "kesz")) return "Kész — minden megálló megvolt";
  const felrakok = f.megallok.map((m, i) => ({ m, i })).filter((x) => x.m.tipus === "felrako");
  const felpakolva = felrakok.length > 0 && felrakok.every((x) => allasok[x.i] === "kesz");
  const reszek: string[] = [felpakolva ? "Felpakolva" : "Még nincs felpakolva"];
  const itt = allasok.indexOf("itt");
  if (itt >= 0) {
    const m = f.megallok[itt];
    reszek.push(m.tipus === "felrako" ? "a felrakón" : "a lerakón");
    if (m.varakozasKezdete && !m.varakozasVege) reszek.push(`vár ${formatTartam(m.varakozasKezdete, most)}`);
  } else {
    const kov = allasok.indexOf("kov");
    if (kov >= 0) {
      const m = f.megallok[kov];
      const hatra = utkozbenHelye(f, allasok, pos)?.hatraKm ?? null;
      reszek.push(`${m.cim} következik${hatra !== null ? ` (~${hatra} km)` : ""}`);
      const nap = napSzo(m.napElteres);
      if (nap) reszek.push(`${m.tipus === "felrako" ? "felrakás" : "lerakás"} ${nap}`);
    }
  }
  if (f.fuvarlevelFotoDb > 0) reszek.push("fuvarlevél fotó ✓");
  return reszek.join(" · ");
}

type Pont = { lat: number; lon: number };

/** Légvonalbeli távolság km-ben (haversine). */
function tavKm(a: Pont, b: Pont): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Hol jár a kocsi két megálló között: az utolsó kész és a soron következő
 * megálló közti út aránya (0–1) a légvonalbeli távolságokból, és a
 * következő megállóig hátralévő km. Akkor is számol, ha a kocsi éppen áll
 * (pihenő) — Gergő Nagyfügednél pihenve a sávon Sárvár mellett "állt",
 * pedig az út nagyobb része megvolt (Budaházi Zoltán, 2026-09-23).
 * Null, ha a kocsi egy megállóban áll, még egyik megálló sincs kész, vagy
 * nincs friss pozíció.
 */
function utkozbenHelye(f: FuvarBlokk, allasok: MegalloAllas[], pos: Pont | null): { elozo: number; kov: number; arany: number; hatraKm: number | null } | null {
  if (!pos || allasok.includes("itt")) return null;
  const kov = allasok.indexOf("kov");
  if (kov <= 0) return null;
  const a = f.megallok[kov - 1];
  const b = f.megallok[kov];
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return { elozo: kov - 1, kov, arany: 0.5, hatraKm: null };
  const da = tavKm({ lat: a.lat, lon: a.lon }, pos);
  const db = tavKm(pos, { lat: b.lat, lon: b.lon });
  const arany = da + db > 0 ? da / (da + db) : 0.5;
  return { elozo: kov - 1, kov, arany: Math.min(Math.max(arany, 0.08), 0.92), hatraKm: Math.round(db) };
}

/**
 * A megbízás megállósávja (F10+ terv, Budaházi Zoltán 2026-09-23): ✓ kész,
 * ● itt áll most, ○ következő, ▶ a kocsi úton két megálló között.
 */
function AllasSav({ f, allasok, szin, mozog, pos }: { f: FuvarBlokk; allasok: MegalloAllas[]; szin: string; mozog: boolean; pos: Pont | null }) {
  const n = f.megallok.length;
  if (n === 0) return null;
  const poz = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const utolsoMegvolt = allasok.reduce((acc, a, i) => (a === "kesz" || a === "itt" ? i : acc), -1);
  const ut = utkozbenHelye(f, allasok, pos);
  // Pozíció nélkül (nincs nyomkövető / régi jel) menet közben félútra tesszük, állva nem mutatjuk.
  const kov = allasok.indexOf("kov");
  const kamion = ut
    ? poz(ut.elozo) + (poz(ut.kov) - poz(ut.elozo)) * ut.arany
    : mozog && !allasok.includes("itt") && kov > 0 && utolsoMegvolt >= 0
      ? (poz(utolsoMegvolt) + poz(kov)) / 2
      : null;
  const kitoltes = kamion ?? (utolsoMegvolt >= 0 ? poz(utolsoMegvolt) : 0);
  return (
    <div className="relative mx-[7px] mt-1.5 h-[46px]">
      <span className="absolute inset-x-0 top-[6px] h-[3px] bg-[var(--at-tile)]" />
      <span className="absolute left-0 top-[6px] h-[3px]" style={{ width: `${kitoltes}%`, background: szin }} />
      {f.megallok.map((m, i) => {
        const a = allasok[i];
        const elso = i === 0;
        const utolso = i === n - 1 && n > 1;
        return (
          <span key={m.megalloIndex}>
            <span
              className="absolute top-0 flex h-[14px] w-[14px] -translate-x-1/2 items-center justify-center rounded-full"
              style={{
                left: `${poz(i)}%`,
                background: a === "kesz" ? szin : "#fff",
                border: a === "itt" ? `4px solid ${szin}` : `2px solid ${a === "terv" ? "var(--at-border)" : szin}`,
                boxShadow: a === "itt" ? `0 0 0 3px ${szin}33` : undefined,
              }}
            >
              {a === "kesz" && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </span>
            <span
              className={`absolute top-[19px] whitespace-nowrap leading-tight ${
                elso ? "text-left" : utolso ? "-translate-x-full text-right" : "-translate-x-1/2 text-center"
              }`}
              style={{ left: `${poz(i)}%` }}
            >
              <span className={`block text-[11px] font-semibold ${a === "itt" || a === "kov" ? "" : "text-[var(--at-muted)]"}`}>
                {m.cim}
              </span>
              <span className="block text-[10px] text-[var(--at-muted)]">{megalloIdoFelirat(m, a)}</span>
            </span>
          </span>
        );
      })}
      {kamion !== null && (
        <span
          className="absolute -top-px -translate-x-1/2 rounded px-[3px] text-[9px] font-bold leading-4 text-white"
          style={{ left: `${kamion}%`, background: szin }}
          aria-label={mozog ? "a kocsi itt jár" : "a kocsi itt áll útközben"}
          title={mozog ? "Úton" : "Áll útközben"}
        >
          {mozog ? "▶" : "❚❚"}
        </span>
      )}
    </div>
  );
}

/** "660e" — a fej rövid összege; a pontos érték a title-ben. */
function rovidFt(osszeg: number): string {
  if (osszeg >= 1_000_000) return `${(osszeg / 1_000_000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })}M`;
  if (osszeg >= 1000) return `${Math.round(osszeg / 1000)}e`;
  return String(osszeg);
}

function fogyasztasFelirat(l100: number | null | undefined): string {
  return l100 == null ? "nincs mérés" : `${l100.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} l/100 km`;
}

/**
 * A lapozó ELSŐ lapja — "műszerfal, megbízás-állással" (F10+ terv, Budaházi
 * Zoltán 2026-09-23). Fent sötét sávban a nap négy száma (fuvar, km, mai
 * fuvardíj, a flotta 7 napos átlagfogyasztása). Alatta kocsinként: bal
 * szélen színes állapot-csík (áll / úton / nincs GPS), sebesség, hely,
 * a mostani megbízás megbízója és díja, a megbízás megállósávja egy
 * mondattal ("Felpakolva · Miskolc következik · lerakás holnap"), a nyitott
 * gond, és a kocsi 7 napos átlagfogyasztása. Alul a figyelmeztetések
 * (csúszás, gond, GPS nélküli kocsi) csak akkor, ha nem nullák.
 */
function OsszefoglaloLap({
  jarmuvek,
  most,
  fogyasztas,
  flottaFogyasztas,
  onValaszt,
}: {
  jarmuvek: JarmuIdovonalEredmeny[];
  most: number;
  fogyasztas: Record<string, number | null>;
  flottaFogyasztas: number | null;
  onValaszt: (jarmuIndex: number) => void;
}) {
  const o = osszkep(jarmuvek, true, most);
  const fuvarok = jarmuvek.flatMap((a) => a.fuvarok);
  const dijFt = fuvarok.reduce((s, f) => s + (f.fuvardijPenznem === "Ft" ? (f.fuvardij ?? 0) : 0), 0);
  const dijEur = fuvarok.reduce((s, f) => s + (f.fuvardijPenznem === "EUR" ? (f.fuvardij ?? 0) : 0), 0);
  const figyelmeztetesek = [
    o.csuszik > 0 ? { kulcs: "csuszik", szoveg: `Csúszik ${o.csuszik}`, piros: false } : null,
    o.nyitottGond > 0 ? { kulcs: "gond", szoveg: `Nyitott gond ${o.nyitottGond}`, piros: true } : null,
    o.gpsNelkul.length > 0
      ? { kulcs: "gps", szoveg: `GPS nélkül ${o.gpsNelkul.length} · ${o.gpsNelkul.join(", ")}`, piros: false }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2 rounded-xl bg-[var(--at-text)] px-3.5 py-3 text-[var(--at-card)]">
        {[
          { c: "Fuvar", v: String(o.fuvar), t: undefined },
          { c: "Km", v: formatSzam(o.km), t: undefined },
          {
            c: "Díj ma",
            v: rovidFt(dijFt) + (dijEur > 0 ? "+€" : ""),
            t: [formatOsszeg(dijFt, "Ft"), dijEur > 0 ? formatOsszeg(dijEur, "EUR") : null].filter(Boolean).join(" + "),
          },
          { c: "⌀ l/100", v: flottaFogyasztas == null ? "—" : flottaFogyasztas.toLocaleString("hu-HU", { maximumFractionDigits: 1 }), t: "A flotta 7 napos átlagfogyasztása (Ecofleet)" },
        ].map((x) => (
          <div key={x.c} className="flex flex-col gap-0.5" title={x.t}>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{x.c}</span>
            <span className="text-xl font-bold leading-none tabular-nums">{x.v}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--at-border)] bg-[var(--at-card)]">
        {SAJAT_JARMUVEK.map((j, i) => (
          <FlottaSor
            key={j.sofor}
            jarmu={j}
            eredmeny={jarmuvek.find((a) => a.sofor === j.sofor)}
            most={most}
            fogyasztas={fogyasztas[j.sofor] ?? null}
            onValaszt={() => onValaszt(i)}
          />
        ))}
      </div>

      {figyelmeztetesek.length > 0 && (
        <div className="flex flex-wrap gap-2">
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
  );
}

/** Egy kocsi sora a Flotta lapon (F10+). Koppintásra a lapozó a kocsi lapjára ugrik. */
function FlottaSor({
  jarmu,
  eredmeny,
  most,
  fogyasztas,
  onValaszt,
}: {
  jarmu: (typeof SAJAT_JARMUVEK)[number];
  eredmeny: JarmuIdovonalEredmeny | undefined;
  most: number;
  fogyasztas: number | null;
  onValaszt: () => void;
}) {
  const pos = eredmeny?.eloPozicio ?? null;
  const nincsNyomkoveto = jarmu.ecofleetObjectId === null;
  const regiJel = pos ? jelRegi(pos, most) : false;
  // Sebességet csak friss jelből: egy órája beragadt "78 km/h" rosszabb, mint a bevallott hiány.
  const sebesseg = !pos || nincsNyomkoveto || regiJel ? null : Math.round(pos.sebesseg);
  const szakasz = mostaniSzakaszKezdet(eredmeny);
  const allapot =
    sebesseg === null
      ? { szoveg: nincsNyomkoveto ? "Nincs GPS" : "Régi jel", szin: "var(--at-muted)" }
      : sebesseg > 3
        ? { szoveg: "Úton", szin: "var(--at-accent)" }
        : { szoveg: szakasz?.all ? `Áll ${formatIdo(szakasz.kezdet)} óta` : "Áll", szin: "#b45309" };
  const hely = nincsNyomkoveto
    ? "Nincs nyomkövető a kocsin"
    : !pos
      ? "Nincs GPS-jel"
      : regiJel
        ? `Régi jel · ${pos.cim ?? "ismeretlen hely"} · ${formatEltelt(new Date(pos.utolsoAdat), most)}`
        : (pos.cim ?? "ismeretlen hely");

  const f = aktivFuvar(eredmeny?.fuvarok ?? []);
  const allasok = f ? megalloAllasok(f) : [];
  const frissPont = pos && sebesseg !== null ? { lat: pos.lat, lon: pos.lon } : null;
  const nyitottGond = f?.gondok.filter((g) => g.nyitott).at(-1) ?? null;
  const szin = JARMU_SZIN_HEX[jarmu.szin];

  return (
    <button type="button" onClick={onValaszt} className="flex w-full border-b border-[var(--at-border)] text-left last:border-b-0">
      <span className="w-[5px] shrink-0" style={{ background: allapot.szin }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-2.5">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
          <span className="text-[15px] font-bold">{jarmu.sofor}</span>
          <span className="text-[11px] font-semibold" style={{ color: allapot.szin }}>
            {allapot.szoveg}
          </span>
          <span className="ml-auto flex items-baseline gap-1">
            <span className="text-lg font-bold leading-none tabular-nums">{sebesseg ?? "—"}</span>
            <span className="text-[11px] text-[var(--at-muted)]">km/h</span>
          </span>
        </span>
        <span className="truncate text-xs text-[var(--at-muted)]">{hely}</span>
        {f ? (
          <>
            <span className="flex items-baseline gap-2">
              <span className="truncate text-xs text-[var(--at-muted)]">
                {f.megrendelo ?? (f.fuvarTipus === "ber" ? "Saját fuvar" : "Megbízás")}
              </span>
              {f.fuvardij !== null && (
                <span className="ml-auto shrink-0 text-sm font-bold tabular-nums">{formatOsszeg(f.fuvardij, f.fuvardijPenznem)}</span>
              )}
            </span>
            <AllasSav f={f} allasok={allasok} szin={szin} mozog={sebesseg !== null && sebesseg > 3} pos={frissPont} />
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold">{allasMondat(f, allasok, most, frissPont)}</span>
              {nyitottGond && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                  Gond {formatIdo(nyitottGond.mikor)}
                </span>
              )}
            </span>
          </>
        ) : (
          <span className="text-xs text-[var(--at-muted)]">
            {(eredmeny?.fuvarok.length ?? 0) > 0 ? "Mai fuvarok kész." : "Mára nincs fuvar ezen a kocsin."}
          </span>
        )}
        <span className="text-right text-[11px] text-[var(--at-muted)]">⌀ {fogyasztasFelirat(fogyasztas)}</span>
      </span>
    </button>
  );
}

type Jelzes = { mikor: Date | null; forras: "sofor" | "gps"; szoveg: string; gpsIdo?: Date | null; piros?: boolean; nap?: string | null };

/**
 * A mostani megbízás eseményei időrendben: a sofőr jelzései (Megérkeztem,
 * Várakozom, Indulok, Gond van, fuvarlevél fotó), mellettük a GPS szerinti
 * idővel, ha a GPS is látta. Ahol a sofőr nem jelzett, a GPS eseménye áll.
 */
function megbizasJelzesei(f: FuvarBlokk): Jelzes[] {
  const lista: Jelzes[] = [];
  for (const m of f.megallok) {
    const nap = napSzo(m.napElteres);
    const gpsLatta = m.tenylegesTavozas !== null || m.eppenItt || m.keszForras === "gps";
    const gpsErkezes = gpsLatta ? m.idopont : null;
    if (m.keziErkezes) lista.push({ mikor: m.keziErkezes, forras: "sofor", szoveg: `Megérkeztem — ${m.cim}`, gpsIdo: gpsErkezes, nap });
    else if (gpsErkezes) lista.push({ mikor: gpsErkezes, forras: "gps", szoveg: `Beállt — ${m.cim}`, nap });
    if (m.varakozasKezdete) {
      const perc = m.varakozasVege ? Math.round((new Date(m.varakozasVege).getTime() - new Date(m.varakozasKezdete).getTime()) / 60000) : null;
      lista.push({ mikor: m.varakozasKezdete, forras: "sofor", szoveg: `Várakozom — ${m.cim}${perc !== null ? ` (${perc} perc)` : ""}`, nap });
    }
    if (m.keszForras === "kezi" && m.keszAt) lista.push({ mikor: m.keszAt, forras: "sofor", szoveg: `Indulok — ${m.cim}`, gpsIdo: m.tenylegesTavozas, nap });
    else if (m.tenylegesTavozas) lista.push({ mikor: m.tenylegesTavozas, forras: "gps", szoveg: `Elindult — ${m.cim}`, nap });
  }
  for (const g of f.gondok) lista.push({ mikor: g.mikor, forras: "sofor", szoveg: `Gond: „${g.szoveg}”${g.nyitott ? "" : " (lezárva)"}`, piros: g.nyitott });
  lista.sort((a, b) => new Date(a.mikor ?? 0).getTime() - new Date(b.mikor ?? 0).getTime());
  if (f.fuvarlevelFotoDb > 0)
    lista.push({ mikor: null, forras: "sofor", szoveg: f.fuvarlevelFotoDb === 1 ? "Fuvarlevél fotó feltöltve" : `Fuvarlevél fotó feltöltve (${f.fuvarlevelFotoDb})` });
  return lista;
}

function ForrasJel({ forras }: { forras: "sofor" | "gps" }) {
  return forras === "gps" ? (
    <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">GPS</span>
  ) : (
    <span className="shrink-0 rounded-full bg-[var(--at-positive)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--at-positive)]">Sofőr</span>
  );
}

/**
 * "Tükör" (Z8 terv, Budaházi Zoltán 2026-09-23): ugyanaz a menetjegy, amit
 * a sofőr a telefonján lát (components/erkezes/sofor-fuvar-nap.tsx), a díjjal
 * kiegészítve, alatta a sofőr jelzései a GPS-idővel. Így telefonon
 * ugyanarról a papírról beszéltek.
 */
function MegbizasTukor({
  f,
  sofor,
  mozog,
  pos,
  helyCim,
  ctx,
}: {
  f: FuvarBlokk;
  sofor: string;
  mozog: boolean;
  /** Friss GPS-pont (null, ha nincs nyomkövető vagy régi a jel). */
  pos: Pont | null;
  helyCim: string | null;
  ctx: Omit<Parameters<typeof sorAdatok>[2], "utolsoLerako">;
}) {
  const [tablaNyitva, setTablaNyitva] = useState(false);
  const allasok = megalloAllasok(f);
  const felrakoIdx = f.megallok.findIndex((m) => m.tipus === "felrako");
  const lerakoIdx = f.megallok.map((m) => m.tipus).lastIndexOf("lerako");
  const honnan = felrakoIdx >= 0 ? f.megallok[felrakoIdx] : null;
  const hova = lerakoIdx >= 0 ? f.megallok[lerakoIdx] : null;
  const utvonal = f.megallok.filter((m, i, t) => i === 0 || t[i - 1].cim !== m.cim);
  const jelzesek = megbizasJelzesei(f);
  const kov = allasok.indexOf("kov");
  const ut = utkozbenHelye(f, allasok, pos);
  const utonOda = (ut || (mozog && !allasok.includes("itt"))) && kov >= 0 ? f.megallok[kov] : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-[var(--at-accent)] bg-[var(--at-card)]">
      <div className="flex flex-col gap-2 px-3.5 pb-2.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold">{f.megrendelo ?? (f.fuvarTipus === "ber" ? "Saját fuvar" : "Megbízás")}</span>
          {f.fuvardij !== null && <span className="shrink-0 text-sm font-bold tabular-nums">{formatOsszeg(f.fuvardij, f.fuvardijPenznem)}</span>}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
          <div className="flex min-w-0 flex-col">
            <span className={CIMKE}>Honnan</span>
            <span className={`truncate text-xl font-bold leading-tight ${honnan && allasok[felrakoIdx] === "kesz" ? "text-[var(--at-muted)]" : ""}`}>
              {honnan?.cim ?? "—"}
            </span>
            {honnan && (
              <span className={`text-[11px] font-semibold ${allasok[felrakoIdx] === "kesz" ? "text-[var(--at-positive)]" : "text-[var(--at-muted)]"}`}>
                {allasok[felrakoIdx] === "kesz" ? `✓ indult ${napSzo(honnan.napElteres) ? `${napSzo(honnan.napElteres)} ` : ""}${formatIdo(honnan.tenylegesTavozas ?? honnan.keszAt ?? honnan.idopont)}` : megalloIdoFelirat(honnan, allasok[felrakoIdx])}
              </span>
            )}
          </div>
          <Truck className="mb-4 h-5 w-5 text-[var(--at-accent)]" />
          <div className="flex min-w-0 flex-col items-end text-right">
            <span className={CIMKE}>Hová</span>
            <span className="truncate text-xl font-bold leading-tight">{hova?.cim ?? "—"}</span>
            {hova && <span className="text-[11px] font-semibold text-amber-800">{megalloIdoFelirat(hova, allasok[lerakoIdx])}</span>}
          </div>
        </div>
        {utvonal.length > 2 && (
          <div className="flex flex-wrap items-center gap-x-1 text-xs">
            {utvonal.map((m, i) => {
              const a = allasok[f.megallok.indexOf(m)];
              return (
                <span key={m.megalloIndex} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[var(--at-muted)]">→</span>}
                  <span className={a === "kesz" ? "text-[var(--at-muted)]" : a === "itt" || a === "kov" ? "font-bold" : ""}>
                    {m.cim}
                    {a === "kesz" && " ✓"}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {(f.pozicioszam || f.referencia) && (
        <>
          <div className="mx-3 border-t-2 border-dashed border-[var(--at-border)]" />
          <div className="grid grid-cols-2 gap-2 px-3.5 py-2.5">
            {f.pozicioszam && (
              <div className="flex min-w-0 flex-col">
                <span className={CIMKE}>Pozíciószám</span>
                <span className="break-words font-mono text-sm font-bold">{f.pozicioszam}</span>
              </div>
            )}
            {f.referencia && (
              <div className="flex min-w-0 flex-col">
                <span className={CIMKE}>Referencia</span>
                <span className="break-words font-mono text-sm font-bold">{f.referencia}</span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5 border-t border-[var(--at-border)] bg-[var(--at-tile)]/40 px-3.5 py-2.5">
        <span className={CIMKE}>Amit {sofor} jelzett</span>
        {jelzesek.length === 0 && !utonOda && <span className="text-xs text-[var(--at-muted)]">Még nincs jelzés ehhez a megbízáshoz.</span>}
        {jelzesek.map((j, i) => (
          <span key={i} className={`flex items-start gap-1.5 text-xs ${j.piros ? "font-semibold text-red-800" : ""}`}>
            <ForrasJel forras={j.forras} />
            <span className="min-w-0">
              {j.szoveg}
              {j.mikor && <span className="tabular-nums"> {j.nap ? `${j.nap} ` : ""}{formatIdo(j.mikor)}</span>}
              {j.gpsIdo && <span className="tabular-nums text-[var(--at-muted)]"> · GPS {formatIdo(j.gpsIdo)}</span>}
            </span>
          </span>
        ))}
        {utonOda && (
          <span className="flex items-start gap-1.5 text-xs">
            <ForrasJel forras="gps" />
            <span>
              {mozog ? "Úton" : "Áll útközben"} · {utonOda.cim} felé {megalloIdoFelirat(utonOda, "kov")}
              {ut?.hatraKm != null && ` · még ~${ut.hatraKm} km légvonalban`}
              {!mozog && helyCim && <span className="text-[var(--at-muted)]"> · most: {helyCim}</span>}
            </span>
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setTablaNyitva((v) => !v)}
        className="flex items-center justify-between border-t border-[var(--at-border)] px-3.5 py-2.5 text-left text-xs font-medium text-[var(--at-muted)]"
      >
        Megállók részletesen
        <ChevronDown className={`h-4 w-4 transition-transform ${tablaNyitva ? "rotate-180" : ""}`} />
      </button>
      {tablaNyitva && (
        <div className="border-t border-[var(--at-border)]">
          <MegalloTabla f={f} ctx={ctx} />
        </div>
      )}
    </div>
  );
}

/**
 * Egy kocsi lapja (Z8 "Tükör" terv, Budaházi Zoltán 2026-09-23): fejléc a
 * sebességgel, a mostani megbízás menetjegye a sofőr jelzéseivel, alatta a
 * következő megbízás csempéje, legalul a kocsi részletei (hol van, motor,
 * km óra, utolsó jel, nem tervezett állások).
 */
function KocsiLap({ jarmu, eredmeny, csoport, most }: { jarmu: (typeof SAJAT_JARMUVEK)[number]; eredmeny: JarmuIdovonalEredmeny | undefined; csoport: JarmuFuvarCsoport | undefined; most: number }) {
  const fuvarok = eredmeny?.fuvarok ?? [];
  const kovetkezo = kovetkezoMegallo(fuvarok);
  const ctx = { maiNap: true, eloVan: !!eredmeny?.eloPozicio, kovetkezo, allValahol: allValahol(fuvarok), mozog: eloMozog(eredmeny), most };

  const aktiv = aktivFuvar(fuvarok);
  const aktivIndex = aktiv ? fuvarok.indexOf(aktiv) : -1;
  const maiKovetkezo = aktivIndex >= 0 ? (fuvarok[aktivIndex + 1] ?? null) : null;
  const jovobeli = maiKovetkezo ? null : ((csoport?.kovetkezok ?? [])[0] ?? null);

  const pos = eredmeny?.eloPozicio ?? null;
  const nincsNyomkoveto = jarmu.ecofleetObjectId === null;
  const sebesseg = !pos || nincsNyomkoveto || jelRegi(pos, most) ? null : Math.round(pos.sebesseg);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[jarmu.szin]}`} />
        <span className="text-base font-bold">{jarmu.sofor}</span>
        <span className="text-sm text-[var(--at-muted)]">{jarmu.label}</span>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${
            sebesseg === null
              ? "bg-[var(--at-tile)] text-[var(--at-muted)]"
              : sebesseg > 3
                ? "bg-[var(--at-positive)]/15 text-[var(--at-positive)]"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {sebesseg === null ? (nincsNyomkoveto ? "Nincs GPS" : "Nincs friss jel") : sebesseg > 3 ? `${sebesseg} km/h` : "Áll"}
        </span>
      </div>

      {aktiv ? (
        <MegbizasTukor
          f={aktiv}
          sofor={jarmu.sofor}
          mozog={sebesseg !== null && sebesseg > 3}
          pos={pos && sebesseg !== null ? { lat: pos.lat, lon: pos.lon } : null}
          helyCim={pos?.cim ?? null}
          ctx={ctx}
        />
      ) : (
        <div className="rounded-xl border border-[var(--at-border)] bg-[var(--at-card)] px-3 py-2">
          <p className="text-sm text-[var(--at-muted)]">{fuvarok.length > 0 ? "Mai fuvarok kész." : "Mára nincs fuvar ezen a kocsin."}</p>
        </div>
      )}

      {maiKovetkezo && (
        <MegbizasCsempe
          cimke="Ezután"
          megrendelo={maiKovetkezo.megrendelo}
          {...honnanHova(maiKovetkezo)}
          dij={fuvarReszletek(maiKovetkezo).dij}
          sajat={maiKovetkezo.fuvarTipus === "ber"}
          felpakolva={felpakoltE(maiKovetkezo)}
          allapot={fuvarAllapot(maiKovetkezo, kovetkezo, ctx.mozog)}
          reszletek={<MegalloTabla f={maiKovetkezo} ctx={ctx} />}
        />
      )}

      {jovobeli && (
        <MegbizasCsempe
          cimke={jovobeli.date}
          megrendelo={jovobeli.megrendelo}
          honnan={jovobeli.megallok.find((m) => m.tipus === "felrako")?.varos ?? null}
          hova={[...jovobeli.megallok].reverse().find((m) => m.tipus === "lerako")?.varos ?? null}
          dij={jovobeli.fuvardij !== null ? formatOsszeg(jovobeli.fuvardij, jovobeli.fuvardijPenznem) : null}
          sajat={jovobeli.cimke === "Saját"}
          felpakolva={false}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <span className={CIMKE}>A kocsi</span>
        <HolVanMost eredmeny={eredmeny} most={most} jarmuNincsGps={nincsNyomkoveto} />
      </div>
    </div>
  );
}

export function FuvarTablazatMobil({
  jarmuvek,
  csoportok,
  most,
  fogyasztas,
  flottaFogyasztas,
}: {
  jarmuvek: JarmuIdovonalEredmeny[];
  csoportok: JarmuFuvarCsoport[];
  most: number;
  /** Kocsinként (sofőr neve szerint) a 7 napos átlagfogyasztás, l/100 km; null, ha nincs mérés. */
  fogyasztas: Record<string, number | null>;
  flottaFogyasztas: number | null;
}) {
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
          <OsszefoglaloLap jarmuvek={jarmuvek} most={most} fogyasztas={fogyasztas} flottaFogyasztas={flottaFogyasztas} onValaszt={(i) => ugras(i + 1)} />
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
