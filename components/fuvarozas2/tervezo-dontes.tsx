"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { setFuvarJarmu, torolMegbizast, valtAllapot } from "@/lib/fuvarozas2/megbizasok";

// A Tervezés döntés-sávja: jóváhagyás a kiválasztott kocsira, ajánlat-szöveg
// más árral (vágólapra — a Gmail-piszkozat későbbi kör), elutasítás.

const NAPNEV = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];

export function DontesSav({ id, allapot, kocsiKod, kocsiNev, felrakasNap, celarFt, ajanlatAlap }: {
  id: string;
  allapot: string;
  kocsiKod: string | null;
  kocsiNev: string | null;
  felrakasNap: string;
  celarFt: number | null;
  /** Az ajánlat-szöveg útvonala és hivatkozása. */
  ajanlatAlap: { ut: string; hivatkozas: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [ar, setAr] = useState(celarFt ? String(celarFt) : "");
  const [szovegNyitva, setSzovegNyitva] = useState(false);
  const nap = NAPNEV[new Date(`${felrakasNap}T12:00:00Z`).getUTCDay()];
  const arSzam = Number(ar.replace(/\s/g, ""));
  const szoveg =
    `Tisztelt Partnerünk!\n\nKöszönjük a megkeresést. A(z) ${ajanlatAlap.ut} fuvart` +
    ` (${ajanlatAlap.hivatkozas ? `${ajanlatAlap.hivatkozas}, ` : ""}felrakás ${felrakasNap.slice(5, 7)}.${felrakasNap.slice(8, 10)}.) ` +
    `${arSzam > 0 ? new Intl.NumberFormat("hu-HU").format(arSzam) : "…"} Ft + ÁFA áron tudjuk vállalni.\n\nÜdvözlettel:\nWell-Worn Pallet Kft.`;

  function jovahagy() {
    if (!kocsiKod) return;
    start(async () => {
      try {
        const k = await setFuvarJarmu(id, kocsiKod);
        if (!k.ok) { toast.error(k.hiba); return; }
        if (allapot === "ellenorzesre_var") {
          const v = await valtAllapot(id, "tervezett", { kliensUuid: crypto.randomUUID() });
          if (!v.ok) { toast.error(`A kocsi rajta, de a jóváhagyás nem sikerült: ${v.hiba}`); router.refresh(); return; }
        }
        toast.success(`Jóváhagyva — ${kocsiNev ?? kocsiKod}, ${nap}.`);
        router.push("/fuvarozas2/tervezes", { scroll: false });
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
      router.push("/fuvarozas2/tervezes", { scroll: false });
      router.refresh();
    });
  }

  async function masol() {
    try {
      await navigator.clipboard.writeText(szoveg);
      toast.success("Az ajánlat a vágólapon — illeszd be a válaszlevélbe.");
    } catch {
      toast.error("Nem sikerült a vágólapra tenni — jelöld ki és másold kézzel.");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !kocsiKod} onClick={jovahagy}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-45">
          {kocsiKod ? `✓ Jóváhagyom → ${kocsiNev ?? kocsiKod}, ${nap}` : "Válassz kocsit a jóváhagyáshoz"}
        </button>
        <button type="button" disabled={pending} onClick={() => setSzovegNyitva((x) => !x)}
          className="rounded-lg border border-foreground/15 px-3 py-2 text-sm font-semibold hover:bg-muted">
          Visszaírok más árral…
        </button>
        <button type="button" disabled={pending} onClick={elutasit}
          className="rounded-lg border border-foreground/15 px-3 py-2 text-sm font-semibold text-[var(--f2-red)] hover:bg-muted">
          Elutasítom
        </button>
      </div>
      {szovegNyitva ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            Ár (Ft + ÁFA):
            <input value={ar} onChange={(e) => setAr(e.target.value)} inputMode="numeric" className="w-36 rounded-lg border border-foreground/15 bg-background px-3 py-1.5 text-sm" />
            {celarFt ? <span className="text-xs text-muted-foreground">javasolt (8% árrés): {new Intl.NumberFormat("hu-HU").format(celarFt)} Ft</span> : null}
          </label>
          <textarea readOnly rows={7} value={szoveg} aria-label="Ajánlat-szöveg" className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 font-sans text-sm" />
          <button type="button" onClick={masol} className="self-start rounded-lg bg-[var(--f2-blue)] px-3 py-1.5 text-sm font-bold text-white">Másolás a vágólapra</button>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}
