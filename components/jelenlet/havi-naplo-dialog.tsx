"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { HU_MONTHS } from "@/lib/dolgozok/shared";
import {
  DAY_TYPE_LABELS,
  DAY_TYPE_STYLES,
  currentYearMonth,
  formatDiff,
  honapHetei,
  summarizeByDay,
  todayIso,
  weekInfo,
  type DaySummary,
  type JelenletEmployee,
  type JelenletSession,
} from "@/lib/jelenlet/shared";
import { getJelenletEmployees, getJelenletekIdoszak } from "@/lib/jelenlet/actions";
import { NapSzerkeszto } from "@/components/jelenlet/nap-szerkeszto";

// A dolgozók megkülönböztetése a naptárban: a név nem fér ki a cellába, ezért
// egy színes kezdőbetű jelöli őket. A sorrend a jelenlét-lista sorrendje.
const JELOLO_SZINEK = ["bg-teal-600", "bg-indigo-600", "bg-rose-600", "bg-amber-600"];

const HU_NAP_ROVID = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

function napSzama(iso: string): number {
  return Number(iso.slice(8, 10));
}

function napFelirat(iso: string): string {
  const [ev, ho, nap] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  const dow = (d.getUTCDay() + 6) % 7;
  return `${HU_MONTHS[ho - 1]} ${nap}., ${["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"][dow]}`;
}

/** Egy dolgozó egy napja a naptárcellában: jelölő + eltérés vagy címke. */
function NapiJeloles({
  betu,
  szin,
  nap,
}: {
  betu: string;
  szin: string;
  nap: DaySummary | undefined;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] leading-tight">
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-extrabold text-white",
          szin
        )}
      >
        {betu}
      </span>
      {!nap ? (
        <span className="text-muted-foreground">—</span>
      ) : nap.nyitott ? (
        <span className="rounded-full border border-destructive/40 bg-destructive/10 px-1.5 text-[9.5px] font-bold text-destructive">
          nyitva
        </span>
      ) : nap.dayType !== "munka" ? (
        <span
          className={cn(
            "rounded-full border px-1.5 text-[9.5px] font-bold",
            DAY_TYPE_STYLES[nap.dayType]
          )}
        >
          {nap.dayType === "szabadsag" ? "Szabi" : "Beteg"}
        </span>
      ) : (
        <span
          className={cn(
            "font-bold tabular-nums",
            (nap.diffMinutes ?? 0) < 0 ? "text-destructive" : "text-success"
          )}
        >
          {formatDiff(nap.diffMinutes)}
        </span>
      )}
    </span>
  );
}

/**
 * A hónap naptárként, mellette állandó helyen a kiválasztott nap
 * szerkesztője. A javítás és az utólagos pótlás ugyanott történik: egy
 * napra kattintva a jobb oldali panel azonnal írható, semmi nem nyílik ki
 * és nem csúszik el. A kitöltetlen hétköznap szaggatott kerettel látszik,
 * arra kattintva lehet pótolni — külön dátumválasztó nem kell.
 *
 * A heti és a havi összegbe csak a lezárt nap számít bele: a nyitva maradt
 * nap (nincs távozás) addig "nyitva", amíg az admin le nem zárja, a
 * szabadság és a betegszabadság pedig egyáltalán nem számít bele.
 */
export function HaviNaploDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canEdit = useCanEdit();
  const indulo = currentYearMonth();
  const [ev, setEv] = useState(indulo.year);
  const [honap, setHonap] = useState(indulo.month);
  const [employees, setEmployees] = useState<JelenletEmployee[]>([]);
  const [sessions, setSessions] = useState<JelenletSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [kivalasztott, setKivalasztott] = useState<string | null>(null);

  const hetek = useMemo(() => honapHetei(ev, honap), [ev, honap]);
  const honapElotag = `${ev}-${String(honap).padStart(2, "0")}`;

  const load = useCallback(async () => {
    const napok = honapHetei(ev, honap);
    const tol = napok[0][0];
    const ig = napok[napok.length - 1][6];
    const [emp, rows] = await Promise.all([
      getJelenletEmployees(),
      getJelenletekIdoszak(tol, ig),
    ]);
    setEmployees(emp);
    setSessions(rows);
  }, [ev, honap]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    load().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [open, load]);

  // Dolgozónként: nap -> napi összesítés. Ebből olvas a naptár, a heti
  // oszlop és a havi összeg is, hogy mindhárom ugyanazt a számot mondja.
  const napokSzerint = useMemo(() => {
    const terkep = new Map<string, Map<string, DaySummary>>();
    for (const e of employees) {
      const sajat = summarizeByDay(sessions.filter((s) => s.employee_id === e.id));
      terkep.set(e.id, new Map(sajat.map((n) => [n.date, n])));
    }
    return terkep;
  }, [employees, sessions]);

  const haviOsszeg = useMemo(() => {
    const terkep = new Map<
      string,
      { diff: number; nap: number; szabadsag: number; beteg: number; nyitott: number }
    >();
    for (const e of employees) {
      const napok = [...(napokSzerint.get(e.id)?.values() ?? [])].filter((n) =>
        n.date.startsWith(honapElotag)
      );
      terkep.set(e.id, {
        diff: napok.reduce((sum, n) => sum + (n.diffMinutes ?? 0), 0),
        nap: napok.filter((n) => n.dayType === "munka" && !n.nyitott).length,
        szabadsag: napok.filter((n) => n.dayType === "szabadsag").length,
        beteg: napok.filter((n) => n.dayType === "beteg").length,
        nyitott: napok.filter((n) => n.nyitott).length,
      });
    }
    return terkep;
  }, [employees, napokSzerint, honapElotag]);

  const ma = todayIso();

  function lepHonap(delta: number) {
    const d = new Date(Date.UTC(ev, honap - 1 + delta, 1));
    setEv(d.getUTCFullYear());
    setHonap(d.getUTCMonth() + 1);
    setKivalasztott(null);
    setLoading(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A dialógus portálba renderel, a lap .jelenlet wrapper-én kívül —
          ezért kapja meg itt külön a modul palettáját. */}
      <DialogContent className="jelenlet max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <span>
              Jelenlét — {HU_MONTHS[honap - 1]} {ev}
            </span>
            <span className="flex items-center gap-3">
              {employees.map((e, i) => {
                const o = haviOsszeg.get(e.id);
                return (
                  <span key={e.id} className="flex items-center gap-1.5 text-sm font-normal">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[6px] text-[10px] font-extrabold text-white",
                        JELOLO_SZINEK[i % JELOLO_SZINEK.length]
                      )}
                    >
                      {e.name.slice(0, 1)}
                    </span>
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        (o?.diff ?? 0) < 0 ? "text-destructive" : "text-success"
                      )}
                    >
                      {formatDiff(o?.diff ?? 0)}
                    </span>
                  </span>
                );
              })}
              <span className="flex items-center gap-1">
                <Button size="icon-xs" variant="outline" onClick={() => lepHonap(-1)}>
                  <ChevronLeft />
                </Button>
                <Button size="icon-xs" variant="outline" onClick={() => lepHonap(1)}>
                  <ChevronRight />
                </Button>
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs jelenlét-aktív dolgozó.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
            {/* --- naptár --- */}
            <div>
              <div className="grid grid-cols-[repeat(7,1fr)_92px] gap-1.5">
                {HU_NAP_ROVID.map((n) => (
                  <span
                    key={n}
                    className="py-1 text-center text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase"
                  >
                    {n}
                  </span>
                ))}
                <span className="py-1 text-center text-[10.5px] font-bold tracking-wide text-muted-foreground uppercase">
                  Hét
                </span>

                {hetek.map((het) => (
                  <Fragment key={het[0]}>
                    {het.map((datum, idx) => {
                      const ebbenAHonapban = datum.startsWith(honapElotag);
                      const hetvege = idx >= 5;
                      const napok = employees.map((e) => napokSzerint.get(e.id)?.get(datum));
                      const vanBejegyzes = napok.some(Boolean);
                      const vanNyitott = napok.some((n) => n?.nyitott);
                      return (
                        <button
                          key={datum}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setKivalasztott(datum)}
                          className={cn(
                            "flex min-h-[74px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                            canEdit && "hover:border-foreground/30",
                            !ebbenAHonapban && "opacity-45",
                            hetvege && !vanBejegyzes ? "bg-muted/50" : "bg-card",
                            !vanBejegyzes && !hetvege && "border-dashed",
                            vanNyitott && "border-warning bg-warning/10",
                            datum === ma && "border-foreground shadow-[0_0_0_2px_rgba(15,23,42,.12)]",
                            kivalasztott === datum &&
                              "border-foreground bg-accent shadow-[0_0_0_2px_rgba(15,23,42,.22)]"
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span className="text-xs font-bold">{napSzama(datum)}.</span>
                            {datum === ma && (
                              <span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                                ma
                              </span>
                            )}
                          </span>
                          {vanBejegyzes
                            ? employees.map((e, i) => (
                                <NapiJeloles
                                  key={e.id}
                                  betu={e.name.slice(0, 1)}
                                  szin={JELOLO_SZINEK[i % JELOLO_SZINEK.length]}
                                  nap={napokSzerint.get(e.id)?.get(datum)}
                                />
                              ))
                            : ebbenAHonapban &&
                              !hetvege && (
                                <span className="text-[10px] text-muted-foreground">
                                  nincs bejegyzés
                                </span>
                              )}
                        </button>
                      );
                    })}

                    {/* heti összeg — dolgozónként, a hét megjelenített napjaiból */}
                    <div className="flex flex-col justify-center gap-1 rounded-lg border bg-muted/60 px-2 py-1.5">
                      <span className="text-[9.5px] font-bold tracking-wide text-muted-foreground uppercase">
                        {weekInfo(het[0]).week}. hét
                      </span>
                      {employees.map((e, i) => {
                        const terkep = napokSzerint.get(e.id);
                        const osszeg = het.reduce(
                          (sum, d) => sum + (terkep?.get(d)?.diffMinutes ?? 0),
                          0
                        );
                        const vanNap = het.some((d) => terkep?.get(d));
                        return (
                          <span key={e.id} className="flex items-center gap-1.5 text-[11px]">
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-extrabold text-white",
                                JELOLO_SZINEK[i % JELOLO_SZINEK.length]
                              )}
                            >
                              {e.name.slice(0, 1)}
                            </span>
                            {vanNap ? (
                              <b
                                className={cn(
                                  "tabular-nums",
                                  osszeg < 0 ? "text-destructive" : "text-success"
                                )}
                              >
                                {formatDiff(osszeg)}
                              </b>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {employees.map((e, i) => (
                  <span key={e.id} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[5px] text-[9px] font-extrabold text-white",
                        JELOLO_SZINEK[i % JELOLO_SZINEK.length]
                      )}
                    >
                      {e.name.slice(0, 1)}
                    </span>
                    {e.name}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-4 rounded-[3px] border border-dashed" />
                  nincs bejegyzés, pótolható
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-4 rounded-[3px] border border-warning bg-warning/20" />
                  nincs távozás, javításra vár
                </span>
              </div>
            </div>

            {/* --- a kiválasztott nap szerkesztője, állandó helyen --- */}
            <div className="rounded-xl border bg-card p-3">
              {kivalasztott ? (
                <>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <b className="text-sm">{napFelirat(kivalasztott)}</b>
                    <Button size="xs" variant="ghost" onClick={() => setKivalasztott(null)}>
                      Bezárom
                    </Button>
                  </div>
                  <NapSzerkeszto
                    employees={employees}
                    workDate={kivalasztott}
                    sessions={sessions}
                    onReload={load}
                    egyOszlop
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Mentés után a heti és a havi összeg azonnal újraszámolódik.
                  </p>
                </>
              ) : (
                <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium">Válassz egy napot</p>
                  <p className="text-xs text-muted-foreground">
                    {canEdit
                      ? "A naptárban bármelyik napra kattintva itt javíthatod vagy pótolhatod a bejegyzéseket."
                      : "A javításhoz szerkesztési jog kell."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && employees.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {employees.map((e, i) => {
              const o = haviOsszeg.get(e.id);
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-[7px] text-[11px] font-extrabold text-white",
                      JELOLO_SZINEK[i % JELOLO_SZINEK.length]
                    )}
                  >
                    {e.name.slice(0, 1)}
                  </span>
                  <span className="text-sm font-medium">{e.name}</span>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      (o?.diff ?? 0) < 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    {formatDiff(o?.diff ?? 0)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {o?.nap ?? 0} nap
                    {o && o.szabadsag > 0 && ` · ${o.szabadsag} szabadság`}
                    {o && o.beteg > 0 && ` · ${o.beteg} beteg`}
                    {o && o.nyitott > 0 && ` · ${o.nyitott} nyitott`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
