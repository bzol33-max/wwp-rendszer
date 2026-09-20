import { requireViewPermission } from "@/lib/auth/require-permission";
import { getMaAdat } from "@/lib/fuvarozas2/ma";
import { getMegbizasok } from "@/lib/fuvarozas2/megbizasok";
import { getLevelek } from "@/lib/fuvarozas2/levelek";
import { getNaplo } from "@/lib/fuvarozas2/naplo";
import { VezetoiFuvar } from "@/components/m/vezeto";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireViewPermission("fuvarozas");
  const [adat, ellenorzesre, levelek, naplo] = await Promise.all([
    getMaAdat(),
    getMegbizasok({ allapotok: ["ellenorzesre_var"], limit: 100 }),
    getLevelek({ allapot: "uj", osztalyok: ["megbizas", "modositas", "adatkeres", "okmanykeres", "papirok"], limit: 50 }),
    getNaplo(60),
  ]);
  return (
    <VezetoiFuvar
      holnap={adat.kocsik.map((k) => ({ kod: k.kod, cimke: k.cimke, sofor: k.sofor, sorok: k.holnap }))}
      kocsiNelkulHolnap={adat.kocsiNelkul}
      ellenorzesre={ellenorzesre}
      levelek={levelek}
      naplo={naplo}
    />
  );
}
