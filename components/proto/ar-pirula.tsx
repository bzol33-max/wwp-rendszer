import type { ArItelet } from "@/lib/proto/artar-alap";

const CIMKE: Record<ArItelet, { c: string; o: string }> = {
  jo: { c: "Jó ár", o: "bg-emerald-100 text-emerald-800" },
  atlagos: { c: "Szokásos ár", o: "bg-primary/10 text-primary" },
  alacsony: { c: "Alacsony ár", o: "bg-red-100 text-red-800" },
  nincs_adat: { c: "Nincs mihez mérni", o: "bg-muted text-muted-foreground" },
};

export function ArPirula({ itelet }: { itelet: ArItelet }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CIMKE[itelet].o}`}>{CIMKE[itelet].c}</span>;
}
