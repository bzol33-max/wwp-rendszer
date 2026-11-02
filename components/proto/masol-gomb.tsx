"use client";

import { toast } from "sonner";

export function MasolGomb({ szoveg, cimke }: { szoveg: string; cimke: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(szoveg).then(() => toast.success("Kimásolva."), () => toast.error(`A másolás nem sikerült. Írd be kézzel: ${szoveg}`))}
      className="inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted"
    >
      {cimke}
    </button>
  );
}
