import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/dal";
import { getMegbizas, getMegbizasokVaszon } from "@/lib/fuvarozas2/megbizasok";
import { ALLAPOTOK, LEPESEK, type Allapot, type Lepes } from "@/lib/fuvarozas/allapot";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MegbizasSzuroSav, MegbizasTabla, type SzuroErtekek } from "@/components/fuvarozas2/megbizas-vaszon";
import { MegbizasReszlet } from "@/components/fuvarozas2/megbizas-reszlet";

export const dynamic = "force-dynamic";

// A régi „csoport" paraméter (Ma-képernyő linkjei) leképezése az új állapot-szűrőre.
const CSOPORT_ALLAPOT: Record<string, Allapot> = {
  ellenorzes: "ellenorzesre_var",
  folyamatban: "folyamatban",
  elszamolas: "szamlazhato",
  lezart: "lezart",
};

export default async function Page({ searchParams }: {
  searchParams: Promise<{ jelleg?: string; allapot?: string; lepes?: string; jarmu?: string; idoszak?: string; reszlet?: string; csoport?: string; partner?: string }>;
}) {
  const sp = await searchParams;
  const allapotParam = sp.allapot ?? (sp.csoport ? CSOPORT_ALLAPOT[sp.csoport] : undefined);
  const allapot = (ALLAPOTOK as readonly string[]).includes(allapotParam ?? "") ? (allapotParam as Allapot) : undefined;
  const lepes = LEPESEK.some((l) => l.kulcs === sp.lepes) ? (sp.lepes as Lepes) : undefined;
  const jelleg = sp.jelleg === "ber" || sp.jelleg === "sajat" ? sp.jelleg : undefined;
  const idoszak = ["ez_a_het", "mult_het", "regebbi"].includes(sp.idoszak ?? "") ? (sp.idoszak as "ez_a_het" | "mult_het" | "regebbi") : undefined;
  const szuro: SzuroErtekek = { jelleg, allapot, lepes, jarmu: sp.jarmu, idoszak, reszlet: sp.reszlet };

  const { sorok, ma, szamok } = await getMegbizasokVaszon({ jelleg, allapot, lepes, jarmu: sp.jarmu, partner: sp.partner, idoszak });

  const session = await requireSession();
  const reszlet = sp.reszlet && /^\d+$/.test(sp.reszlet) ? await getMegbizas(sp.reszlet) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Megbízások" subtitle="Megérkezik → sofőr viszi → visszaér, számlázni → számlázva, postára → kész. Az utolsó oszlop mondja meg, mi a következő teendő." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/megbizasok" />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <MegbizasSzuroSav szuro={szuro} szamok={szamok} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <MegbizasTabla sorok={sorok} ma={ma} szuro={szuro} />
          {reszlet ? (
            <div id="reszlet" className="scroll-mt-4">
              <MegbizasReszlet
                {...reszlet}
                szerkeszthet={session.can("fuvarozas").edit || session.can("elszamolas").edit}
                elszamolasJog={session.can("elszamolas").edit || session.can("fuvarozas").edit}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-foreground/15 px-4 py-6 text-center text-sm text-muted-foreground">
              Kattints egy megbízóra — a részletei (megállók, iratok, elszámolás, napló, műveletek) ide nyílnak.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
