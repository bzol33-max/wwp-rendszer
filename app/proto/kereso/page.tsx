import Link from "next/link";
import { ALLAPOT_CIMKE } from "@/lib/megbizasok/allapotgep";
import { protoKeres } from "@/lib/proto/adat";
import { napCimke, szam } from "@/components/proto/format";

const SZUROK = [
  { k: "", c: "Mind" },
  { k: "ber", c: "Bér" },
  { k: "sajat", c: "Saját" },
  { k: "nyitott", c: "Nyitott" },
];

export default async function ProtoKereso({ searchParams }: { searchParams: Promise<{ q?: string; sz?: string }> }) {
  const { q = "", sz = "" } = await searchParams;
  const keres = q.trim();
  const eredmeny = keres || sz ? await protoKeres(keres, sz) : null;
  return (
    <>
      <h1 className="text-xl font-semibold">Keresés</h1>
      <form action="/proto/kereso" className="grid gap-2">
        <input type="search" name="q" defaultValue={q} autoFocus aria-label="Keresés a fuvarok között" placeholder="Partner, rendszám, város, számlaszám, hónap…" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
        {sz && <input type="hidden" name="sz" value={sz} />}
      </form>
      <div className="flex flex-wrap gap-2">
        {SZUROK.map((s) => (
          <Link key={s.k} href={`/proto/kereso?q=${encodeURIComponent(q)}&sz=${s.k}`} className={`rounded-full border px-3 py-1 text-sm ${sz === s.k ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card"}`}>{s.c}</Link>
        ))}
      </div>
      {!eredmeny && <p className="text-sm text-muted-foreground">Írj be bármit: ékezet nélkül is működik, például „nmz492 szept” vagy „nyiregyhaza”.</p>}
      {eredmeny && (
        <>
          <p className="text-sm text-muted-foreground">{szam(eredmeny.talalat)} találat, {szam(eredmeny.osszes)} fuvar közül{eredmeny.talalat > 100 ? ", az első 100 látszik" : ""}.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {eredmeny.sorok.map((s) => (
              <Link key={s.id} href={`/fuvarozas2/megbizasok/${s.id}`} className="grid gap-1 rounded-xl border bg-card p-3 hover:border-primary">
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
            ))}
          </div>
        </>
      )}
    </>
  );
}
