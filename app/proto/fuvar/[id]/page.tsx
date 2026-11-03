import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { ALLAPOT_CIMKE } from "@/lib/megbizasok/allapotgep";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import { napCimke, szam } from "@/components/proto/format";

function Sor({ c, children }: { c: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-2 text-sm"><span className="text-muted-foreground">{c}</span><span className="text-right tabular-nums">{children}</span></div>
  );
}

export default async function ProtoFuvar({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [f] = await query<MegbizasSor>(`${SOR_SQL} where m.id = $1`, [id]);
  if (!f) notFound();
  const [sz] = f.szamla_szam
    ? await query<{ fizetve: boolean; hatarido: string | null }>(`select fizetve, fizetesi_hatarido::text as hatarido from szamla where szamlaszam = $1`, [f.szamla_szam])
    : [];
  const ma = budapestNapISO();
  const kesett = sz && !sz.fizetve && sz.hatarido && sz.hatarido < ma
    ? Math.round((new Date(`${ma}T12:00:00Z`).getTime() - new Date(`${sz.hatarido}T12:00:00Z`).getTime()) / 86_400_000)
    : null;
  return (
    <article className="mx-auto grid w-full max-w-xl gap-1 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-semibold">{f.partner_nev ?? f.kitol ?? "Saját"}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</h1>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ALLAPOT_CIMKE[f.allapot] ?? f.allapot}</span>
      </div>
      <p className="text-sm">{f.felrako ?? "Nincs felrakó"} → {f.lerako ?? "Nincs lerakó"}</p>
      <p className="pb-2 text-sm text-muted-foreground">{napCimke(f.felrakas_nap)} · {f.jarmu_kod ?? "Nincs kocsi"}{f.sofor ? ` · ${f.sofor}` : ""}</p>
      <Sor c="Díj">{f.fuvardij != null ? `${szam(Number(f.fuvardij))} ${f.fuvardij_penznem === "EUR" ? "€" : "Ft"}` : "Nincs megadva"}</Sor>
      <Sor c="Áru">{[f.aru, f.mennyiseg].filter(Boolean).join(" · ") || "Nincs megadva"}</Sor>
      <Sor c="Papír">{f.papirok_beerkeztek_at ? "Megjött" : f.foto_van ? "Fotó van, eredeti nincs" : "Hiányzik"}</Sor>
      <Sor c="Számla">{f.szamla_szam ?? "Még nincs"}</Sor>
      <Sor c="Fizetés">{!sz ? "Nincs számla" : sz.fizetve ? "Fizetve" : kesett != null ? <span className="font-semibold text-red-700">Lejárt {kesett} napja</span> : `Nyitott · esedékes: ${napCimke(sz.hatarido)}`}</Sor>
      <div className="flex flex-wrap gap-2 pt-3">
        <Link className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/fuvarozas2/megbizasok/${f.id}`}>Teljes adatlap, iratok</Link>
        <Link className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold" href="/proto/kereso">Vissza a fuvarokhoz</Link>
      </div>
    </article>
  );
}
