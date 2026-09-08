"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UjFeladatForm } from "@/components/jelenlet/uj-feladat-form";
import type { Site } from "@/lib/jelenlet/shared";

// Kompakt csempe a Jelenlét admin nézet felső sorában — koppintásra
// megnyitja az új feladat felvételét.
export function FeladatRogzitesTile({
  sites,
  canEdit,
  onCreated,
}: {
  sites: Site[];
  canEdit: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => canEdit && setOpen(true)}
          disabled={!canEdit}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2.5 text-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs font-semibold">Feladat rögzítése</span>
        </button>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Új feladat</DialogTitle>
          </DialogHeader>
          <UjFeladatForm
            sites={sites}
            canEdit={canEdit}
            onCreated={async () => {
              await onCreated();
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
