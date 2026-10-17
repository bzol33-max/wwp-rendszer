import { getEredmeny } from "@/lib/fuvarozas2/eredmeny";
import { getBerOsszesitok } from "@/lib/fuvarozas2/ma-vaszon";
import { getKihasznaltsag } from "@/lib/fuvarozas2/kihasznaltsag";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { Csempesor } from "@/components/fuvarozas2/csempesor";
import { EredmenyNezet } from "@/components/fuvarozas2/eredmeny-nezet";

export const dynamic = "force-dynamic";

// Pénz → Áttekintés (2026-10-17, 2. kör): felül a bérfuvar-csempék és a
// kocsinkénti kihasználtság (a Ma lapról ide került), alatta az Eredmény-áttekintés.
export default async function Page({ searchParams }: { searchParams: Promise<{ idoszak?: string }> }) {
  const sp = await searchParams;
  const [adat, ber, kihasznaltsag] = await Promise.all([
    getEredmeny(sp.idoszak),
    getBerOsszesitok(),
    getKihasznaltsag(budapestNapISO()),
  ]);
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/eredmeny" cim="Pénz" />
      <Csempesor berHavi={ber.berHavi} berHeti={ber.berHeti} berHonapHetei={ber.berHonapHetei} kihasznaltsag={kihasznaltsag} />
      <EredmenyNezet adat={adat} />
    </div>
  );
}
