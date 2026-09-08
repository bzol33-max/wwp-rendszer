"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { URGENCY_COLORS, type Feladat } from "@/lib/jelenlet/shared";

// Álló téglalap csempe egy telephelyhez — az oda kiadott aktuális
// (nincs kész) feladatokat listázza. Egy feladatra koppintva nyílik meg a
// részlete (megjegyzés írása, elvégzettnek jelölés).
export function TelephelyFeladatokTile({
  siteName,
  feladatok,
  onSelect,
}: {
  siteName: string;
  feladatok: Feladat[];
  onSelect: (feladat: Feladat) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{siteName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {feladatok.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nincs aktuális feladat.</p>
        ) : (
          feladatok.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f)}
              className="flex w-full items-start gap-2 rounded-md border bg-card p-2 text-left text-xs active:bg-muted"
            >
              <span
                className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{f.description}</span>
                <span className="text-muted-foreground">{f.task_date}</span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
