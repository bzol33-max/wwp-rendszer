import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getMegbizasok, type MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import type { Allapot } from "@/lib/fuvarozas/allapot";
import { Fuvarozas2Fulek, formatFt, formatIdo, formatNap } from "@/components/fuvarozas2/kozos";

export const dynamic = "force-dynamic";

const OSZLOPOK: { allapot: Allapot; cim: string; sub: string }[] = [
  { allapot: "teljesitve", cim: "Fotóra vár", sub: "teljesítve, a sofőr fuvarlevél-fotója még nincs" },
  { allapot: "szamlazhato", cim: "Számlázható", sub: "fotó megvan → számla a Számlázz.hu-ban" },
  { allapot: "szamlazva", cim: "Számlázva → e-mail", sub: "számla + okmányok e-mailben a partnernek" },
  { allapot: "email_elment", cim: "E-mail elment → posta", sub: "eredeti papír (Szabina) → postázás" },
  { allapot: "postazva", cim: "Postázva", sub: "lezárásra vár" },
];

export default async function Page() {
  const sorok = await getMegbizasok({ jelleg: "ber", allapotok: OSZLOPOK.map((o) => o.allapot), limit: 500 });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fuvarozás 2 · Elszámolás" subtitle="Bér fuvarok a teljesítéstől a lezárásig — a fotó a számlázhatóság jele, az eredeti papír a postázásé (B7: Szabina)." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/elszamolas" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {OSZLOPOK.map((o) => {
          const lista = sorok.filter((s) => s.allapot === o.allapot);
          return (
            <div key={o.allapot} className="flex flex-col gap-2 rounded-xl bg-muted/30 p-2 ring-1 ring-foreground/10">
              <div className="px-1">
                <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">{o.cim}</span><span className="text-xs tabular-nums text-muted-foreground">{lista.length}</span></div>
                <div className="text-[11px] text-muted-foreground">{o.sub}</div>
              </div>
              {lista.map((s) => <Kartya key={s.id} s={s} />)}
              {lista.length === 0 ? <p className="px-1 py-3 text-xs text-muted-foreground">—</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kartya({ s }: { s: MegbizasSor }) {
  return (
    <Link href={`/fuvarozas2/megbizasok/${s.id}`} className="flex flex-col gap-1 rounded-lg bg-card p-2 text-xs ring-1 ring-foreground/10 hover:ring-foreground/30">
      <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{s.partner_nev ?? "(nincs megbízó)"}</span><span className="tabular-nums text-muted-foreground">{formatNap(s.lerakas_nap)}</span></div>
      <div className="truncate text-muted-foreground">{s.hivatkozas ?? "—"} · {s.jarmu_kod ?? "—"}</div>
      <div className="truncate">{s.felrako ?? "—"} → {s.lerako ?? "—"}</div>
      <div className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span className="tabular-nums">{formatFt(s.fuvardij, s.fuvardij_penznem)}</span>
        {s.szamla_szam ? <span>· {s.szamla_szam}</span> : null}
        {s.papirok_beerkeztek_at ? <span>· papír ✓</span> : s.allapot === "email_elment" ? <span className="text-[var(--f2-amb)]">· papír hiányzik</span> : null}
        {s.email_elment_at ? <span>· e-mail {formatIdo(s.email_elment_at)}</span> : null}
      </div>
    </Link>
  );
}
