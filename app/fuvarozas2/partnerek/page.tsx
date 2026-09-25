import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/dal";
import { getPartnerek, getOsszevonasJavaslatok } from "@/lib/fuvarozas2/partnerek";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { PartnerekNezet } from "@/components/fuvarozas2/partnerek";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ nyit?: string }> }) {
  const { nyit } = await searchParams;
  const session = await requireSession();
  const [partnerek, javaslatok] = await Promise.all([getPartnerek(), getOsszevonasJavaslatok()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Partnerek" subtitle="Megbízók törzse: fizetési és papír-határidő, számlázási e-mail, postázási cím, számlán kért szám. Az E5 összevonás itt." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/partnerek" />
      <PartnerekNezet partnerek={partnerek} javaslatok={javaslatok} szerkeszthet={session.can("fuvarozas").edit} nyit={nyit && /^\d+$/.test(nyit) ? nyit : undefined} />
    </div>
  );
}
