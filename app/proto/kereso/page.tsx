import Link from "next/link";
import { ALLAPOT_CIMKE } from "@/lib/megbizasok/allapotgep";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { protoFutoFuvarok, protoKeres } from "@/lib/proto/adat";
import { napCimke, szam } from "@/components/proto/format";

const SZUROK = [
  { k: "", c: "Mind" },
  { k: "ber", c: "Bér" },
  { k: "sajat", c: "Saját" },
  { k: "nyitott", c: "Nyitott" },
  { k: "papir", c: "Hiányzó papír" },
];

function Kartya({ s }: { s: MegbizasSor }) {
  return (
    <Link href={`/proto/fuvar/${s.id}`} className="grid gap-1 rounded-xl border bg-card p-3 hover:border-primary">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{s.partner_nev ?? s.kitol ?? "Saját"}{s.hivatkozas ? ` · ${s.hivatkozas}` : ""}</span>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ALLAPOT_CIMKE[s.allapot] ?? s.allapot}</span>
      </div>
      <span className="text-sm">{s.felrako ?? "Nincs felrakó"} → {s.lerako ?? "Nincs lerakó"}</span>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{napCimke(s.felrakas_nap)} · {s.jarmu_kod ?? "Nincs kocsi"}{s.sofor ? ` · ${s.sofor}` : ""}</span>
        <span className="tabular-nums">{s.fuvardij != null ? `${szam(Number(s.fuvardij))} ${s.fuvardij_penznem === "EUR" ? "€" : "Ft"}` : "Nincs díj"}{s.szamla_szam ? ` · ${s.szamla_szam}` : ""}</span>
      </div>
    </Link>
  );
}

export default async function ProtoKereso({ searchParams }: { searchParams: Promise<{ q?: string; sz?: string }> }) {
  const { q = "", sz = "" } = await searchParams;
  const keres = q.trim();
  const van = !!(keres || sz);
  const eredmeny = van ? await protoKeres(keres, sz) : null;
  const futo = van ? [] : await protoFutoFuvarok();
  return (
    <>
      <h1 className="text-xl font-semibold">Fuvarok</h1>
      <form action="/proto/kereso" className="grid gap-2">
        <input type="search" name="q" defaultValue={q} aria-label="Keresés a teljes múltban" placeholder="Partner, rendszám, város, számla…" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
        {sz && <input type="hidden" name="sz" value={sz} />}
      </form>
      <div className="flex gap-2 overflow-x-auto p-1">
        {SZUROK.map((s) => (
          <Link key={s.k} href={`/proto/kereso?q=${encodeURIComponent(q)}&sz=${s.k}`} className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm ${sz === s.k ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card"}`}>{s.c}</Link>
        ))}
      </div>
      {!van && (
        <>
          <p className="text-sm text-muted-foreground" role="status">Futó és mai fuvarok · {futo.length} fuvar</p>
          {futo.length === 0 && <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">Ma nincs futó fuvar. Keress fent a teljes múltban.</p>}
          <div className="grid gap-2 md:grid-cols-2">{futo.map((s) => <Kartya key={s.id} s={s} />)}</div>
        </>
      )}
      {eredmeny && (
        <>
          <p className="text-sm text-muted-foreground" role="status">{szam(eredmeny.talalat)} találat, {szam(eredmeny.osszes)} fuvar közül{eredmeny.talalat > 100 ? ", az első 100 látszik" : ""}.</p>
          {eredmeny.talalat === 0 && (
            <div className="grid gap-2 rounded-xl border border-dashed bg-card p-4">
              <b>Nincs ilyen fuvar a teljes múltban.</b>
              <span className="text-sm text-muted-foreground">Próbáld rövidebben: csak a várost, a rendszámot vagy a számla végét. Az ékezet nem számít.</span>
              <Link href="/proto/kereso" className="inline-flex min-h-11 w-fit items-center rounded-full border px-4 text-sm font-semibold">Szűrők törlése</Link>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2">{eredmeny.sorok.map((s) => <Kartya key={s.id} s={s} />)}</div>
        </>
      )}
    </>
  );
}
