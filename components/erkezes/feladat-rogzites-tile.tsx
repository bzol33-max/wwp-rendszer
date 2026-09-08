"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UjFeladatForm } from "@/components/jelenlet/uj-feladat-form";
import type { Site } from "@/lib/jelenlet/shared";

// Kompakt csempe a mobil saját nézet felső sorában — koppintásra megnyitja
// az új feladat felvételét (ugyanaz az űrlap, mint a Jelenlét admin nézeten).
export function FeladatRogzitesTile({
  sites,
  onCreated,
}: {
  sites: Site[];
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2.5 text-center"
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
            canEdit
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
