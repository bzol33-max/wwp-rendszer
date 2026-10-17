"use client";

import { Printer } from "lucide-react";

/** A napló nyomtatása / PDF-be mentése a böngésző saját nyomtató-ablakával. */
export function NyomtatasGomb({ felirat = "Nyomtatás / PDF" }: { felirat?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted print:hidden"
    >
      <Printer className="h-3.5 w-3.5" />
      {felirat}
    </button>
  );
}
