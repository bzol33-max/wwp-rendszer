"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UjFeladatForm } from "@/components/jelenlet/uj-feladat-form";
import type { Site } from "@/lib/jelenlet/shared";

// A feladatrögzítő a fejléc gombja mögé került: a nyitóképen a hely a
// telephelyek feladatlistáié, hogy telephelyenként 8-10 tétel elférjen.
export function UjFeladatGomb({
  sites,
  canEdit,
  onCreated,
}: {
  sites: Site[];
  canEdit: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Feladat rögzítése
      </Button>
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
