import Link from "next/link";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { hetfo, napEltol, protoHetFuvarok } from "@/lib/proto/adat";
import { TervTabla, type TervFuvar } from "@/components/proto/terv-tabla";
import { napCimke } from "@/components/proto/format";

export default async function ProtoTerv({ searchParams }: { searchParams: Promise<{ het?: string }> }) {
  const { het } = await searchParams;
  const ma = budapestNapISO();
  const kezdet = het && /^\d{4}-\d{2}-\d{2}$/.test(het) ? hetfo(het) : hetfo(ma);
  const [sorok, jarmuvek] = await Promise.all([protoHetFuvarok(kezdet), getJarmuvek()]);
  const napok = Array.from({ length: 7 }, (_, i) => napEltol(kezdet, i));
  const fuvarok: TervFuvar[] = sorok.map((s) => ({
    id: s.id,
    jelleg: s.jelleg,
    cim: s.partner_nev ?? s.kitol ?? "Saját",
    felrako: s.felrako,
    lerako: s.lerako,
    nap: s.felrakas_nap,
    kocsi: s.jarmu_kod,
    dij: s.fuvardij != null ? `${Number(s.fuvardij).toLocaleString("hu-HU")} ${s.fuvardij_penznem === "EUR" ? "€" : "Ft"}` : null,
  }));
  const kocsik = jarmuvek.filter((j) => j.kod && j.rendszamok.length > 0).map((j) => ({ kod: j.kod!, sofor: j.sofor }));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Terv · {napCimke(napok[0])} – {napCimke(napok[6])}</h1>
        <div className="flex gap-2 text-sm">
          <Link className="rounded-md border bg-card px-3 py-1.5" href={`/proto/terv?het=${napEltol(kezdet, -7)}`}>Előző hét</Link>
          <Link className="rounded-md border bg-card px-3 py-1.5" href="/proto/terv">E hét</Link>
          <Link className="rounded-md border bg-card px-3 py-1.5" href={`/proto/terv?het=${napEltol(kezdet, 7)}`}>Következő hét</Link>
        </div>
      </div>
      <TervTabla napok={napok} ma={ma} kocsik={kocsik} fuvarok={fuvarok} hetKezdet={kezdet} />
    </>
  );
}
