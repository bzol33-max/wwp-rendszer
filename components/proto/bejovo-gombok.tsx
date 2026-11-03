"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { torolMegbizast } from "@/lib/fuvarozas2/megbizasok";

/** Az elfogadás az ellenőrző lapra visz; az elutasítás a meglévő törlést hívja, megerősítéssel. */
export function BejovoSor({ id, nev, kiemelt }: { id: string; nev: string; kiemelt: boolean }) {
  const router = useRouter();
  const [fut, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const elutasit = async () => {
    if (!(await confirm(`Biztosan elutasítod ezt: ${nev}? A megbízás törlődik, a napló megmarad.`))) return;
    start(async () => {
      const r = await torolMegbizast(id).catch(() => ({ ok: false as const, hiba: "Nem sikerült az elutasítás." }));
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success("Elutasítva.");
      router.refresh();
    });
  };
  return (
    <span className="gomb">
      <button type="button" disabled={fut} onClick={elutasit} className="btn mini" aria-label={`Elutasítom: ${nev}`}>Elutasítom</button>
      <Link href={`/fuvarozas2/tervezes?m=${id}`} className={`btn mini ${kiemelt ? "f" : ""}`} style={{ lineHeight: "22px" }} aria-label={`Ellenőrzöm: ${nev}`}>Ellenőrzöm</Link>
      {confirmDialog}
    </span>
  );
}
