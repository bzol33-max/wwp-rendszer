import { requireSession } from "@/lib/auth/dal";
import { getSoforNap } from "@/lib/fuvarozas/sofor";
import { SoforNapNezet } from "@/components/m/sofor-nap";

export const dynamic = "force-dynamic";

function holnapISO() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Budapest" }));
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function Page() {
  const session = await requireSession();
  const nap = session.employeeId ? await getSoforNap(session.employeeId, holnapISO()) : null;
  return <SoforNapNezet nap={nap} ma={false} />;
}
