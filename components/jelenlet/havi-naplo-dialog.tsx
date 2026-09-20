"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { HU_MONTHS } from "@/lib/dolgozok/shared";
import {
  DAY_TYPE_LABELS,
  DAY_TYPE_STYLES,
  currentYearMonth,
  formatDiff,
  summarizeByDay,
  summarizeByWeek,
  todayIso,
  weekInfo,
  type DaySummary,
  type JelenletEmployee,
  type JelenletSession,
  type WeekSummary,
} from "@/lib/jelenlet/shared";
import { getJelenletEmployees, getMonthJelenletekMind } from "@/lib/jelenlet/actions";
import { NapSzerkeszto } from "@/components/jelenlet/nap-szerkeszto";

const HU_NAP_ROVID = ["V", "H", "K", "Sze", "Cs", "P", "Szo"] as const;

function napFelirat(iso: string): string {
  const [ev, ho, nap] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  return `${HU_MONTHS[ho - 1].slice(0, 4)}. ${nap}., ${HU_NAP_ROVID[d.getUTCDay()]}`;
}

/** Egy nap egy dolgozónál: az időpontok egymás után, vagy a távollét címkéje. */
function NapCella({ nap }: { nap: DaySummary | undefined }) {
  if (!nap) return <span className="text-muted-foreground">—</span>;
  if (nap.dayType !== "munka") {
    return (
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          DAY_TYPE_STYLES[nap.dayType]
        )}
      >
        {DAY_TYPE_LABELS[nap.dayType]}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {nap.sessions
        .map((s) => `${s.arrival_time ?? "?"} – ${s.departure_time ?? "?"}`)
        .join(" · ")}
    </span>
  );
}

function EltersCella({ nap }: { nap: DaySummary | undefined }) {
  if (!nap) return <span className="text-muted-foreground">—</span>;
  if (nap.nyitott) {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        nyitva
      </span>
    );
  }
  if (nap.diffMinutes === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold tabular-nums", nap.diffMinutes < 0 ? "text-destructive" : "text-success")}>
      {formatDiff(nap.diffMinutes)}
    </span>
  );
}

/**
 * A hónap naplója hetekre bontva: soronként egy nap, a dolgozók egymás
 * mellett, a hét végén részösszeggel, a hónap végén végösszeggel. Egy napra
 * koppintva ott helyben nyílik a szerkesztő (NapSzerkeszto) — a javítás nem
 * visz külön oldalra.
 *
 * A heti és havi összegbe csak a lezárt nap számít bele: a nyitva maradt
 * napot (nincs távozás) az admin zárja le, addig "nyitva" jelöléssel áll.
 * Szabadság és betegszabadság nem számít bele.
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
  const [nyitottNap, setNyitottNap] = useState<string | null>(null);
  const [potolt, setPotolt] = useState("");

  const load = useCallback(async () => {
    const [emp, rows] = await Promise.all([
      getJelenletEmployees(),
      getMonthJelenletekMind(ev, honap),
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

  // Dolgozónként: nap -> napi összesítés, illetve hét -> heti összesítés.
  const { napokSzerint, hetek, haviOsszeg } = useMemo(() => {
    const napokSzerint = new Map<string, Map<string, DaySummary>>();
    const hetiSzerint = new Map<string, Map<string, WeekSummary>>();
    const haviOsszeg = new Map<string, { diff: number; nap: number; szabadsag: number; beteg: number; nyitott: number }>();
    const hetLista = new Map<string, WeekSummary["week"]>();

    for (const e of employees) {
      const sajat = sessions.filter((s) => s.employee_id === e.id);
      const napok = summarizeByDay(sajat);
      const napTerkep = new Map<string, DaySummary>();
      for (const n of napok) napTerkep.set(n.date, n);
      napokSzerint.set(e.id, napTerkep);

      const hetek = summarizeByWeek(napok);
      const hetTerkep = new Map<string, WeekSummary>();
      for (const h of hetek) {
        hetTerkep.set(h.week.mondayIso, h);
        hetLista.set(h.week.mondayIso, h.week);
      }
      hetiSzerint.set(e.id, hetTerkep);

      haviOsszeg.set(e.id, {
        diff: napok.reduce((sum, n) => sum + (n.diffMinutes ?? 0), 0),
        nap: napok.filter((n) => n.dayType === "munka" && !n.nyitott).length,
        szabadsag: napok.filter((n) => n.dayType === "szabadsag").length,
        beteg: napok.filter((n) => n.dayType === "beteg").length,
        nyitott: napok.filter((n) => n.nyitott).length,
      });
    }

    // A hetek időrendben, a hét napjaival együtt (minden dolgozó napjainak uniója).
    const hetek = [...hetLista.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mondayIso, week]) => {
        const datumok = new Set<string>();
        for (const terkep of napokSzerint.values()) {
          for (const datum of terkep.keys()) {
            if (weekInfo(datum).mondayIso === mondayIso) datumok.add(datum);
          }
        }
        return {
          mondayIso,
          week,
          napok: [...datumok].sort(),
          hetiSzerint,
        };
      });

    return { napokSzerint, hetek, haviOsszeg };
  }, [employees, sessions]);

  const ma = todayIso();

  function lepHonap(delta: number) {
    const d = new Date(Date.UTC(ev, honap - 1 + delta, 1));
    setEv(d.getUTCFullYear());
    setHonap(d.getUTCMonth() + 1);
    setNyitottNap(null);
    setLoading(true);
  }

  const potlasNap = potolt || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>
              Jelenlét — {HU_MONTHS[honap - 1]} {ev}
            </span>
            <span className="flex items-center gap-1">
              <Button size="icon-xs" variant="outline" onClick={() => lepHonap(-1)}>
                <ChevronLeft />
              </Button>
              <Button size="icon-xs" variant="outline" onClick={() => lepHonap(1)}>
                <ChevronRight />
              </Button>
            </span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Napi mérce 9 óra. A nyitva maradt nap és a távollét nem számít bele az összegekbe.
          Egy napra kattintva ott helyben javíthatsz.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nincs jelenlét-aktív dolgozó.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Nap</th>
                  {employees.map((e) => (
                    <th key={e.id} colSpan={2} className="px-2 py-1.5 text-left font-semibold">
                      {e.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hetek.length === 0 && (
                  <tr>
                    <td colSpan={1 + employees.length * 2} className="px-2 py-3 text-muted-foreground">
                      Ebben a hónapban még nincs rögzített nap.
                    </td>
                  </tr>
                )}
                {hetek.map((h) => (
                  <Fragment key={h.mondayIso}>
                    <tr className="border-y bg-muted/50">
                      <td className="px-2 py-1.5 font-semibold">{h.week.week}. hét</td>
                      {employees.map((e) => {
                        const heti = h.hetiSzerint.get(e.id)?.get(h.mondayIso);
                        return (
                          <td key={e.id} colSpan={2} className="px-2 py-1.5">
                            <span className="text-muted-foreground">
                              {heti ? `${heti.workedDays} nap` : "—"}
                            </span>
                            {heti && (
                              <span
                                className={cn(
                                  "ml-2 font-semibold tabular-nums",
                                  heti.diffMinutes < 0 ? "text-destructive" : "text-success"
                                )}
                              >
                                {formatDiff(heti.diffMinutes)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {h.napok.map((datum) => (
                      <Fragment key={datum}>
                        <tr
                          onClick={() => canEdit && setNyitottNap(nyitottNap === datum ? null : datum)}
                          className={cn(
                            "border-b",
                            canEdit && "cursor-pointer hover:bg-muted/40",
                            datum === ma && "bg-muted/30",
                            nyitottNap === datum && "bg-muted/60"
                          )}
                        >
                          <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                            {napFelirat(datum)}
                            {datum === ma && <span className="ml-1 font-semibold text-foreground">ma</span>}
                          </td>
                          {employees.map((e) => {
                            const nap = napokSzerint.get(e.id)?.get(datum);
                            return (
                              <Fragment key={e.id}>
                                <td className="px-2 py-1.5">
                                  <NapCella nap={nap} />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <EltersCella nap={nap} />
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                        {nyitottNap === datum && canEdit && (
                          <tr>
                            <td colSpan={1 + employees.length * 2} className="bg-muted/30 px-2 py-2">
                              <p className="mb-2 text-xs font-semibold">
                                {napFelirat(datum)} — szerkesztés
                              </p>
                              <NapSzerkeszto
                                employees={employees}
                                workDate={datum}
                                sessions={sessions}
                                onReload={load}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
                <tr className="bg-foreground text-background">
                  <td className="px-2 py-2 font-bold">
                    {HU_MONTHS[honap - 1]} összesen
                  </td>
                  {employees.map((e) => {
                    const o = haviOsszeg.get(e.id);
                    return (
                      <td key={e.id} colSpan={2} className="px-2 py-2">
                        <span className="opacity-80">
                          {o ? `${o.nap} nap` : "—"}
                          {o && o.szabadsag > 0 && ` · ${o.szabadsag} szabadság`}
                          {o && o.beteg > 0 && ` · ${o.beteg} beteg`}
                          {o && o.nyitott > 0 && ` · ${o.nyitott} nyitott`}
                        </span>
                        {o && (
                          <span className="ml-2 font-bold tabular-nums">{formatDiff(o.diff)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Nap pótlása</Label>
              <Input
                type="date"
                value={potolt}
                onChange={(e) => setPotolt(e.target.value)}
                className="h-8 w-40"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!potlasNap}
              onClick={() => potlasNap && setNyitottNap(potlasNap)}
            >
              Megnyitom
            </Button>
            <p className="text-xs text-muted-foreground">
              Olyan napot is megnyithatsz, amelyen még egyetlen bejegyzés sincs.
            </p>
          </div>
        )}

        {nyitottNap && canEdit && !hetek.some((h) => h.napok.includes(nyitottNap)) && (
          <div className="rounded-md border p-2">
            <p className="mb-2 text-xs font-semibold">{napFelirat(nyitottNap)} — pótlás</p>
            <NapSzerkeszto
              employees={employees}
              workDate={nyitottNap}
              sessions={sessions}
              onReload={load}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
