import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { ALLAPOTOK, type Allapot } from "@/lib/fuvarozas/allapot";
import { Fuvarozas2Fulek, ALLAPOT_CIMKE } from "@/components/fuvarozas2/kozos";
import { MegbizasLista } from "@/components/fuvarozas2/megbizas-lista";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CSOPORTOK: { kulcs: string; cimke: string; allapotok: Allapot[] }[] = [
  { kulcs: "folyamatban", cimke: "Folyamatban", allapotok: ["tervezett", "folyamatban"] },
  { kulcs: "ellenorzes", cimke: "Ellenőrzésre vár", allapotok: ["ellenorzesre_var"] },
  { kulcs: "elszamolas", cimke: "Elszámolás alatt", allapotok: ["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva"] },
  { kulcs: "lezart", cimke: "Lezárt", allapotok: ["lezart"] },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ csoport?: string; allapot?: string; jelleg?: string }> }) {
  const sp = await searchParams;
  const allapot = (ALLAPOTOK as readonly string[]).includes(sp.allapot ?? "") ? (sp.allapot as Allapot) : null;
  const csoport = CSOPORTOK.find((c) => c.kulcs === sp.csoport) ?? (allapot ? null : CSOPORTOK[0]);
  const jelleg = sp.jelleg === "ber" || sp.jelleg === "sajat" ? sp.jelleg : undefined;
  const sorok = await getMegbizasok({ allapotok: allapot ? [allapot] : csoport?.allapotok, jelleg, limit: 300 });
  const link = (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `/fuvarozas2/megbizasok?${p.toString()}`;
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Megbízások" subtitle="Egy lista, állapot-szűrővel. A sor a részletre visz: megállók, napló, elszámolás, műveletek." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/megbizasok" />
      <div className="flex flex-wrap items-center gap-1">
        {CSOPORTOK.map((c) => (
          <Link key={c.kulcs} href={link({ csoport: c.kulcs, jelleg })} className={cn("rounded-md px-3 py-1 text-sm", csoport?.kulcs === c.kulcs && !allapot ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{c.cimke}</Link>
        ))}
        {allapot ? <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">{ALLAPOT_CIMKE[allapot]}</span> : null}
        <span className="mx-2 text-muted-foreground">|</span>
        {[["", "mind"], ["ber", "bér"], ["sajat", "saját"]].map(([v, c]) => (
          <Link key={v} href={link({ csoport: csoport?.kulcs, allapot: allapot ?? undefined, jelleg: v || undefined })} className={cn("rounded-md px-3 py-1 text-sm", (jelleg ?? "") === v ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{c}</Link>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{sorok.length} sor</span>
      </div>
      <MegbizasLista sorok={sorok} />
    </div>
  );
}
