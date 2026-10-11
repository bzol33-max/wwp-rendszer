import { cn } from "@/lib/utils";
import type { ArLetra } from "@/lib/fuvarozas2/ar-letra";

// Az árlétra kis táblája (önköltség, +10% minimum, +20%, +30%; Ft és EUR) —
// a Kalkulátor és a Tervezés döntés-panelje közösen használja.

const szam = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n));

export function ArLetraTabla({ letra, arfolyamCimke }: { letra: ArLetra; arfolyamCimke?: string | null }) {
  return (
    <div className="text-sm">
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-b border-foreground/5 py-1.5 text-muted-foreground">
        <span>Önköltség</span>
        <span className="text-right font-mono tabular-nums">{szam(letra.onkoltsegFt)} Ft</span>
        <span className="w-20 text-right font-mono tabular-nums">{letra.onkoltsegEur != null ? `${szam(letra.onkoltsegEur)} €` : "—"}</span>
      </div>
      {letra.fokok.map((f, i) => (
        <div key={f.szazalek} className={cn("grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-b border-foreground/5 py-1.5", i === 0 && "font-bold")}>
          <span>+{f.szazalek}%{i === 0 ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">minimum</span> : null}</span>
          <span className="text-right font-mono tabular-nums">{szam(f.ft)} Ft</span>
          <span className="w-20 text-right font-mono tabular-nums">{f.eur != null ? `${szam(f.eur)} €` : "—"}</span>
        </div>
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Felfelé kerekítve: 1 000 Ft, 10 €.{" "}
        {letra.eurArfolyam != null ? (arfolyamCimke ?? `${letra.eurArfolyam.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} Ft/EUR`) : "Nincs EUR-árfolyam (MNB)."}
      </p>
    </div>
  );
}
