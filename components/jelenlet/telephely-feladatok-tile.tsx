"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GyorsFeladatBevitel } from "@/components/jelenlet/gyors-feladat-bevitel";
import {
  REPEAT_LABELS,
  URGENCY_BORDERS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  type Feladat,
} from "@/lib/jelenlet/shared";
import { toggleFeladatDone } from "@/lib/jelenlet/actions";

const HO_ROVID = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"];

function rovidDatum(iso: string): string {
  const [, ho, nap] = iso.split("-").map(Number);
  return `${HO_ROVID[ho - 1]}. ${nap}.`;
}

/** "ma 09:40", "tegnap 11:20", régebbinél "szept. 26." */
function keszFelirat(f: Feladat, maIso: string): string {
  const nap = f.elvegzes_datum;
  if (!nap) return "";
  const ido = f.elvegzes_at?.slice(11) ?? null;
  const [ev, ho, d] = maIso.split("-").map(Number);
  const tegnap = new Date(Date.UTC(ev, ho - 1, d - 1)).toISOString().slice(0, 10);
  const cimke = nap === maIso ? "ma" : nap === tegnap ? "tegnap" : rovidDatum(nap);
  return ido ? `${cimke} ${ido}` : cimke;
}

function Pipa({ kesz }: { kesz: boolean }) {
  return (
    <span
      className={cn(
        "flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border",
        kesz ? "border-success bg-success text-white" : "border-border bg-card text-transparent"
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/**
 * Egy telephely feladatai: felül gyorsbevitel, középen a nyitott tételek,
 * alul a frissen elvégzettek áthúzva. A készre jelentés a bal oldali
 * négyzet egy kattintása — a sor nem tűnik el, hanem lecsúszik az
 * elvégzettek közé, és ott marad a beállított ideig. A feladat szövegére
 * kattintva nyílik meg a részlete (megjegyzések, törlés).
 */
export function TelephelyFeladatokTile({
  siteId,
  siteName,
  feladatok,
  keszFeladatok,
  maIso,
  canEdit,
  onSelect,
  onChanged,
}: {
  siteId: number;
  siteName: string;
  feladatok: Feladat[];
  keszFeladatok: Feladat[];
  maIso: string;
  canEdit: boolean;
  onSelect: (feladat: Feladat) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function jelol(f: Feladat, kesz: boolean) {
    startTransition(async () => {
      try {
        await toggleFeladatDone(f.id, kesz);
        await onChanged();
        toast.success(kesz ? "Feladat elvégezve." : "Feladat visszanyitva.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">{siteName}</span>
        <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {feladatok.length === 0 ? "nincs nyitott" : `${feladatok.length} nyitott`}
        </span>
      </div>

      {canEdit && (
        <GyorsFeladatBevitel siteId={siteId} siteName={siteName} onCreated={onChanged} />
      )}

      <div className="py-1">
        {feladatok.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nincs aktuális feladat.</p>
        ) : (
          feladatok.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex items-center gap-2 border-b border-l-4 border-border/40 px-2.5 py-1.5 text-xs last:border-b-0",
                URGENCY_BORDERS[f.urgency],
                f.urgency === 1 && "bg-destructive/10",
                f.urgency === 2 && "bg-orange-500/10"
              )}
            >
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => jelol(f, true)}
                title="Elvégezve"
                className="shrink-0 disabled:opacity-50"
              >
                <Pipa kesz={false} />
              </button>
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={cn("size-2 shrink-0 rounded-full", URGENCY_COLORS[f.urgency])}
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
            </div>
          ))
        )}
      </div>

      {keszFeladatok.length > 0 && (
        <>
          <div className="flex items-center justify-between border-y border-success/30 bg-success/10 px-3 py-1 text-[10.5px] font-bold tracking-wide text-success uppercase">
            <span>Elvégezve</span>
            <span>{keszFeladatok.length}</span>
          </div>
          {keszFeladatok.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 border-b border-l-4 border-border/30 border-l-success/40 bg-success/5 px-2.5 py-1.5 text-xs text-muted-foreground last:border-b-0"
            >
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => jelol(f, false)}
                title="Visszanyitom"
                className="shrink-0 disabled:opacity-50"
              >
                <Pipa kesz />
              </button>
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate line-through decoration-success/40">
                  {f.description}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums">
                  {keszFelirat(f, maIso)}
                  {f.elvegezte ? ` · ${f.elvegezte}` : ""}
                </span>
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
