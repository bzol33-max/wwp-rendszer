"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kocsihozAdom } from "@/lib/fuvarozas2/sajat-fuvar";

/** Rugalmas saját fuvar egy kattintással a javasolt kocsira és napra (2026-10-19, 2. lépés). */
export function ElvinniIdeGomb({ id, jarmuKod, nap, cimke }: { id: string; jarmuKod: string; nap: string; cimke: string }) {
  const router = useRouter();
  const [fut, setFut] = useState(false);
  return (
    <button
      type="button"
      disabled={fut}
      onClick={async () => {
        setFut(true);
        try {
          const r = await kocsihozAdom(id, { jarmuKod, nap });
          if (!r.ok) { toast.error(r.hiba); return; }
          toast.success(`Kocsira adva: ${cimke}, ${nap.slice(5).replace("-", ".")}. — a sofőr látja`);
          router.refresh();
        } catch {
          toast.error("Nem sikerült.");
        } finally {
          setFut(false);
        }
      }}
      className="mt-1 min-h-8 w-full rounded-md bg-primary px-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
    >
      {fut ? "…" : "Ide"}
    </button>
  );
}
