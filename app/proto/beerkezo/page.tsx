import Link from "next/link";
import { getLevelek } from "@/lib/fuvarozas2/levelek";
import { protoEllenorzendo } from "@/lib/proto/adat";
import { napCimke, szam } from "@/components/proto/format";

function Mezo({ cimke, ertek, kritikus = false }: { cimke: string; ertek: string | null | undefined; kritikus?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{cimke}</span>
      <span className="text-right">
        {ertek ? <span>{ertek}</span> : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kritikus ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>Hiányzik</span>}
      </span>
    </div>
  );
}

export default async function ProtoBeerkezo() {
  const [fuvarok, levelek] = await Promise.all([
    protoEllenorzendo(),
    getLevelek({ allapot: "uj", osztalyok: ["megbizas"], limit: 20 }),
  ]);
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Beérkező</h1>
        <p className="text-sm text-muted-foreground">Az AI által kiolvasott megbízások mentés előtti ellenőrzése. A prototípusban a jóváhagyás még a mostani Megbízások lapon történik.</p>
      </div>
      <h2 className="font-semibold">Ellenőrzésre vár · {fuvarok.length}</h2>
      {fuvarok.length === 0 && <p className="text-sm text-muted-foreground">Most nincs ellenőrizendő megbízás.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {fuvarok.map((f) => (
          <article key={f.id} className="grid gap-2 rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{f.partner_nev ?? "Ismeretlen partner"}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</span>
              <Link href={`/fuvarozas2/megbizasok/${f.id}`} className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Ellenőrzés</Link>
            </div>
            <div>
              <Mezo cimke="Partner" ertek={f.partner_nev} kritikus />
              <Mezo cimke="Felrakó" ertek={f.felrako} kritikus />
              <Mezo cimke="Lerakó" ertek={f.lerako} kritikus />
              <Mezo cimke="Felrakás" ertek={f.felrakas_nap ? napCimke(f.felrakas_nap) : null} kritikus />
              <Mezo cimke="Díj" ertek={f.fuvardij != null ? `${szam(Number(f.fuvardij))} ${f.fuvardij_penznem === "EUR" ? "€" : "Ft"}` : null} kritikus />
              <Mezo cimke="Áru" ertek={[f.aru, f.mennyiseg].filter(Boolean).join(" · ") || null} />
              <Mezo cimke="Fizetés" ertek={f.fizetesi_hatarido_nap != null ? `${f.fizetesi_hatarido_nap} nap` : null} />
            </div>
          </article>
        ))}
      </div>
      <h2 className="font-semibold">Új megbízás-levelek · {levelek.length}</h2>
      {levelek.length === 0 && <p className="text-sm text-muted-foreground">Nincs feldolgozatlan megbízás-levél.</p>}
      <div className="grid gap-2">
        {levelek.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium">{l.targy ?? "Tárgy nélkül"}</span>
              <span className="block text-xs text-muted-foreground">{l.partner_nev ?? l.felado_nev ?? l.felado} · {l.csatolmany_nevek.length} melléklet · megbízhatóság {Math.round(l.bizalom * 100)}%</span>
            </span>
            {l.megbizas_id
              ? <Link href={`/fuvarozas2/megbizasok/${l.megbizas_id}`} className="text-xs font-medium text-primary underline">Megbízás megnyitása</Link>
              : <Link href="/fuvarozas2/levelek" className="text-xs font-medium text-primary underline">Levelek</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
