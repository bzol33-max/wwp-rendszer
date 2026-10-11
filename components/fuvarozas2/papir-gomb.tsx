"use client";

// „Papír megjött ✓” / visszavonás (2026-10-11) az asztali nézetekhez (Pénz-
// nézet sora, megbízás részlet). Csak jelzés: a számlázást nem tiltja.
// A visszavonás megerősítést kér.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { setPapirMegjott } from "@/lib/fuvarozas2/megbizasok";

export function PapirGomb({ megbizasId, megvan, className }: { megbizasId: string; megvan: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function kattint() {
    if (megvan && !(await confirm("A papír nyugtázása törlődik — a fuvar újra a „Papír hiányzik” teendők közé kerül.", { title: "Visszavonod a papír-nyugtázást?", confirmLabel: "Visszavonom" }))) return;
    start(async () => {
      const r = await setPapirMegjott(megbizasId, !megvan);
      if (r.ok) { toast.success(megvan ? "Papír-nyugtázás visszavonva" : "Papír megjött ✓"); router.refresh(); }
      else toast.error(r.hiba);
    });
  }

  return (
    <>
      <button type="button" disabled={pending} onClick={kattint}
        className={cn(megvan
          ? "text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          : "rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50", className)}>
        {megvan ? "visszavonás" : "Papír megjött ✓"}
      </button>
      {confirmDialog}
    </>
  );
}
