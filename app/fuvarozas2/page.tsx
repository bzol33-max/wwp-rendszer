import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMaAdat } from "@/lib/fuvarozas2/ma";
import { ALLAPOT_CIMKE, AllapotBadge, formatNap} from "@/components/fuvarozas2/kozos";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MegbizasLista } from "@/components/fuvarozas2/megbizas-lista";
import type { Allapot } from "@/lib/fuvarozas/allapot";

export const dynamic = "force-dynamic";

const SULY: Record<string, string> = {
  sulyos: "border-[var(--f2-red)] bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  figyelmeztetes: "border-[var(--f2-amb)] bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  info: "border-[var(--f2-blue)] bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
};

export default async function Page() {
  const a = await getMaAdat();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Ma" subtitle={`${a.ma} — az új modell (állapotgép, megállók, elszámolás). A régi Fuvarozás a cutoverig változatlan.`} />
      <Fuvarozas2Fulek aktiv="/fuvarozas2" />

      <div className="flex flex-wrap gap-2">
        {a.jelzesek.length === 0 ? <p className="text-sm text-muted-foreground">Nincs nyitott jelzés.</p> : null}
        {a.jelzesek.map((j) => (
          <Link key={j.kulcs} href={j.href} className={`rounded-lg border px-3 py-2 text-sm ${SULY[j.sulyossag]}`}>
            <span className="text-lg font-semibold tabular-nums">{j.darab}</span> {j.szoveg}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {a.kocsik.map((k) => (
          <Card key={k.kod}>
            <CardHeader>
              <CardTitle className="text-base">{k.cimke}{k.sofor ? <span className="ml-2 font-normal text-muted-foreground">{k.sofor}</span> : null}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <KocsiNap cim={`Ma · ${formatNap(a.ma)}`} sorok={k.ma} />
              <KocsiNap cim={`Holnap · ${formatNap(a.holnap)}`} sorok={k.holnap} />
            </CardContent>
          </Card>
        ))}
      </div>

      {a.kocsiNelkul.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">Kocsi nélkül — ma/holnap</CardTitle></CardHeader>
          <CardContent><MegbizasLista sorok={a.kocsiNelkul} /></CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Nyitott megbízások állapot szerint</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(Object.keys(ALLAPOT_CIMKE) as Allapot[]).filter((x) => x !== "lezart").map((x) => {
            const n = a.allapotSzamok.find((s) => s.allapot === x)?.n ?? 0;
            return <Link key={x} href={`/fuvarozas2/megbizasok?allapot=${x}`} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm"><AllapotBadge allapot={x} /><span className="tabular-nums">{n}</span></Link>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function KocsiNap({ cim, sorok }: { cim: string; sorok: { id: string; partner_nev: string | null; felrako: string | null; lerako: string | null; allapot: Allapot; hivatkozas: string | null }[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{cim}</div>
      {sorok.length === 0 ? <p className="text-muted-foreground">üres — fuvar kell</p> : null}
      {sorok.map((s) => (
        <Link key={s.id} href={`/fuvarozas2/megbizasok/${s.id}`} className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-muted/40">
          <div className="flex items-center gap-2"><span className="font-medium">{s.partner_nev ?? "(nincs megbízó)"}</span><span className="text-xs text-muted-foreground">{s.hivatkozas ?? ""}</span><AllapotBadge allapot={s.allapot} className="ml-auto" /></div>
          <div className="truncate text-xs text-muted-foreground">{s.felrako ?? "—"} → {s.lerako ?? "—"}</div>
        </Link>
      ))}
    </div>
  );
}
