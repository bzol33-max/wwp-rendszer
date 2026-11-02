import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { ProtoNav } from "@/components/proto/nav";

export const metadata = { title: "WWP új rendszer · prototípus" };

export default async function ProtoLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-background pb-20 text-foreground md:pb-8">
      <ProtoNav />
      <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-6">
        <b>Prototípus.</b> Élő adatokból dolgozik. A Döntés lap Elfogadom, Elutasítom és Kocsira adom gombja élesben végrehajt, minden más csak nézet. Számolási feltételezések: egy kocsin egyszerre egy megbízás, sofőr 850 000 Ft/hó, kocsi fix költség 0 Ft, ezért a nettó a valósnál jobb.{" "}
        <Link href="/fuvarozas2" className="underline md:hidden">Vissza az apphoz</Link>
      </div>
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:px-6">{children}</main>
    </div>
  );
}
