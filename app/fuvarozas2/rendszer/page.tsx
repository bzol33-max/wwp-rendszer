import { PageHeader } from "@/components/layout/page-header";
import { getRendszerEgeszseg, type EgeszsegAllapot } from "@/lib/fuvarozas2/rendszer";
import { formatIdo} from "@/components/fuvarozas2/kozos";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SZIN: Record<EgeszsegAllapot, string> = {
  rendben: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  figyelmeztetes: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  gond: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  nincs_adat: "bg-muted text-muted-foreground",
};
const CIMKE: Record<EgeszsegAllapot, string> = {
  rendben: "rendben", figyelmeztetes: "figyelj", gond: "gond", nincs_adat: "nincs adat",
};

export default async function Page() {
  const e = await getRendszerEgeszseg();
  const gond = e.sorok.filter((s) => s.allapot === "gond").length;
  const figy = e.sorok.filter((s) => s.allapot === "figyelmeztetes").length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás 2 · Rendszer"
        subtitle={gond === 0 && figy === 0 ? "Minden figyelő és kapu rendben." : `${gond} gond · ${figy} figyelmeztetés — alább, melyik.`}
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/rendszer" />
      <div className="grid gap-3 md:grid-cols-2">
        {e.sorok.map((s) => (
          <div key={s.kulcs} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.cim}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SZIN[s.allapot])}>{CIMKE[s.allapot]}</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{s.ertek}</div>
            {s.reszlet ? <div className="text-sm text-muted-foreground">{s.reszlet}</div> : null}
            {s.utoljara ? <div className="mt-1 text-xs text-muted-foreground">utolsó: {formatIdo(s.utoljara)}</div> : null}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Frissítve: {formatIdo(e.frissitve)} — az oldal újratöltésével frissül.</p>
    </div>
  );
}
