import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatFt, formatNap } from "@/components/fuvarozas2/kozos";
import { megbizasCim, megalloDb, utolsoVaros, varos } from "@/lib/megbizasok/megjelenites";
import { utSzakaszai } from "@/lib/fuvarozas2/munkaasztal";
import { kovetkezoTeendo } from "@/lib/fuvarozas2/megbizas-szuro";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";
import { cn } from "@/lib/utils";

export function MegbizasKartya({
  sor,
  ma,
  href,
  tipus = false,
}: {
  sor: MunkaasztalSor;
  ma: string;
  href: string;
  tipus?: boolean;
}) {
  const utemezett = sor.elokeszites && !sor.idopont_nyitott && !!sor.elokeszites_jarmu;
  const teendo = utemezett
    ? { szoveg: `ütemezve: ${sor.elokeszites_jarmu} · ${formatNap(sor.felrakas_nap)} — kocsira adható`, surgos: false }
    : sor.elokeszites
      ? { szoveg: "előkészítés · kocsira adható", surgos: !sor.elokeszites_jarmu || !sor.felrako || !sor.lerako }
      : kovetkezoTeendo(sor, ma);
  const megallo = Math.max(megalloDb(sor.felrako), megalloDb(sor.lerako));
  const ut = utSzakaszai(sor.jelleg, sor.szakasz);
  const szakaszIndex = ut.indexOf(sor.szakasz);
  const kocsi = sor.jarmu_cimke ?? sor.jarmu_kod ?? sor.elokeszites_jarmu;

  return (
    <Link
      href={href}
      scroll={false}
      className="block min-h-11 rounded-2xl border border-foreground/10 bg-card p-3 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-[var(--f2-blue)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        {tipus ? <Badge variant="secondary" className="text-[10px]">{sor.jelleg === "ber" ? "Bér" : "Saját"}</Badge> : null}
        <strong>{megbizasCim(sor)}</strong>
        <span className="text-muted-foreground">·</span>
        <span>{varos(sor.felrako)} → {utolsoVaros(sor.lerako)}{megallo > 2 ? ` · ${megallo} megálló` : ""}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatNap(sor.felrakas_nap)} → {formatNap(sor.lerakas_nap)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className={cn(teendo.surgos ? "font-bold text-[var(--f2-red)]" : "text-muted-foreground")}>
          {teendo.szoveg}
        </span>
        {kocsi ? <><span>·</span><span>{kocsi}</span></> : null}
        {sor.jelleg === "ber" ? <><span>·</span><span>{formatFt(sor.fuvardij, sor.fuvardij_penznem)}</span></> : null}
        {sor.hivatkozas ? <><span>·</span><span className="font-mono text-[10px]">{sor.hivatkozas}</span></> : null}
      </div>
      <div className="mt-2 flex gap-1" aria-label={`Szakasz: ${sor.szakasz}`}>
        {ut.map((szakasz, i) => (
          <i
            key={szakasz}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < szakaszIndex || sor.szakasz === "archiv"
                ? "bg-[var(--f2-mint)]"
                : i === szakaszIndex
                  ? "bg-[var(--f2-blue)]"
                  : "bg-foreground/10"
            )}
          />
        ))}
      </div>
    </Link>
  );
}
