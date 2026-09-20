import { requireViewPermission } from "@/lib/auth/require-permission";
import {
  getFelvasarlasOsszefoglalo, getHaviKasszaOsszesito, getKeszletFulAdatok, getMaiKiadasok, getNyitottSzamlak,
} from "@/lib/attekintes/actions";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { VezetoiCeg } from "@/components/m/vezeto-ceg";

export const dynamic = "force-dynamic";

// A Cég fül ugyanazokat az Áttekintés-lekérdezéseket használja, amelyek az
// `attekintes` jogot kérik — a vezetői fiók ezt a seedből megkapja
// (grantAttekintesVezetonekOnce, scripts/migrate.mjs).
export default async function Page() {
  await requireViewPermission("fuvarozas");
  const [nyir, havi, maiKiadasok, keszlet, szamlak] = await Promise.all([
    getFelvasarlasOsszefoglalo(),
    getHaviKasszaOsszesito(),
    getMaiKiadasok(),
    getKeszletFulAdatok(),
    getNyitottSzamlak(),
  ]);
  return (
    <VezetoiCeg
      tipusok={nyir.tipusok}
      kassza={nyir.kassza}
      havi={havi}
      maiKiadasok={maiKiadasok}
      keszlet={keszlet}
      szamlak={szamlak}
      ma={budapestNapISO()}
    />
  );
}
