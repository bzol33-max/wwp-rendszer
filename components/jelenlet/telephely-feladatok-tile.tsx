"use client";

import { cn } from "@/lib/utils";
import {
  REPEAT_LABELS,
  URGENCY_BORDERS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  type Feladat,
} from "@/lib/jelenlet/shared";

const HO_ROVID = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

function rovidDatum(iso: string): string {
  const [, ho, nap] = iso.split("-").map(Number);
  return `${HO_ROVID[ho - 1]}. ${nap}.`;
}

/**
 * Egy telephely nyitott feladatai, soronként egy tétel. A sorok szándékosan
 * egysorosak és sűrűk: telephelyenként 8-10 feladat is elfér görgetés
 * nélkül. A hosszú szöveg a sor végén levágódik, a teljes szöveg a megnyitott
 * feladatban látszik. A sorrend sürgősség, azon belül a régebbi kiadás elöl,
 * hogy ami régóta lóg, ne csússzon a lista aljára.
 */
export function TelephelyFeladatokTile({
  siteName,
  feladatok,
  keszMa,
  onSelect,
}: {
  siteName: string;
  feladatok: Feladat[];
  keszMa: number;
  onSelect: (feladat: Feladat) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">{siteName}</span>
        <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {feladatok.length === 0 ? "nincs" : `${feladatok.length} nyitott`}
        </span>
      </div>
      <div className="py-1">
        {feladatok.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nincs aktuális feladat.</p>
        ) : (
          feladatok.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f)}
              className={cn(
                // A sürgősség színe a sor bal szélén végigfutó sávként is
                // megjelenik, nem csak a pöttyben: a meleg tónusú alaptémán
                // egy 8 képpontos pötty önmagában alig olvasható, a listát
                // pedig egy pillantás alatt kell tudni átfutni.
                "flex w-full items-center gap-2 border-b border-l-4 border-border/40 px-3 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted/40",
                URGENCY_BORDERS[f.urgency],
                f.urgency === 1 && "bg-destructive/10",
                f.urgency === 2 && "bg-orange-500/10"
              )}
            >
              <span
                className={cn("size-2.5 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
                title={URGENCY_LABELS[f.urgency]}
              />
              <span className="min-w-0 flex-1 truncate">{f.description}</span>
              {f.repeat_freq !== "egyszeri" && (
                <span className="shrink-0 rounded-full border border-violet-300 bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">
                  {REPEAT_LABELS[f.repeat_freq]}
                </span>
              )}
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {rovidDatum(f.task_date)}
              </span>
            </button>
          ))
        )}
      </div>
      <div className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        Ma készre jelentve: {keszMa}
      </div>
    </div>
  );
}
