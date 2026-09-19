import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/dal";
import { getMegbizas } from "@/lib/fuvarozas2/megbizasok";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/kozos";
import { MegbizasReszlet } from "@/components/fuvarozas2/megbizas-reszlet";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const session = await requireSession();
  const adat = await getMegbizas(id);
  if (!adat) notFound();
  const szerkeszthet = session.can("fuvarozas").edit || session.can("elszamolas").edit;
  const elszamolasJog = session.can("elszamolas").edit || session.can("fuvarozas").edit;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Megbízás #${id}`} actions={<Link href="/fuvarozas2/megbizasok" className="text-sm underline">← vissza a listához</Link>} />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/megbizasok" />
      <MegbizasReszlet {...adat} szerkeszthet={szerkeszthet} elszamolasJog={elszamolasJog} />
    </div>
  );
}
