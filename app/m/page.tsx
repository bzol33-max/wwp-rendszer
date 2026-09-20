import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/dal";
import { getSoforNap } from "@/lib/fuvarozas/sofor";
import { getMaAdat } from "@/lib/fuvarozas2/ma";
import { SoforNapNezet } from "@/components/m/sofor-nap";
import { VezetoiMa } from "@/components/m/vezeto";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireSession();
  const sofor = session.can("fuvarozas_sajat").view && !!session.employeeId;
  if (sofor) {
    const nap = session.employeeId ? await getSoforNap(session.employeeId) : null;
    return <SoforNapNezet nap={nap} ma />;
  }
  // Vezetői fiók: eltérések + kocsik. Irodai (csak elszámolás) fiók a Papírral kezd.
  if (session.can("fuvarozas").view) return <VezetoiMa adat={await getMaAdat()} />;
  if (session.can("elszamolas").view) redirect("/m/papir");
  return null;
}
