"use client";

// Ma + hét lap (redesign 5): a „Most dönts” panel gombjai. Csak a MEGLÉVŐ
// szerver-akciókat hívják — ugyanazokat, mint a Tervezés döntés-sávja
// (tervezo-dontes.tsx) és az Elvinni való „Ide” gombja (elvinni-ide-gomb.tsx).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { setFuvarJarmu, torolMegbizast, valtAllapot } from "@/lib/fuvarozas2/megbizasok";
import { kocsihozAdom } from "@/lib/fuvarozas2/sajat-fuvar";
import { cn } from "@/lib/utils";
import { FO_GOMB, MASODLAGOS_GOMB } from "@/components/fuvarozas2/ma-het-stilus";

/** Bejövő bérmegbízás: „Elfogadom · {kocsi} {nap}” (jóváhagyás a legjobb szabad kocsira) és „Elutasítom”. */
export function BejovoGombok({ id, allapot, kocsiKod, cimke }: { id: string; allapot: string; kocsiKod: string | null; cimke: string }) {
  const router = useRouter();
  const [fut, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  function elfogad() {
    if (!kocsiKod) return;
    start(async () => {
      try {
        const k = await setFuvarJarmu(id, kocsiKod);
        if (!k.ok) { toast.error(k.hiba); return; }
        if (allapot === "ellenorzesre_var") {
          const v = await valtAllapot(id, "tervezett", { kliensUuid: crypto.randomUUID() });
          if (!v.ok) { toast.error(`A kocsi rajta, de a jóváhagyás nem sikerült: ${v.hiba}`); router.refresh(); return; }
        }
        toast.success(`Jóváhagyva — ${cimke}.`);
        router.refresh();
      } catch {
        toast.error("Nem sikerült a jóváhagyás.");
      }
    });
  }

  async function elutasit() {
    if (!(await confirm("Biztosan elutasítod? A megbízás törlődik (a napló megmarad)."))) return;
    start(async () => {
      const r = await torolMegbizast(id).catch(() => ({ ok: false as const, hiba: "Nem sikerült a törlés." }));
      if (!r.ok) { toast.error(r.hiba); return; }
      toast.success("Elutasítva.");
      router.refresh();
    });
  }

  return (
    <>
      {kocsiKod ? <button type="button" disabled={fut} onClick={elfogad} className={FO_GOMB}>Elfogadom · {cimke}</button> : null}
      <button type="button" disabled={fut} onClick={elutasit} className={cn(MASODLAGOS_GOMB, "text-[var(--f2-red)]")}>Elutasítom</button>
      {confirmDialog}
    </>
  );
}

/** Rugalmas saját fuvar a szabad kocsira és napra (a meglévő `kocsihozAdom`). */
export function KocsiraGomb({ id, jarmuKod, nap, cimke }: { id: string; jarmuKod: string; nap: string; cimke: string }) {
  const router = useRouter();
  const [fut, start] = useTransition();
  return (
    <button
      type="button"
      disabled={fut}
      className={FO_GOMB}
      onClick={() =>
        start(async () => {
          try {
            const r = await kocsihozAdom(id, { jarmuKod, nap });
            if (!r.ok) { toast.error(r.hiba); return; }
            toast.success(`Kocsira adva: ${cimke}, ${nap.slice(5).replace("-", ".")}. — a sofőr látja`);
            router.refresh();
          } catch {
            toast.error("Nem sikerült.");
          }
        })
      }
    >
      {fut ? "…" : `Kocsira · ${cimke}`}
    </button>
  );
}
