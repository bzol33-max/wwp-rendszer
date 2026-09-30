"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { nyugtazElterest, visszavonNyugtat } from "@/lib/fuvarozas2/ma-vaszon";

/** „OK” — az eltérés nyugtázása a Ma oldalon (aznap eltűnik a sávból, amíg nem súlyosbodik). */
export function NyugtaGomb({ kulcs, szin }: { kulcs: string; szin: "red" | "amber" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Láttam, rendben — ma nem mutatja újra, csak ha súlyosabb lesz"
      onClick={() =>
        start(async () => {
          try {
            const r = await nyugtazElterest(kulcs, szin);
            if (!r.ok) { toast.error(r.hiba); return; }
            router.refresh();
          } catch {
            toast.error("A nyugtázás nem sikerült.");
          }
        })
      }
      className="shrink-0 rounded-full border border-foreground/20 bg-card px-2.5 py-0.5 text-[11px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
    >
      {pending ? "…" : "OK"}
    </button>
  );
}

/** A nyugtázás visszavonása — az eltérés visszakerül a sávba. */
export function VisszavonGomb({ kulcs }: { kulcs: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await visszavonNyugtat(kulcs);
            if (!r.ok) { toast.error(r.hiba); return; }
            router.refresh();
          } catch {
            toast.error("A visszavonás nem sikerült.");
          }
        })
      }
      className="shrink-0 text-[11px] font-semibold text-[var(--f2-blue)] hover:underline disabled:opacity-50"
    >
      vissza
    </button>
  );
}
