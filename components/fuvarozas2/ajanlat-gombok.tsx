"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { allitTimocomAllapotot } from "@/lib/fuvarozas2/timocom";

// Tervezés · A hét (2026-10-14): az ajánlat állapota közvetlenül a listán
// állítható — nem kell átmenni a Timocom-lapra. Ugyanaz az akció, mint ott.
export function AjanlatGombok({ id, allapot }: { id: string; allapot: string }) {
  const canEdit = useCanEdit();
  const router = useRouter();
  const [fut, startTransition] = useTransition();
  if (!canEdit) return null;
  const allit = (x: "nyitott" | "ajanlva" | "elvetve", uzenet: string) =>
    startTransition(async () => {
      const r = await allitTimocomAllapotot(id, x);
      if (!r.ok) {
        toast.error("Nem sikerült menteni.");
        return;
      }
      toast.success(uzenet);
      router.refresh();
    });
  const gomb = "rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50";
  return (
    <span className="inline-flex gap-1">
      {allapot !== "ajanlva" ? (
        <button type="button" disabled={fut} className={gomb} onClick={() => allit("ajanlva", "Megjelölve: ajánlat kiment")}>Ajánlatot adtam</button>
      ) : (
        <button type="button" disabled={fut} className={gomb} onClick={() => allit("nyitott", "Visszatéve a nyitottak közé")}>Mégis nyitott</button>
      )}
      <button type="button" disabled={fut} className={gomb} onClick={() => allit("elvetve", "Ajánlat elvetve")}>Elvetem</button>
    </span>
  );
}
