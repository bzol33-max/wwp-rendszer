"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { elfogadPartnerJavaslatot, elvetPartnerJavaslatot, setPartnerPostazasiCim, type PartnerAdatJavaslat } from "@/lib/fuvarozas2/partnerek";
import { JAVASLAT_CIMKE } from "@/lib/fuvarozas2/partner-javaslat-alap";

const FORRAS: Record<string, string> = { megbizas_pdf: "megbízásból", szamla: "korábbi számláról" };

/** Egy javaslat a partner hiányzó adatára: „Átveszem” a partner-törzsbe írja, „Elvetem” eltünteti. */
export function AdatJavaslatSor({ j, szerkeszthet, mezoNelkul = false }: { j: PartnerAdatJavaslat; szerkeszthet: boolean; mezoNelkul?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const dont = (fn: () => Promise<{ ok: true } | { ok: false; hiba: string }>, uzenet: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { toast.error(r.hiba); return; }
        toast.success(uzenet);
        router.refresh();
      } catch {
        toast.error("Nem sikerült.");
      }
    });
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-[var(--f2-amb-l)] px-2.5 py-1.5 text-sm">
      {mezoNelkul ? <span className="text-xs text-muted-foreground">Javaslat:</span> : <span className="text-xs text-muted-foreground">{JAVASLAT_CIMKE[j.mezo]}:</span>}
      <b className="min-w-0 break-words">{j.ertek}</b>
      <span className="text-[11px] text-muted-foreground">
        {FORRAS[j.forras] ?? j.forras}{j.forras_leiras ? ` · ${j.forras_leiras}` : ""}
      </span>
      {szerkeszthet ? (
        <span className="ml-auto flex gap-1">
          <Button size="xs" disabled={pending} onClick={() => dont(() => elfogadPartnerJavaslatot(j.id), "Átvéve a partner adataiba")}>Átveszem</Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => dont(() => elvetPartnerJavaslatot(j.id), "Elvetve")}>Elvetem</Button>
        </span>
      ) : null}
    </div>
  );
}

/** Új partner, nincs postacím és javaslat sincs: itt helyben beírható (a partner-törzsbe kerül). */
export function PostacimBevitel({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cim, setCim] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--f2-amb)]">Hiányzik — egyszer kell megadni, a partner minden fuvarjára érvényes.</span>
      <div className="flex gap-2">
        <Input value={cim} onChange={(e) => setCim(e.target.value)} placeholder="irányítószám, település, utca, házszám" disabled={pending} />
        <Button size="sm" variant="secondary" disabled={pending || cim.trim().length < 5}
          onClick={() => start(async () => {
            try {
              const r = await setPartnerPostazasiCim(partnerId, cim);
              if (!r.ok) { toast.error(r.hiba); return; }
              toast.success("Postázási cím mentve a partnerhez");
              router.refresh();
            } catch {
              toast.error("Nem sikerült menteni.");
            }
          })}>
          Ment
        </Button>
      </div>
    </div>
  );
}
