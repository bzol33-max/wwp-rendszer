"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/current-user";
import {
  REPEAT_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  URGENCY_LEVELS,
  todayIso,
  type RepeatFreq,
} from "@/lib/jelenlet/shared";
import { createFeladat } from "@/lib/jelenlet/actions";

/**
 * Gyorsbevitel a telephely oszlopának tetején. Alapból egyetlen sor:
 * beírod, mit kell csinálni. Amint belekattintasz, alatta kinyílik a
 * sürgősség (öt színes gomb), az ismétlődés és a dátum — aki csak bedob egy
 * feladatot, annak egy sor is elég, akinek kell, az megkapja a többit.
 *
 * A telephelyet NEM kell választani: azt az oszlop adja. Hozzáadás után a
 * mező kiürül, de nyitva marad, hogy egymás után többet is fel lehessen
 * venni anélkül, hogy újra ki kellene nyitni.
 */
export function GyorsFeladatBevitel({
  siteId,
  siteName,
  onCreated,
}: {
  siteId: number;
  siteName: string;
  onCreated: () => void | Promise<void>;
}) {
  const [nyitva, setNyitva] = useState(false);
  const [szoveg, setSzoveg] = useState("");
  const [urgency, setUrgency] = useState(3);
  const [repeatFreq, setRepeatFreq] = useState<RepeatFreq>("egyszeri");
  const [datum, setDatum] = useState(todayIso());
  const [pending, startTransition] = useTransition();

  function bezar() {
    setNyitva(false);
    setSzoveg("");
    setUrgency(3);
    setRepeatFreq("egyszeri");
    setDatum(todayIso());
  }

  function hozzaad() {
    const leiras = szoveg.trim();
    if (!leiras) {
      toast.error("Írd be, mit kell elvégezni.");
      return;
    }
    startTransition(async () => {
      try {
        await createFeladat({
          taskDate: datum,
          siteId,
          description: leiras,
          urgency,
          repeatFreq,
          createdBy: getCurrentUser() || undefined,
        });
        // A mező kiürül, de a panel nyitva marad: így egymás után több
        // feladat is felvehető ugyanarra a telepre.
        setSzoveg("");
        await onCreated();
        toast.success("Feladat rögzítve.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className={cn("border-b bg-muted/30 px-2 py-1.5", nyitva && "bg-accent/40")}>
      <Input
        value={szoveg}
        onFocus={() => setNyitva(true)}
        onChange={(e) => setSzoveg(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") hozzaad();
          if (e.key === "Escape") bezar();
        }}
        placeholder={nyitva ? `Mit kell elvégezni? (${siteName})` : "+ Új feladat…"}
        className="h-8 bg-card text-xs"
        disabled={pending}
      />

      {nyitva && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            {/* Sürgősség öt színes gombbal: egy kattintás, nem legördülő. */}
            <div className="flex gap-1">
              {URGENCY_LEVELS.map((szint) => (
                <button
                  key={szint}
                  type="button"
                  title={URGENCY_LABELS[szint]}
                  onClick={() => setUrgency(szint)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border bg-card",
                    urgency === szint ? "border-2 border-foreground" : "border-border"
                  )}
                >
                  <span className={cn("size-2.5 rounded-full", URGENCY_COLORS[szint])} />
                </button>
              ))}
            </div>
            <Select value={repeatFreq} onValueChange={(v) => v && setRepeatFreq(v as RepeatFreq)}>
              <SelectTrigger size="sm" className="h-6 w-auto bg-card text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REPEAT_LABELS) as RepeatFreq[]).map((freq) => (
                  <SelectItem key={freq} value={freq}>
                    {REPEAT_LABELS[freq]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="h-6 w-[125px] bg-card text-[11px]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="xs" variant="ghost" onClick={bezar} disabled={pending}>
              Mégse
            </Button>
            <Button size="xs" onClick={hozzaad} disabled={pending || !szoveg.trim()}>
              Hozzáadás
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
