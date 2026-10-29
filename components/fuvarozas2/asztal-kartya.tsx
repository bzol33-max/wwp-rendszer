import Link from "next/link";
import { formatFt, formatNap } from "@/components/fuvarozas2/kozos";
import { megbizasCim, utolsoVaros, varos } from "@/lib/megbizasok/megjelenites";
import { kovetkezoTeendo } from "@/lib/fuvarozas2/megbizas-szuro";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import type { PenzJel } from "@/lib/fuvarozas2/penz-lista-alap";
import { cn } from "@/lib/utils";

// A Megbízások asztali életút-tábla kártyája (redesign 4, R1 terv). A közös
// MegbizasKartya (mobil, Ma, kimutatás) érintetlen; ez csak az asztali oszlopoké.

export function AsztalKartya({
  sor,
  ma,
  href,
  penzJel = null,
}: {
  sor: MunkaasztalSor;
  ma: string;
  href: string;
  /** A legsürgősebb pénz-teendő (lejárt / papír / számlázatlan), ha van. */
  penzJel?: PenzJel | null;
}) {
  const ber = sor.jelleg === "ber";
  const utemezett = sor.elokeszites && !sor.idopont_nyitott && !!sor.elokeszites_jarmu;
  const teendo = utemezett
    ? { szoveg: `ütemezve: ${sor.elokeszites_jarmu} · ${formatNap(sor.felrakas_nap)}`, surgos: false }
    : sor.elokeszites
      ? { szoveg: "előkészítés · kocsira adható", surgos: !sor.elokeszites_jarmu || !sor.felrako || !sor.lerako }
      : kovetkezoTeendo(sor, ma);
  const kocsi = sor.jarmu_cimke ?? sor.jarmu_kod ?? sor.elokeszites_jarmu;
  const utvonal = `${varos(sor.felrako)} → ${utolsoVaros(sor.lerako)}`;

  // Állapot-üzenet: a pénz-jel (lejárt / papír / számlázatlan) elöl, különben a következő teendő.
  const allapot = penzJel
    ? { szoveg: penzJel.szoveg, osztaly: penzJel.szin === "red" ? "text-destructive" : "text-warning" }
    : { szoveg: teendo.szoveg, osztaly: teendo.surgos ? "text-destructive" : "text-muted-foreground" };

  return (
    <Link
      href={href}
      scroll={false}
      className="lift block rounded-xl bg-card p-3 text-sm shadow-[var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">#{sor.id}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            ber ? "bg-secondary text-secondary-foreground" : "bg-success/15 text-success"
          )}
        >
          {ber ? "Bér" : "Saját"}
        </span>
        <span className="ml-auto tabular-nums text-muted-foreground">{formatNap(sor.felrakas_nap)}</span>
      </div>
      <strong className="mt-1.5 block truncate text-sm font-semibold">{megbizasCim(sor)}</strong>
      <span className="mt-0.5 block truncate text-muted-foreground">{utvonal}</span>
      <div className="mt-1.5 flex items-baseline gap-x-2 text-xs">
        <span className={cn("shrink-0", !kocsi && "text-muted-foreground")}>{kocsi ?? "nincs kocsi"}</span>
        {ber ? <span className="shrink-0 font-semibold tabular-nums">{formatFt(sor.fuvardij, sor.fuvardij_penznem)}</span> : null}
        {sor.hivatkozas ? <span className="min-w-0 truncate font-mono text-muted-foreground">{sor.hivatkozas}</span> : null}
      </div>
      <div className={cn("mt-1.5 text-xs font-medium", allapot.osztaly)}>{allapot.szoveg}</div>
    </Link>
  );
}
