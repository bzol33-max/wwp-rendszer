"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// A böngésző window.confirm() helyett: Firefox egymás utáni megerősítéseknél
// felajánlja, hogy "ne engedje több párbeszédablakot" — ha ezt bepipálják, a
// confirm() csendben false-t ad, és a gomb (pl. Kifizetés) látszólag semmit
// nem csinál (2026-10-05, Nyíregyháza havi, Balázs kifizetése). Ezt a saját
// ablakot a böngésző nem tudja letiltani.
//
// Használat:
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm("Mehet?"))) return;
//   ... a JSX-ben valahol: {confirmDialog}
export function useConfirm(): [
  (message: ReactNode, opts?: { title?: string; confirmLabel?: string }) => Promise<boolean>,
  ReactNode,
] {
  const [state, setState] = useState<{
    message: ReactNode;
    title: string;
    confirmLabel: string;
  } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (message: ReactNode, opts?: { title?: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setState({
          message,
          title: opts?.title ?? "Megerősítés",
          confirmLabel: opts?.confirmLabel ?? "Mehet",
        });
      }),
    []
  );

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  }, []);

  const dialog = (
    <Dialog open={state !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm whitespace-pre-line">{state?.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            Mégse
          </Button>
          <Button autoFocus onClick={() => close(true)}>
            {state?.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
