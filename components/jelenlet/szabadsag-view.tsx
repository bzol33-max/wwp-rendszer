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
  hetvege,
  igenyUtkozesei,
  keretJovahagyasUtan,
  ledolgozosSzombat,
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

const HO_ROVID = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

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

/** Színes négyzet a dolgozó betűjelével — a jelmagyarázathoz és a listákhoz. */
function Jel({ szin, betu }: { szin: string; betu: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-0.5 text-[9px] font-extrabold text-white",
        szin
      )}
    >
      {betu}
    </span>
  );
}

type Nezet = {
  /** Dolgozó-sorrend: ez adja a színeket és a cellák csíksorrendjét. */
  sorrend: string[];
  szin: Map<string, string>;
  rovid: Map<string, string>;
  betu: Map<string, string>;
  merleg: Map<string, SzabadsagMerleg>;
};

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

  const nezet: Nezet = useMemo(() => {
    const sorrend = merlegek.map((m) => m.employeeId);
    const nevek = rovidNevek(merlegek.map((m) => m.name));
    return {
      sorrend,
      szin: new Map(sorrend.map((id, i) => [id, szabadsagSzin(i)])),
      rovid: new Map(sorrend.map((id, i) => [id, nevek[i].rovid])),
      betu: new Map(sorrend.map((id, i) => [id, nevek[i].betu])),
      merleg: new Map(merlegek.map((m) => [m.employeeId, m])),
    };
  }, [merlegek]);

  const racs = useMemo(
    () => szabadsagRacs(igenyek, nezet.sorrend, tavolletek),
    [igenyek, nezet.sorrend, tavolletek]
  );
  const varakozo = useMemo(() => igenyek.filter((i) => i.allapot === "kert"), [igenyek]);
  const jovahagyott = useMemo(
    () => igenyek.filter((i) => i.allapot === "jovahagyva"),
    [igenyek]
  );

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
    <div className="flex flex-col gap-4">
      {/* --- Fent: kinek mennyi kerete van és mennyit használt --- */}
      <div className="flex flex-wrap gap-2">
        {merlegek.map((m) => (
          <MerlegKartya
            key={m.employeeId}
            merleg={m}
            szin={nezet.szin.get(m.employeeId) ?? "bg-muted"}
            betu={nezet.betu.get(m.employeeId) ?? "?"}
            canEdit={canEdit}
            onKeret={() => setKeretSzerk(m)}
          />
        ))}
      </div>

      {/* --- Középen: az éves rács --- */}
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Szabadságok — {ev}</p>
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
        <EvesRacs ev={ev} racs={racs} nezet={nezet} />
        <Jelmagyarazat nezet={nezet} merlegek={merlegek} />
      </div>

      {/* --- Alul: balra a jóváhagyás, jobbra a rögzítés --- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <span className="text-sm font-semibold">Jóváhagyásra vár</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                varakozo.length > 0
                  ? "bg-warning text-warning-foreground"
                  : "border bg-card text-muted-foreground"
              )}
            >
              {varakozo.length}
            </span>
          </div>
          {varakozo.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Nincs elbírálásra váró kérés.
            </p>
          ) : (
            varakozo.map((i) => (
              <KerelemSor
                key={i.id}
                igeny={i}
                mind={igenyek}
                nezet={nezet}
                canEdit={canEdit}
                pending={pending}
                onJovahagy={() =>
                  futtat(() => jovahagySzabadsagIgeny(i.id), "Szabadság jóváhagyva.")
                }
                onElutasit={(oka) =>
                  futtat(
                    () => elutasitSzabadsagIgeny({ igenyId: i.id, oka }),
                    "A kérés elutasítva."
                  )
                }
              />
            ))
          )}
        </div>

        <RogzitoDoboz
          merlegek={merlegek}
          canEdit={canEdit}
          pending={pending}
          onRogzit={(adat, utana) =>
            futtat(() => rogzitSzabadsag(adat), "Szabadság rögzítve.", utana)
          }
        />
      </div>

      {/* Jóváhagyott szakaszok — egy elkattintott jóváhagyás vagy egy elírt
          dátum csak itt vonható vissza, és a napok is visszakerülnek. */}
      {jovahagyott.length > 0 && (
        <details className="overflow-hidden rounded-xl border bg-card">
          <summary className="cursor-pointer border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
            Jóváhagyott szakaszok ({jovahagyott.length})
          </summary>
          {jovahagyott.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0"
            >
              <Jel szin={nezet.szin.get(i.employee_id) ?? "bg-muted"} betu={nezet.betu.get(i.employee_id) ?? "?"} />
              <span className="flex-1">
                <b>{szakaszCimke(i.tol, i.ig)}</b> · {i.employee_name} ·{" "}
                {munkanapok(i.tol, i.ig).length} munkanap
                {i.tipus === "beteg" && " · betegszabadság"}
                {i.dontes_by && (
                  <span className="text-muted-foreground"> · {i.dontes_by}</span>
                )}
              </span>
              {canEdit && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Visszavonod? ${i.employee_name}: ${szakaszCimke(i.tol, i.ig)}\n\nA napok törlődnek a jelenlétiből, és a keretbe visszakerülnek.`
                      )
                    ) {
                      return;
                    }
                    futtat(() => torolSzabadsag(i.id), "Visszavonva, a napok felszabadultak.");
                  }}
                >
                  Visszavonom
                </Button>
              )}
            </div>
          ))}
        </details>
      )}

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

// --- Fejléc-kártya egy dolgozóról ---

function MerlegKartya({
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
  // A sáv három szakasza: ami elment, ami jóváhagyásra vár, és ami szabad.
  const szazalek = (n: number) => (keret && keret > 0 ? `${Math.min(100, (n / keret) * 100)}%` : "0%");
  const szabad = keret === null ? 0 : Math.max(0, keret - merleg.kivett - merleg.kert);

  return (
    <div className="min-w-[164px] flex-1 rounded-xl border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Jel szin={szin} betu={betu} />
        <span className="truncate">{merleg.name}</span>
        {canEdit && (
          <button
            type="button"
            onClick={onKeret}
            title="Keret beállítása"
            className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" />
          </button>
        )}
      </div>

      {keret === null ? (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">Keret nincs beállítva.</p>
          {canEdit && (
            <Button size="xs" variant="outline" className="mt-1" onClick={onKeret}>
              Beállítom
            </Button>
          )}
        </>
      ) : (
        <>
          {merleg.maradek !== null && merleg.maradek < 0 ? (
            <p className="text-xl leading-tight font-extrabold text-destructive">
              {Math.abs(merleg.maradek)}
              <span className="ml-1 text-[11px] font-semibold">nappal túllépve</span>
            </p>
          ) : (
            <p className="text-xl leading-tight font-extrabold">
              {merleg.maradek}
              <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                nap maradt
              </span>
            </p>
          )}
          <div className="my-1 flex h-1.5 overflow-hidden rounded-full bg-secondary">
            <span className="block bg-success" style={{ width: szazalek(merleg.kivett) }} />
            <span className="block bg-warning" style={{ width: szazalek(merleg.kert) }} />
            <span className="block bg-border" style={{ width: szazalek(szabad) }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            keret {keret} · <b className="text-foreground">kivéve {merleg.kivett}</b>
            {merleg.kert > 0 && <b className="text-warning"> · kért {merleg.kert}</b>}
          </p>
        </>
      )}
    </div>
  );
}

// --- Az éves rács: hónapok sorban, napok oszlopban, osztott cellával ---

function EvesRacs({
  ev,
  racs,
  nezet,
}: {
  ev: number;
  racs: ReturnType<typeof szabadsagRacs>;
  nezet: Nezet;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[34px_repeat(31,minmax(0,1fr))] gap-[2px]">
          <span />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="text-center text-[7.5px] text-muted-foreground">
              {i + 1}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[34px_repeat(31,minmax(0,1fr))] gap-[2px]">
          {Array.from({ length: 12 }, (_, h) => {
            const honap = h + 1;
            const napokSzama = honapNapjai(ev, honap);
            return (
              <div key={honap} className="contents">
                <span className="flex items-center text-[10px] font-bold text-muted-foreground">
                  {HO_ROVID[h]}
                </span>
                {Array.from({ length: 31 }, (_, n) => {
                  const nap = n + 1;
                  if (nap > napokSzama) {
                    return <span key={nap} className="h-8 rounded-[3px]" />;
                  }
                  const napIso = iso(ev, honap, nap);
                  const lista = racs.get(napIso) ?? [];
                  const tobben = lista.length >= 2;
                  const unnep = munkaszunetiNap(napIso);
                  const hetvegi = hetvege(napIso);
                  const ledolgozos = ledolgozosSzombat(napIso);
                  const napCimke = unnep
                    ? `${napIso} (${unnep})`
                    : ledolgozos
                      ? `${napIso} (ledolgozós szombat)`
                      : napIso;
                  // Üres cellába kiírjuk, miért nem munkanap — a szürke
                  // árnyalat önmagában alig vált el a hétköznaptól.
                  const jelzes = unnep
                    ? "ünnep"
                    : ledolgozos
                      ? "Szo ✱"
                      : hetvegi
                        ? new Date(`${napIso}T12:00:00Z`).getUTCDay() === 6
                          ? "Szo"
                          : "V"
                        : null;
                  const cimke =
                    lista.length === 0
                      ? napCimke
                      : `${napCimke} — ${lista
                          .map(
                            (b) =>
                              `${nezet.merleg.get(b.employeeId)?.name ?? "?"}${
                                b.allapot === "kert" ? " (kért)" : ""
                              }${b.tipus === "beteg" ? " [beteg]" : ""}`
                          )
                          .join(", ")}`;
                  return (
                    <span
                      key={nap}
                      title={cimke}
                      className={cn(
                        "relative flex h-8 flex-col gap-px overflow-hidden rounded-[3px] p-px",
                        unnep
                          ? "bg-orange-200 dark:bg-orange-900/50"
                          : hetvegi && !ledolgozos
                            ? "bg-zinc-300 dark:bg-zinc-700"
                            : "bg-secondary",
                        ledolgozos && "ring-1 ring-zinc-400 ring-inset",
                        tobben && "ring-2 ring-destructive ring-inset"
                      )}
                    >
                      {lista.length === 0 && jelzes && (
                        <span
                          className={cn(
                            "m-auto text-[7.5px] leading-none font-semibold",
                            unnep
                              ? "text-orange-800 dark:text-orange-200"
                              : "text-zinc-600 dark:text-zinc-300"
                          )}
                        >
                          {jelzes}
                        </span>
                      )}
                      {/* Négy fő fölött a betűjel sem fér ki — ott a sarokba
                          kerül a létszám, és csak a színek beszélnek. */}
                      {lista.length >= 3 && (
                        <b className="absolute top-0 right-0 z-10 rounded-bl-[3px] bg-card px-px text-[7.5px] leading-[8px] font-black text-destructive">
                          {lista.length}
                        </b>
                      )}
                      {lista.map((b, idx) => (
                        <i
                          key={`${b.employeeId}-${idx}`}
                          className={cn(
                            "flex min-h-[3px] w-full flex-1 items-center justify-center overflow-hidden rounded-[2px] text-[8px] leading-none font-extrabold text-white not-italic",
                            nezet.szin.get(b.employeeId) ?? "bg-muted",
                            // A még jóvá nem hagyott kérés halvány, és sötét
                            // szegélyt kap, hogy ne lehessen összekeverni a
                            // kész döntéssel.
                            b.allapot === "kert" && "opacity-55 ring-1 ring-foreground/30 ring-inset"
                          )}
                        >
                          {lista.length === 1
                            ? nezet.rovid.get(b.employeeId)
                            : lista.length <= 3
                              ? nezet.betu.get(b.employeeId)
                              : ""}
                        </i>
                      ))}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Jelmagyarazat({ nezet, merlegek }: { nezet: Nezet; merlegek: SzabadsagMerleg[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-success" />
        jóváhagyott
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-success opacity-55 ring-1 ring-foreground/30 ring-inset" />
        kért, még nincs döntés
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-secondary ring-2 ring-destructive ring-inset" />
        többen egyszerre
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-zinc-300 dark:bg-zinc-700" />
        hétvége (nem fogyaszt)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-orange-200 dark:bg-orange-900/50" />
        ünnep, pihenőnap (nem fogyaszt)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[2px] bg-secondary ring-1 ring-zinc-400 ring-inset" />
        ledolgozós szombat (fogyaszt)
      </span>
      {merlegek.map((m) => (
        <span key={m.employeeId} className="inline-flex items-center gap-1.5">
          <Jel szin={nezet.szin.get(m.employeeId) ?? "bg-muted"} betu={nezet.betu.get(m.employeeId) ?? "?"} />
          {m.name}
        </span>
      ))}
    </div>
  );
}

// --- Egy jóváhagyásra váró kérés ---

function KerelemSor({
  igeny,
  mind,
  nezet,
  canEdit,
  pending,
  onJovahagy,
  onElutasit,
}: {
  igeny: SzabadsagIgeny;
  mind: SzabadsagIgeny[];
  nezet: Nezet;
  canEdit: boolean;
  pending: boolean;
  onJovahagy: () => void;
  onElutasit: (oka: string | null) => void;
}) {
  const napok = munkanapok(igeny.tol, igeny.ig).length;
  const utkozesek = igenyUtkozesei(igeny, mind);
  const merleg = nezet.merleg.get(igeny.employee_id);
  const utana = keretJovahagyasUtan(merleg, igeny);
  const tulnyul = utana !== null && utana < 0;
  // Csak a ténylegesen felülírt napok: hétvégi/ünnepi munkát a jóváhagyás nem bánt.
  const szakaszNapjai = new Set(munkanapok(igeny.tol, igeny.ig));
  const munkasNapok = igeny.munka_napok.filter((d) => szakaszNapjai.has(d)).sort();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0",
        (utkozesek.length > 0 || tulnyul || munkasNapok.length > 0) && "bg-destructive/5"
      )}
    >
      <Jel szin={nezet.szin.get(igeny.employee_id) ?? "bg-muted"} betu={nezet.betu.get(igeny.employee_id) ?? "?"} />
      <div className="min-w-[220px] flex-1">
        <p>
          <b>{szakaszCimke(igeny.tol, igeny.ig)}</b> · {igeny.employee_name}
          <span className="text-muted-foreground">
            {" "}· {napok} munkanap · beadva {igeny.bekuldve}
          </span>
        </p>
        <p className="text-[11px]">
          {utana === null ? (
            <span className="text-muted-foreground">nincs beállított keret</span>
          ) : tulnyul ? (
            <b className="text-destructive">
              nincs rá elég keret — {Math.abs(utana)} nappal több a maradéknál
            </b>
          ) : (
            <span className="text-muted-foreground">
              jóváhagyás után marad: <b className="text-foreground">{utana} nap</b>
            </span>
          )}
          {" — "}
          {utkozesek.length === 0 ? (
            <span className="text-success">nincs ütközés</span>
          ) : (
            <b className="text-destructive">
              <AlertTriangle className="mr-0.5 inline size-3 align-[-2px]" />
              ütközik: {utkozesek.map((u) => `${u.name} (${u.napok.length} nap)`).join(", ")}
            </b>
          )}
        </p>
        {munkasNapok.length > 0 && (
          <p className="text-[11px] font-semibold text-destructive">
            <AlertTriangle className="mr-0.5 inline size-3 align-[-2px]" />
            {munkasNapok.length} napon már van rögzített munkaidő (
            {munkasNapok.map(datumCimke).join(", ")}) — jóváhagyáskor törlődik.
          </p>
        )}
        {igeny.megjegyzes && (
          <p className="text-[11px] text-muted-foreground italic">„{igeny.megjegyzes}”</p>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="xs"
            disabled={pending}
            onClick={() => {
              if (
                munkasNapok.length > 0 &&
                !window.confirm(
                  `${igeny.employee_name}: ${munkasNapok.length} napon már van rögzített munkaidő (${munkasNapok.map(datumCimke).join(", ")}).\n\nJóváhagyáskor ezek a munkaszakaszok törlődnek. Folytatod?`
                )
              ) {
                return;
              }
              onJovahagy();
            }}
            className="bg-success text-success-foreground hover:bg-success/90"
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
                `Miért nem jó? (a dolgozó telefonján meg fog jelenni — üresen is elutasítható)\n\n${igeny.employee_name}: ${szakaszCimke(igeny.tol, igeny.ig)}`,
                ""
              );
              // A Mégse null-t ad, az üres szöveg viszont vállalt döntés.
              if (oka === null) return;
              onElutasit(oka);
            }}
          >
            <X className="size-3" />
            Elutasítom
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Rögzítés bárkinek ---

function RogzitoDoboz({
  merlegek,
  canEdit,
  pending,
  onRogzit,
}: {
  merlegek: SzabadsagMerleg[];
  canEdit: boolean;
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

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">Szabadság rögzítése — bárkinek</span>
      </div>
      <div className="flex flex-wrap items-end gap-2 px-3 py-2.5">
        <div className="flex min-w-[150px] flex-1 flex-col gap-1">
          <Label className="text-[10px] tracking-wide uppercase">Dolgozó</Label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-8 rounded-lg border bg-card px-2 text-xs"
          >
            {merlegek.map((m) => (
              <option key={m.employeeId} value={m.employeeId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] tracking-wide uppercase">Ettől</Label>
          <Input
            type="date"
            value={tol}
            onChange={(e) => {
              setTol(e.target.value);
              // Egy napos szabadság a leggyakoribb: a "meddig" magától követi.
              if (!ig || ig < e.target.value) setIg(e.target.value);
            }}
            className="h-8 w-[140px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] tracking-wide uppercase">Eddig</Label>
          <Input
            type="date"
            value={ig}
            onChange={(e) => setIg(e.target.value)}
            className="h-8 w-[140px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] tracking-wide uppercase">Típus</Label>
          <select
            value={tipus}
            onChange={(e) => setTipus(e.target.value as SzabadsagTipus)}
            className="h-8 rounded-lg border bg-card px-2 text-xs"
          >
            <option value="szabadsag">Szabadság</option>
            <option value="beteg">Betegszabadság</option>
          </select>
        </div>
        <div className="flex min-w-[150px] flex-1 flex-col gap-1">
          <Label className="text-[10px] tracking-wide uppercase">Megjegyzés</Label>
          <Input
            value={megjegyzes}
            onChange={(e) => setMegjegyzes(e.target.value)}
            placeholder="pl. telefonon kérte"
            className="h-8"
          />
        </div>
        <Button
          disabled={!canEdit || pending || ellenoriz || !tol || !ig || napok === 0}
          onClick={rogzit}
        >
          Rögzítem
        </Button>
      </div>
      <p className="px-3 pb-2.5 text-[11px] text-muted-foreground">
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
