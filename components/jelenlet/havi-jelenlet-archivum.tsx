"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HU_MONTHS } from "@/lib/dolgozok/shared";
import { formatDiff, formatOra, type HaviArchivumHonap } from "@/lib/jelenlet/shared";
import { HaviNaploDialog } from "@/components/jelenlet/havi-naplo-dialog";

// Jelenlét → Archívum, Havi jelenlét fül (2026-09-30, "A" terv): lenyíló
// hónapok, bennük dolgozónként egy táblázatsor. A legfrissebb lezárt hónap
// nyitva indul. A "Havi naptár" az adott hónapra nyitja a meglévő naplót.
export function HaviJelenletArchivum({ honapok }: { honapok: HaviArchivumHonap[] }) {
  const [nyitott, setNyitott] = useState<Set<string>>(
    () => new Set(honapok.length > 0 ? [honapok[0].monthKey] : [])
  );
  const [naptar, setNaptar] = useState<HaviArchivumHonap | null>(null);

  if (honapok.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Még nincs lezárt hónap. A hónap a fordulókor magától kerül ide.
        </CardContent>
      </Card>
    );
  }

  function valt(key: string) {
    setNyitott((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {honapok.map((h) => {
        const nyitva = nyitott.has(h.monthKey);
        return (
          <Card key={h.monthKey}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => valt(h.monthKey)}
                  className="flex items-center gap-1.5 text-sm font-semibold"
                >
                  {nyitva ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  {h.year}. {HU_MONTHS[h.month - 1]}
                </button>
                <Button size="sm" variant="outline" onClick={() => setNaptar(h)}>
                  <CalendarDays className="size-4" />
                  Havi naptár
                </Button>
              </div>
              {nyitva && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-1.5 pr-2 text-left font-medium">Dolgozó</th>
                        <th className="px-2 text-right font-medium">Munkanap</th>
                        <th className="px-2 text-right font-medium">Óra</th>
                        <th className="px-2 text-right font-medium">Eltérés (9 ó)</th>
                        <th className="px-2 text-right font-medium">Szabi</th>
                        <th className="px-2 text-right font-medium">Beteg</th>
                        <th className="px-2 text-right font-medium">Nyitva</th>
                        <th className="pl-2 text-right font-medium">Keret marad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {h.sorok.map((s) => (
                        <tr key={s.employeeId}>
                          <td className="py-2 pr-2 font-medium">{s.name}</td>
                          <td className="px-2 text-right">{s.munkanap}</td>
                          <td className="px-2 text-right">{formatOra(s.workedMinutes)}</td>
                          <td
                            className={cn(
                              "px-2 text-right font-semibold",
                              s.diffMinutes < 0 && "text-destructive",
                              s.diffMinutes > 0 && "text-success"
                            )}
                          >
                            {formatDiff(s.diffMinutes)}
                          </td>
                          <td className="px-2 text-right">{s.szabadsag}</td>
                          <td className="px-2 text-right">{s.beteg}</td>
                          <td className={cn("px-2 text-right", s.nyitott > 0 && "font-semibold text-destructive")}>
                            {s.nyitott}
                          </td>
                          <td className="pl-2 text-right">
                            {s.keretMaradek === null ? "—" : `${s.keretMaradek} nap`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {naptar && (
        <HaviNaploDialog
          key={naptar.monthKey}
          open
          onOpenChange={(o) => {
            if (!o) setNaptar(null);
          }}
          induloHonap={{ year: naptar.year, month: naptar.month }}
        />
      )}
    </div>
  );
}
