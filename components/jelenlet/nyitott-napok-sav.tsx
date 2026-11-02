"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lezarJelenletSession, type NyitottNap } from "@/lib/jelenlet/actions";

// A nyitva maradt napok sávja. Ezek azok a napok, ahol a dolgozó elfelejtette
// a távozást (vagy az érkezést) rögzíteni — a nap hossza ismeretlen, ezért a
// heti és a havi egyenlegből is kimarad, amíg le nem zárod. Egy időpont
// beírásával itt helyben rendezhető. (A régi JelenletView-ból kiemelve, redesign 6:
// a mobil ág és a Csapat lap is ezt használja.)
export function NyitottNapokSav({
  napok,
  canEdit,
  onReload,
}: {
  napok: NyitottNap[];
  canEdit: boolean;
  onReload: () => void | Promise<void>;
}) {
  const [nyitva, setNyitva] = useState(false);
  const [idok, setIdok] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (napok.length === 0) return null;

  function lezar(nap: NyitottNap) {
    const ido = idok[nap.session_id];
    if (!ido) {
      toast.error("Add meg a távozás időpontját.");
      return;
    }
    startTransition(async () => {
      try {
        await lezarJelenletSession(nap.session_id, ido);
        await onReload();
        toast.success("Nap lezárva.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nem sikerült menteni.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-sm">
          <b>
            {napok.length === 1 ? "1 nyitott nap" : `${napok.length} nyitott nap`}
          </b>{" "}
          — {napok.slice(0, 2).map((n) => `${n.employee_name} ${n.work_date}`).join(", ")}
          {napok.length > 2 && ` és még ${napok.length - 2}`}
        </p>
        <Button size="xs" variant="outline" onClick={() => setNyitva((v) => !v)}>
          {nyitva ? "Elrejtem" : "Javítom"}
        </Button>
      </div>
      {nyitva && (
        <div className="mt-2 space-y-1.5 border-t border-amber-200 pt-2">
          {napok.map((n) => (
            <div key={n.session_id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-[190px]">
                <b>{n.employee_name}</b> · {n.work_date} ·{" "}
                <span className="tabular-nums">
                  {n.arrival_time ?? "nincs érkezés"} – {n.departure_time ?? "nincs távozás"}
                </span>
              </span>
              {canEdit && (
                <>
                  <Input
                    type="time"
                    value={idok[n.session_id] ?? ""}
                    onChange={(e) => setIdok((v) => ({ ...v, [n.session_id]: e.target.value }))}
                    className="h-7 w-28 bg-white"
                  />
                  <Button size="xs" disabled={pending} onClick={() => lezar(n)}>
                    {n.arrival_time ? "Távozás beírása" : "Érkezés beírása"}
                  </Button>
                </>
              )}
            </div>
          ))}
          <p className="text-xs text-amber-800">
            A hiányzó érkezésű sort a havi naplóban tudod rendbe tenni vagy törölni.
          </p>
        </div>
      )}
    </div>
  );
}
