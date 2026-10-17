import { notFound } from "next/navigation";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getKocsiLap } from "@/lib/fuvarozas2/kocsi-lap";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { KocsiLapNezet } from "@/components/fuvarozas2/kocsi-lap";

export const dynamic = "force-dynamic";

// Fuvarozás 2 · egy kocsi lapja (docs/fuvarozas-2-kor-terv.md, „Kocsi lapja”).
export default async function Page({ params }: { params: Promise<{ kod: string }> }) {
  const { kod: nyers } = await params;
  await requireViewPermission("fuvarozas");
  let kod: string;
  try {
    // A szegmens Next-verziótól függően kódolva vagy dekódolva érkezik — a kódokban nincs „%”.
    kod = (nyers.includes("%") ? decodeURIComponent(nyers) : nyers).trim();
  } catch {
    notFound();
  }
  if (!kod || kod.length > 40) notFound();
  const adat = await getKocsiLap(kod);
  if (!adat) notFound();
  const sofor = adat.maBlokk?.kocsi?.sofor ?? adat.het?.sofor ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2" cim={sofor ? `${sofor} · ${adat.jarmu.kod}` : adat.jarmu.kod} />
      <KocsiLapNezet adat={adat} />
    </div>
  );
}
