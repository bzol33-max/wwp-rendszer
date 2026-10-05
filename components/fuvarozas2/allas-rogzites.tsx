"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { rogzitAllasMegalloHelyekent } from "@/lib/fuvarozas2/ma-vaszon";

/**
 * „Ez a hely” — a GPS-állás koordinátája legyen ennek a megállónak a helye
 * (a Ma oldal kocsi-oszlopában, ha a GPS nem ismerte fel a megállót).
 */
export function AllasRogzitesGomb({ megbizasId, sorszam, lat, lon, varos }: { megbizasId: string; sorszam: number; lat: number; lon: number; varos: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm(`A kocsi itt állt — ez legyen a(z) ${varos} megálló helye?\n\nOnnantól a GPS ide várja ezt a címet.`))) return;
          start(async () => {
            const r = await rogzitAllasMegalloHelyekent(megbizasId, sorszam, lat, lon);
            if (!r.ok) { toast.error(r.hiba); return; }
            toast.success("Rögzítve — a GPS mostantól felismeri ezt a helyet.");
            router.refresh();
          });
        }}
        className="font-semibold text-[var(--f2-blue)] hover:underline disabled:opacity-50"
      >
        Ez a hely
      </button>
      {confirmDialog}
    </>
  );
}
