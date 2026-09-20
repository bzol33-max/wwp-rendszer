import { requireSession } from "@/lib/auth/dal";
import { getSoforNap } from "@/lib/fuvarozas/sofor";
import { SoforNapNezet } from "@/components/m/sofor-nap";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireSession();
  const nap = session.employeeId ? await getSoforNap(session.employeeId) : null;
  return <SoforNapNezet nap={nap} ma />;
}
