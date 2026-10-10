import { cn } from "@/lib/utils";
import { formatFt } from "@/components/fuvarozas2/kozos";
import type { Forras, Tetel } from "@/lib/fuvarozas2/koltseg-szamitas";

// Tény / becslés felirat a Kimutatás és a Költségek számai mellé (5. fázis):
// menta = tény (mért, számlázott), borostyán = becslés. Szerver- és
// kliens-komponensből is használható (nincs állapota).

export function ForrasJel({ forras, className }: { forras: Forras | null | undefined; className?: string }) {
  if (!forras) return null;
  return (
    <span
      className={cn(
        "inline-block rounded px-1 py-px align-middle text-[10px] font-medium leading-tight",
        forras === "teny" ? "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]" : "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
        className
      )}
      title={forras === "teny" ? "Tény: mért vagy számlázott adat" : "Becslés: számított érték"}
    >
      {forras === "teny" ? "tény" : "becslés"}
    </span>
  );
}

/** Egy költségtétel: összeg + tény/becslés jel, a részletek a súgóban. */
export function TetelErtek({ tetel, ures = "—" }: { tetel: Tetel | null | undefined; ures?: string }) {
  if (!tetel) return <span className="text-muted-foreground">{ures}</span>;
  const jelzo = tetel.kezi ? "kézi" : tetel.felosztva ? "felosztva" : null;
  return (
    <span title={tetel.megjegyzes} className="whitespace-nowrap tabular-nums">
      {formatFt(tetel.ft)} <ForrasJel forras={tetel.forras} />
      {jelzo ? <span className="block text-[10px] font-normal text-muted-foreground">{jelzo}</span> : null}
    </span>
  );
}
