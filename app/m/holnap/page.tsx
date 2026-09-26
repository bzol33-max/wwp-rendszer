import { requireSession } from "@/lib/auth/dal";
import { getSoforNap } from "@/lib/fuvarozas/sofor";
import { budapestHetNapja, budapestNapISO, kovetkezoMunkanapISO } from "@/lib/fuvarozas/idozona";
import { SoforNapNezet } from "@/components/m/sofor-nap";

export const dynamic = "force-dynamic";

// A „Holnap” fül a következő munkanapot mutatja: pénteken és szombaton a
// hétfőt, hogy a sofőr a hétvégén is lássa, mivel indul (2026-09-26). A fül
// feliratát az app/m/layout.tsx ugyanígy váltja.
export default async function Page() {
  const session = await requireSession();
  const most = new Date();
  const hetvege = [5, 6].includes(budapestHetNapja(most));
  const nap = session.employeeId ? await getSoforNap(session.employeeId, kovetkezoMunkanapISO(budapestNapISO(most))) : null;
  return <SoforNapNezet nap={nap} ma={false} cim={hetvege ? "Hétfő" : "Holnap"} />;
}
