"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { cn } from "@/lib/utils";
import {
  elutasitSzabadsagIgeny,
  getMunkasNapok,
  jovahagySzabadsagIgeny,
  rogzitSzabadsag,
  setSzabadsagKeret,
  torolSzabadsag,
} from "@/lib/jelenlet/actions";
import {
  igenyUtkozesei,
  keretJovahagyasUtan,
  ledolgozosSzombat,
  munkanap,
  munkanapok,
  munkaszunetiNap,
  rovidNevek,
  szabadsagRacs,
  szabadsagSzin,
  type SzabadsagIgeny,
  type SzabadsagMerleg,
  type SzabadsagTipus,
  type TavolletNap,
} from "@/lib/jelenlet/shared";

// Szabadság oldal — "4B, kompakt" elrendezés (Budaházi Zoltán választása,
// 2026-10-05): balra az éves létszám-hőtérkép (hány ember hiányzik naponta),
// jobbra egy panelben a keretek és az elkövetkező szabadságok, ahol a kérés
// helyben jóváhagyható. A rögzítés a hőtérkép alatt egy sorban.

const HO_ROVID = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

// A betegszabadság a dolgozó színét tartja (ki az), de fehér csíkozást kap
// (mi az) — azonos színnel a sima szabadságtól nem lehetett megkülönböztetni.
const BETEG_CSIKOS = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 6px)",
};

function budapestMa(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date());
}

function honapNapjai(ev: number, honap: number): number {
  return new Date(Date.UTC(ev, honap, 0)).getUTCDate();
}

function iso(ev: number, honap: number, nap: number): string {
  return `${ev}-${String(honap).padStart(2, "0")}-${String(nap).padStart(2, "0")}`;
}

function datumCimke(isoNap: string): string {
  const [, ho, nap] = isoNap.split("-").map(Number);
  return `${HO_ROVID[ho - 1]}. ${nap}.`;
}

function szakaszCimke(tol: string, ig: string): string {
  return tol === ig ? datumCimke(tol) : `${datumCimke(tol)} – ${datumCimke(ig)}`;
}

function napKulonbseg(tol: string, ig: string): number {
  return Math.round(
    (new Date(`${ig}T12:00:00Z`).getTime() - new Date(`${tol}T12:00:00Z`).getTime()) / 86_400_000
  );
}

function mikor(tol: string, ig: string, ma: string): string {
  if (ig < ma) return "lezajlott";
  if (tol <= ma) return tol === ig ? "ma" : "folyamatban";
  const n = napKulonbseg(ma, tol);
  return n === 1 ? "holnap" : `${n} nap múlva`;
}

/** Színes négyzet a dolgozó betűjelével. */
function Jel({
  szin,
  betu,
  beteg,
  halvany,
  nagy,
}: {
  szin: string;
  betu: string;
  beteg?: boolean;
  halvany?: boolean;
  nagy?: boolean;
}) {
  return (
    <span
      style={beteg ? BETEG_CSIKOS : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded font-extrabold text-white",
        nagy ? "h-[22px] min-w-[26px] px-1 text-[11px]" : "h-4 min-w-4 px-0.5 text-[9px]",
        szin,
        halvany && "opacity-50"
      )}
    >
      {beteg && "✚"}
      {betu}
    </span>
  );
}

type Nezet = {
  /** Dolgozó-sorrend: ez adja a színeket. */
  sorrend: string[];
  szin: Map<string, string>;
  betu: Map<string, string>;
  nev: Map<string, string>;
  merleg: Map<string, SzabadsagMerleg>;
};

/** Egy sor a közelgő-listában: egy igény, vagy kérés nélküli távollét-napok. */
type Tetel = {
  kulcs: string;
  employeeId: string;
  tol: string;
  ig: string;
  tipus: SzabadsagTipus;
  allapot: "kert" | "jovahagyva";
  /** Hiányzik, ha a napok a jelenléti naplóból jönnek (nincs mögöttük kérés). */
  igeny?: SzabadsagIgeny;
};

/**
 * A kérés nélküli távollét-napok (régi adat, nap-szerkesztő, telefonos
 * betegszabadság) szakaszokká fűzve: két nap egy szakasz, ha köztük csak
 * hétvége vagy ünnep van.
 */
function tavolletSzakaszok(tavolletek: TavolletNap[]): Tetel[] {
  const rendezett = [...tavolletek].sort((a, b) =>
    a.employee_id === b.employee_id
      ? a.work_date.localeCompare(b.work_date)
      : a.employee_id.localeCompare(b.employee_id)
  );
  const out: Tetel[] = [];
  for (const t of rendezett) {
    const elozo = out[out.length - 1];
    if (
      elozo &&
      elozo.employeeId === t.employee_id &&
      elozo.tipus === t.day_type &&
      munkanapok(elozo.ig, t.work_date).length <= 2
    ) {
      elozo.ig = t.work_date;
      continue;
    }
    out.push({
      kulcs: `t-${t.employee_id}-${t.work_date}`,
      employeeId: t.employee_id,
      tol: t.work_date,
      ig: t.work_date,
      tipus: t.day_type,
      allapot: "jovahagyva",
    });
  }
  return out;
}

export function SzabadsagView({
  ev,
  igenyek,
  merlegek,
  tavolletek,
}: {
  ev: number;
  igenyek: SzabadsagIgeny[];
  merlegek: SzabadsagMerleg[];
  tavolletek: TavolletNap[];
}) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [pending, startTransition] = useTransition();
  const [keretSzerk, setKeretSzerk] = useState<SzabadsagMerleg | null>(null);
  const [mindet, setMindet] = useState(false);
  const ma = budapestMa();

  const nezet: Nezet = useMemo(() => {
    const sorrend = merlegek.map((m) => m.employeeId);
    const nevek = rovidNevek(merlegek.map((m) => m.name));
    return {
      sorrend,
      szin: new Map(sorrend.map((id, i) => [id, szabadsagSzin(i)])),
      betu: new Map(sorrend.map((id, i) => [id, nevek[i].betu])),
      nev: new Map(merlegek.map((m) => [m.employeeId, m.name])),
      merleg: new Map(merlegek.map((m) => [m.employeeId, m])),
    };
  }, [merlegek]);

  const racs = useMemo(
    () => szabadsagRacs(igenyek, nezet.sorrend, tavolletek),
    [igenyek, nezet.sorrend, tavolletek]
  );

  const tetelek = useMemo(() => {
    const igenyTetelek: Tetel[] = igenyek
      .filter((i) => i.allapot === "kert" || i.allapot === "jovahagyva")
      .map((i) => ({
        kulcs: `i-${i.id}`,
        employeeId: i.employee_id,
        tol: i.tol,
        ig: i.ig,
        tipus: i.tipus,
        allapot: i.allapot as "kert" | "jovahagyva",
        igeny: i,
      }));
    return [...igenyTetelek, ...tavolletSzakaszok(tavolletek)].sort(
      (a, b) =>
        a.tol.localeCompare(b.tol) ||
        nezet.sorrend.indexOf(a.employeeId) - nezet.sorrend.indexOf(b.employeeId)
    );
  }, [igenyek, tavolletek, nezet.sorrend]);

  // Az idei évnél alapból csak ami még előttünk van (vagy döntésre vár); egy
  // korábbi év megnyitásakor nincs "közelgő", ott az egész év látszik.
  const csakKozelgo = !mindet && ev >= Number(ma.slice(0, 4));
  const lathato = csakKozelgo
    ? tetelek.filter((t) => t.ig >= ma || t.allapot === "kert")
    : tetelek;
  const varakozo = tetelek.filter((t) => t.allapot === "kert").length;

  function futtat(mit: () => Promise<void>, siker: string, utana?: () => void) {
    startTransition(async () => {
      try {
        await mit();
        router.refresh();
        toast.success(siker);
        utana?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* --- Balra: az éves hőtérkép és a rögzítés --- */}
      <div className="flex min-w-0 flex-[999_1_720px] flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Hány ember hiányzik naponta — {ev}</p>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={() => router.push(`?ev=${ev - 1}`)}>
              <ChevronLeft className="size-3" />
              {ev - 1}
            </Button>
            <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
              {ev}
            </span>
            <Button size="xs" variant="outline" onClick={() => router.push(`?ev=${ev + 1}`)}>
              {ev + 1}
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
        <Jelmagyarazat />
        <Hoterkep ev={ev} ma={ma} racs={racs} nezet={nezet} />
        {canEdit && (
          <RogzitoSor
            merlegek={merlegek}
            pending={pending}
            onRogzit={(adat, utana) =>
              futtat(() => rogzitSzabadsag(adat), "Szabadság rögzítve.", utana)
            }
          />
        )}
      </div>

      {/* --- Jobbra: keret és közelgő, helyben döntéssel --- */}
      <div className="flex min-w-0 flex-[1_1_340px] flex-col rounded-xl border bg-card p-4">
        <p className="pb-2.5 text-sm font-semibold">Keret és közelgő</p>
        <div className="flex flex-col gap-2 pb-3">
          {merlegek.map((m) => (
            <KeretSor
              key={m.employeeId}
              merleg={m}
              szin={nezet.szin.get(m.employeeId) ?? "bg-muted"}
              betu={nezet.betu.get(m.employeeId) ?? "?"}
              canEdit={canEdit}
              onKeret={() => setKeretSzerk(m)}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2.5">
          <span className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
            {csakKozelgo ? "Közelgő" : `Az év szabadságai`}
          </span>
          {varakozo > 0 && (
            <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">
              {varakozo} döntésre vár
            </span>
          )}
        </div>
        {lathato.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">
            {csakKozelgo ? "Nincs előttünk álló szabadság." : "Ebben az évben nincs szabadság."}
          </p>
        ) : (
          lathato.map((t) => (
            <KozelgoSor
              key={t.kulcs}
              tetel={t}
              ma={ma}
              mind={igenyek}
              nezet={nezet}
              canEdit={canEdit}
              pending={pending}
              onJovahagy={(id) =>
                futtat(() => jovahagySzabadsagIgeny(id), "Szabadság jóváhagyva.")
              }
              onElutasit={(id, oka) =>
                futtat(() => elutasitSzabadsagIgeny({ igenyId: id, oka }), "A kérés elutasítva.")
              }
              onVisszavon={(id) =>
                futtat(() => torolSzabadsag(id), "Visszavonva, a napok felszabadultak.")
              }
            />
          ))
        )}
        {ev >= Number(ma.slice(0, 4)) && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2.5 self-start"
            onClick={() => setMindet((v) => !v)}
          >
            {mindet ? "Csak a közelgők" : "Korábbiak megjelenítése"}
          </Button>
        )}
      </div>

      {keretSzerk && (
        <KeretDialog
          merleg={keretSzerk}
          pending={pending}
          onClose={() => setKeretSzerk(null)}
          onSave={(keret, fordulonap) => {
            // Csak sikeres mentés után zárul: hibánál a beírt érték megmarad.
            futtat(
              () => setSzabadsagKeret({ employeeId: keretSzerk.employeeId, keret, fordulonap }),
              "Keret mentve.",
              () => setKeretSzerk(null)
            );
          }}
        />
      )}
    </div>
  );
}

// --- Jelmagyarázat ---

function Jelmagyarazat() {
  const elem = (szin: string, szoveg: string, extra?: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-4 rounded-[2px]", szin, extra)} />
      {szoveg}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
      {elem("bg-secondary", "senki")}
      {elem("bg-blue-200", "1 fő")}
      {elem("bg-amber-500", "2 fő")}
      {elem("bg-red-600", "3+ fő")}
      {elem("bg-zinc-300 dark:bg-zinc-700", "hétvége / ünnep (Ü)")}
      {elem("bg-secondary", "ma", "ring-2 ring-blue-600 ring-inset")}
      <span className="inline-flex items-center gap-1.5">
        <span className="relative h-3 w-4 rounded-[2px] bg-blue-200">
          <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-foreground/70" />
        </span>
        van köztük döntésre váró kérés
      </span>
    </div>
  );
}

// --- Az éves hőtérkép: hónapok sorban, napok oszlopban, a szín a létszám ---

function Hoterkep({
  ev,
  ma,
  racs,
  nezet,
}: {
  ev: number;
  ma: string;
  racs: ReturnType<typeof szabadsagRacs>;
  nezet: Nezet;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[40px_repeat(31,minmax(0,1fr))] gap-[3px]">
        <span />
        {Array.from({ length: 31 }, (_, i) => (
          <span key={i} className="text-center text-[10px] text-muted-foreground">
            {i + 1}
          </span>
        ))}
        {Array.from({ length: 12 }, (_, h) => {
          const honap = h + 1;
          const napokSzama = honapNapjai(ev, honap);
          return (
            <div key={honap} className="contents">
              <span className="flex items-center text-[11px] font-bold text-muted-foreground">
                {HO_ROVID[h]}
              </span>
              {Array.from({ length: 31 }, (_, n) => {
                const nap = n + 1;
                if (nap > napokSzama) return <span key={nap} />;
                const napIso = iso(ev, honap, nap);
                const unnep = munkaszunetiNap(napIso);
                const szabadnap = !munkanap(napIso);
                // A hőtérkép csak munkanapon számol: hétvégén senki nem "hiányzik".
                const lista = szabadnap ? [] : (racs.get(napIso) ?? []);
                const db = lista.length;
                const kert = lista.some((b) => b.allapot === "kert");
                const cimke = [
                  napIso,
                  unnep ? `(${unnep})` : ledolgozosSzombat(napIso) ? "(ledolgozós szombat)" : "",
                  db > 0
                    ? `— ${lista
                        .map(
                          (b) =>
                            `${nezet.nev.get(b.employeeId) ?? "?"}${b.tipus === "beteg" ? " [beteg]" : ""}${
                              b.allapot === "kert" ? " (kért)" : ""
                            }`
                        )
                        .join(", ")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <span
                    key={nap}
                    title={cimke}
                    className={cn(
                      "relative flex h-8 items-center justify-center rounded-[4px] text-xs font-extrabold",
                      szabadnap
                        ? "bg-zinc-300 text-[9px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        : db === 0
                          ? "bg-secondary"
                          : db === 1
                            ? "bg-blue-200 text-blue-900"
                            : db === 2
                              ? "bg-amber-500 text-amber-950"
                              : "bg-red-600 text-white",
                      napIso === ma && "ring-2 ring-blue-600 ring-inset"
                    )}
                  >
                    {unnep ? "Ü" : db > 0 ? db : ""}
                    {kert && (
                      <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-foreground/70" />
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Keret egy sorban ---

function KeretSor({
  merleg,
  szin,
  betu,
  canEdit,
  onKeret,
}: {
  merleg: SzabadsagMerleg;
  szin: string;
  betu: string;
  canEdit: boolean;
  onKeret: () => void;
}) {
  const keret = merleg.keret;
  const szazalek = (n: number) => (keret && keret > 0 ? `${Math.min(100, (n / keret) * 100)}%` : "0%");
  const tullepve = merleg.maradek !== null && merleg.maradek < 0;

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <Jel szin={szin} betu={betu} />
      <span className="min-w-0 flex-1 truncate">{merleg.name}</span>
      {keret === null ? (
        canEdit ? (
          <Button size="xs" variant="outline" onClick={onKeret}>
            Keret beállítása
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">nincs keret</span>
        )
      ) : (
        <>
          <div
            className="flex h-1.5 w-[70px] overflow-hidden rounded-full bg-secondary"
            title={`kivéve ${merleg.kivett}, kért ${merleg.kert}`}
          >
            <span className="block bg-success" style={{ width: szazalek(merleg.kivett) }} />
            <span className="block bg-warning" style={{ width: szazalek(merleg.kert) }} />
          </div>
          <b
            className={cn("w-[54px] text-right", tullepve && "text-destructive")}
            title={tullepve ? "Túllépte a keretet" : `${keret} napos keretből`}
          >
            {merleg.maradek} / {keret}
          </b>
          {canEdit && (
            <button
              type="button"
              onClick={onKeret}
              aria-label={`${merleg.name} keretének beállítása`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// --- Egy sor a közelgő-listában ---

function KozelgoSor({
  tetel,
  ma,
  mind,
  nezet,
  canEdit,
  pending,
  onJovahagy,
  onElutasit,
  onVisszavon,
}: {
  tetel: Tetel;
  ma: string;
  mind: SzabadsagIgeny[];
  nezet: Nezet;
  canEdit: boolean;
  pending: boolean;
  onJovahagy: (id: string) => void;
  onElutasit: (id: string, oka: string | null) => void;
  onVisszavon: (id: string) => void;
}) {
  const nev = nezet.nev.get(tetel.employeeId) ?? tetel.igeny?.employee_name ?? "?";
  const napok = munkanapok(tetel.tol, tetel.ig).length;
  const igeny = tetel.igeny;
  const kert = tetel.allapot === "kert";

  const utkozesek = igeny ? igenyUtkozesei(igeny, mind) : [];
  const utana = igeny && kert ? keretJovahagyasUtan(nezet.merleg.get(tetel.employeeId), igeny) : null;
  // Csak a ténylegesen felülírt napok: hétvégi/ünnepi munkát a jóváhagyás nem bánt.
  const szakaszNapjai = new Set(munkanapok(tetel.tol, tetel.ig));
  const munkasNapok =
    igeny && kert ? igeny.munka_napok.filter((d) => szakaszNapjai.has(d)).sort() : [];

  return (
    <div className="flex gap-2.5 border-t py-2.5">
      <Jel
        szin={nezet.szin.get(tetel.employeeId) ?? "bg-muted"}
        betu={nezet.betu.get(tetel.employeeId) ?? "?"}
        beteg={tetel.tipus === "beteg"}
        halvany={kert}
        nagy
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold">{szakaszCimke(tetel.tol, tetel.ig)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{mikor(tetel.tol, tetel.ig, ma)}</span>
        </div>
        <p className="text-[13px] text-foreground/80">
          {nev} · {napok} munkanap
          {tetel.tipus === "beteg" && " · betegszabadság"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              kert
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                : igeny
                  ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200"
                  : "bg-secondary text-muted-foreground"
            )}
          >
            {kert ? "jóváhagyásra vár" : igeny ? "jóváhagyva" : "jelenléti naplóból"}
          </span>
          {utkozesek.length > 0 && (
            <span className="text-xs font-semibold text-destructive">
              ütközik: {utkozesek.map((u) => u.name).join(", ")}
            </span>
          )}
        </div>
        {kert && utana !== null && (
          <p className={cn("mt-1 text-xs", utana < 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {utana < 0
              ? `nincs rá elég keret — ${Math.abs(utana)} nappal több a maradéknál`
              : `jóváhagyás után marad: ${utana} nap`}
          </p>
        )}
        {munkasNapok.length > 0 && (
          <p className="mt-1 text-xs font-semibold text-destructive">
            <AlertTriangle className="mr-0.5 inline size-3 align-[-2px]" />
            {munkasNapok.length} napon már van munkaidő ({munkasNapok.map(datumCimke).join(", ")}) —
            jóváhagyáskor törlődik.
          </p>
        )}
        {igeny?.megjegyzes && (
          <p className="mt-0.5 text-xs text-muted-foreground italic">„{igeny.megjegyzes}”</p>
        )}
        {canEdit && igeny && kert && (
          <div className="mt-1.5 flex gap-1.5">
            <Button
              size="xs"
              disabled={pending}
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => {
                if (
                  munkasNapok.length > 0 &&
                  !window.confirm(
                    `${nev}: ${munkasNapok.length} napon már van rögzített munkaidő (${munkasNapok.map(datumCimke).join(", ")}).\n\nJóváhagyáskor ezek a munkaszakaszok törlődnek. Folytatod?`
                  )
                ) {
                  return;
                }
                onJovahagy(igeny.id);
              }}
            >
              <Check className="size-3" />
              Jóváhagyom
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              className="text-destructive"
              onClick={() => {
                const oka = window.prompt(
                  `Miért nem jó? (a dolgozó telefonján meg fog jelenni — üresen is elutasítható)\n\n${nev}: ${szakaszCimke(tetel.tol, tetel.ig)}`,
                  ""
                );
                // A Mégse null-t ad, az üres szöveg viszont vállalt döntés.
                if (oka === null) return;
                onElutasit(igeny.id, oka);
              }}
            >
              <X className="size-3" />
              Elutasítom
            </Button>
          </div>
        )}
        {canEdit && igeny && !kert && (
          <button
            type="button"
            disabled={pending}
            className="mt-1 text-[11px] font-semibold text-muted-foreground underline hover:text-foreground disabled:opacity-50"
            onClick={() => {
              if (
                !window.confirm(
                  `Visszavonod? ${nev}: ${szakaszCimke(tetel.tol, tetel.ig)}\n\nA napok törlődnek a jelenlétiből, és a keretbe visszakerülnek.`
                )
              ) {
                return;
              }
              onVisszavon(igeny.id);
            }}
          >
            Visszavonom
          </button>
        )}
      </div>
    </div>
  );
}

// --- Rögzítés bárkinek, egy sorban a hőtérkép alatt ---

function RogzitoSor({
  merlegek,
  pending,
  onRogzit,
}: {
  merlegek: SzabadsagMerleg[];
  pending: boolean;
  onRogzit: (
    adat: {
      employeeId: string;
      tol: string;
      ig: string;
      tipus: SzabadsagTipus;
      megjegyzes?: string | null;
    },
    utana: () => void
  ) => void;
}) {
  const [employeeId, setEmployeeId] = useState(merlegek[0]?.employeeId ?? "");
  const [tol, setTol] = useState("");
  const [ig, setIg] = useState("");
  const [tipus, setTipus] = useState<SzabadsagTipus>("szabadsag");
  const [megjegyzes, setMegjegyzes] = useState("");
  const [ellenoriz, setEllenoriz] = useState(false);

  const napok = tol && ig ? munkanapok(tol, ig).length : 0;

  async function rogzit() {
    // A rögzítés felülírja a már ledolgozott napokat — előtte rákérdezünk.
    setEllenoriz(true);
    let munkas: string[];
    try {
      munkas = await getMunkasNapok({ employeeId, tol, ig });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nem sikerült ellenőrizni.");
      return;
    } finally {
      setEllenoriz(false);
    }
    if (
      munkas.length > 0 &&
      !window.confirm(
        `${munkas.length} napon már van rögzített munkaidő (${munkas.map(datumCimke).join(", ")}).\n\nA rögzítéskor ezek a munkaszakaszok törlődnek. Folytatod?`
      )
    ) {
      return;
    }
    // A mezők csak sikeres mentés után ürülnek ki.
    onRogzit({ employeeId, tol, ig, tipus, megjegyzes: megjegyzes || null }, () => {
      setTol("");
      setIg("");
      setMegjegyzes("");
    });
  }

  const mezo = "h-8 rounded-lg border bg-card px-2 text-xs";

  return (
    <div className="flex flex-col gap-1.5 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold">Szabadság rögzítése:</span>
        <select
          aria-label="Dolgozó"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className={mezo}
        >
          {merlegek.map((m) => (
            <option key={m.employeeId} value={m.employeeId}>
              {m.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Ettől"
          value={tol}
          onChange={(e) => {
            setTol(e.target.value);
            // Egy napos szabadság a leggyakoribb: a "meddig" magától követi.
            if (!ig || ig < e.target.value) setIg(e.target.value);
          }}
          className="h-8 w-[140px]"
        />
        <Input
          type="date"
          aria-label="Eddig"
          value={ig}
          onChange={(e) => setIg(e.target.value)}
          className="h-8 w-[140px]"
        />
        <select
          aria-label="Típus"
          value={tipus}
          onChange={(e) => setTipus(e.target.value as SzabadsagTipus)}
          className={mezo}
        >
          <option value="szabadsag">Szabadság</option>
          <option value="beteg">Betegszabadság</option>
        </select>
        <Input
          aria-label="Megjegyzés"
          value={megjegyzes}
          onChange={(e) => setMegjegyzes(e.target.value)}
          placeholder="Megjegyzés (pl. telefonon kérte)"
          className="h-8 min-w-[150px] flex-1"
        />
        <Button
          size="sm"
          disabled={pending || ellenoriz || !tol || !ig || napok === 0}
          onClick={rogzit}
        >
          Rögzítem
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Amit te viszel fel, az azonnal jóváhagyott: rögtön fogyasztja a keretet, és a dolgozó
        telefonján is megjelenik.
        {tol && ig
          ? napok === 0
            ? " A megadott szakaszra egyetlen munkanap sem esik."
            : ` ${napok} munkanap, a hétvége és az ünnep nem számol.`
          : " A hétvége és az ünnep nem számol bele."}
      </p>
    </div>
  );
}

// --- Keret beállítása ---

function KeretDialog({
  merleg,
  pending,
  onClose,
  onSave,
}: {
  merleg: SzabadsagMerleg;
  pending: boolean;
  onClose: () => void;
  onSave: (keret: number | null, fordulonap: string | null) => void;
}) {
  const [nap, setNap] = useState(merleg.keret === null ? "" : String(merleg.keret));
  const [fordulonap, setFordulonap] = useState(merleg.fordulonap ?? "");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="jelenlet sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{merleg.name} — szabadságkeret</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Kivehető napok a fordulónapon</Label>
            <Input
              type="number"
              min={0}
              value={nap}
              onChange={(e) => setNap(e.target.value)}
              placeholder="pl. 15"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fordulónap</Label>
            <Input
              type="date"
              value={fordulonap}
              onChange={(e) => setFordulonap(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            A fordulónap a bérjegyzék dátuma: az ez UTÁN rögzített szabadság-napok fogyasztják a
            keretet. Év végén elég a két mezőt átírni, a számolás magától újraindul.
            {merleg.kivett > 0 && (
              <>
                {" "}
                Jelenleg <b>{merleg.kivett} nap</b> van rögzítve a mostani fordulónap után.
              </>
            )}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive"
            disabled={pending || merleg.keret === null}
            onClick={() => onSave(null, null)}
          >
            Keret törlése
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Mégse
            </Button>
            <Button
              disabled={pending || nap.trim() === "" || !fordulonap}
              onClick={() => onSave(Number(nap), fordulonap)}
            >
              Mentés
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
