import Link from "next/link";
import { getProtoPenz } from "@/lib/proto/adat";
import type { ProtoForras, ProtoOsszeg } from "@/lib/proto/penz-alap";
import { eur, ft, napCimke, szam } from "@/components/proto/format";
import { idoszakBol, type IdoszakParam } from "./idoszak";

const FORRAS: Record<ProtoForras, { c: string; o: string }> = {
  teny: { c: "Tény", o: "bg-emerald-100 text-emerald-800" },
  reszben: { c: "Részben", o: "bg-primary/10 text-primary" },
  becsles: { c: "Becslés", o: "bg-amber-100 text-amber-900" },
};

function Osszeg({ n }: { n: number }) {
  return <span className={`font-semibold tabular-nums ${n < 0 ? "text-red-700" : "text-emerald-700"}`}>{n > 0 ? "+" : ""}{szam(n)}</span>;
}

function CsoportTabla({ cim, sorok, allo }: { cim: string; sorok: (ProtoOsszeg & { alloSoforFt?: number })[]; allo: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
          <th className="p-2 text-left">{cim}</th><th className="p-2 text-right">Fuvar</th><th className="p-2 text-right">Km (üres)</th><th className="p-2 text-right">Bevétel</th><th className="p-2 text-right">Fedezet</th><th className="p-2 text-right">Sofőr</th><th className="p-2 text-right">Nettó</th>{allo && <th className="p-2 text-right">Álló nap sofőrje</th>}
        </tr></thead>
        <tbody>{sorok.map((s) => (
          <tr key={s.kulcs} className="border-t tabular-nums">
            <td className="p-2 font-medium">{s.kulcs}</td><td className="p-2 text-right">{s.db}{s.kimaradtDb ? ` +${s.kimaradtDb} kimaradt` : ""}</td><td className="p-2 text-right">{szam(s.km)} ({szam(s.uresKm)})</td><td className="p-2 text-right">{szam(s.bevetelFt)}</td><td className="p-2 text-right">{szam(s.fedezetFt)}</td><td className="p-2 text-right">{szam(s.soforFt)}</td><td className="p-2 text-right"><Osszeg n={s.nettoFt} /></td>{allo && <td className="p-2 text-right">{szam(s.alloSoforFt ?? 0)}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default async function ProtoPenz({ searchParams }: { searchParams: Promise<IdoszakParam & { nezet?: string; jelleg?: string }> }) {
  const sp = await searchParams;
  const { kezdet, veg, idoszak } = idoszakBol(sp);
  const nezet = sp.nezet === "kocsi" || sp.nezet === "partner" ? sp.nezet : "fuvar";
  const jelleg = sp.jelleg === "ber" || sp.jelleg === "sajat" ? sp.jelleg : "";
  const p = await getProtoPenz(kezdet, veg);
  const fuvarok = jelleg ? p.fuvarok.filter((f) => f.jelleg === jelleg) : p.fuvarok;
  const alap = idoszak === "egyedi" ? `tol=${kezdet}&ig=${veg}` : `idoszak=${idoszak}`;
  const link = (m: Record<string, string>) => `/proto/penz?${new URLSearchParams({ ...(idoszak === "egyedi" ? { tol: kezdet, ig: veg } : { idoszak }), nezet, jelleg, ...m }).toString()}`;
  const chip = (aktiv: boolean) => `rounded-full border px-3 py-1 text-sm ${aktiv ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card"}`;
  const allo = p.kocsik.reduce((s, k) => s + k.alloSoforFt, 0);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Pénz</h1>
        <a href={`/proto/penz/export?${alap}`} className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium">Excel-export</a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ idoszak: "het", tol: "", ig: "" })} className={chip(idoszak === "het")}>E hét</Link>
        <Link href={link({ idoszak: "ho", tol: "", ig: "" })} className={chip(idoszak === "ho")}>E hónap</Link>
        <Link href={link({ idoszak: "elozo", tol: "", ig: "" })} className={chip(idoszak === "elozo")}>Előző hónap</Link>
        <form action="/proto/penz" className="flex flex-wrap items-center gap-1 text-sm">
          <input type="date" name="tol" defaultValue={kezdet} aria-label="Időszak kezdete" className="h-9 rounded-md border bg-card px-2" />
          <input type="date" name="ig" defaultValue={veg} aria-label="Időszak vége" className="h-9 rounded-md border bg-card px-2" />
          <input type="hidden" name="nezet" value={nezet} />
          <button className="h-9 rounded-md border bg-card px-3">Mutat</button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="grid gap-0.5 rounded-xl border bg-card p-3"><span className="text-xs text-muted-foreground">Bevétel, Ft-ban számolva</span><span className="text-lg font-semibold tabular-nums">{ft(p.ossz.bevetelFt)}</span><span className="text-xs text-muted-foreground">ebből EUR-díj: {eur(p.ossz.eur)}</span></div>
        <div className="grid gap-0.5 rounded-xl border bg-card p-3"><span className="text-xs text-muted-foreground">Fedezet</span><span className="text-lg font-semibold tabular-nums">{ft(p.ossz.fedezetFt)}</span><span className="text-xs text-muted-foreground">üres út költsége: {ft(p.ossz.uresKoltsegFt)}</span></div>
        <div className="grid gap-0.5 rounded-xl border bg-card p-3"><span className="text-xs text-muted-foreground">Nettó a fuvarokon</span><span className="text-lg font-semibold tabular-nums">{ft(p.ossz.nettoFt)}</span><span className="text-xs text-muted-foreground">sofőr: {ft(p.ossz.soforFt)}</span></div>
        <div className="grid gap-0.5 rounded-xl border bg-card p-3"><span className="text-xs text-muted-foreground">Nettó az álló napokkal együtt</span><span className="text-lg font-semibold tabular-nums">{ft(p.ossz.nettoFt - allo)}</span><span className="text-xs text-muted-foreground">álló nap sofőrje: {ft(allo)}</span></div>
      </div>
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        {napCimke(kezdet)} – {napCimke(veg)}: {p.ossz.db} fuvar számol, ebből {p.ossz.becslesDb} nem teljesen tény, {p.ossz.hianyosDb} fuvarnál hiányzik költségtétel. {p.ossz.kimaradtDb > 0 ? `${p.ossz.kimaradtDb} EUR-os fuvar árfolyam nélkül kimaradt. ` : ""}{p.kocsiNelkul > 0 ? `${p.kocsiNelkul} fuvarnak nincs kocsija, ezek nincsenek a számban. ` : ""}{p.gpsHiba ? `GPS-hiba: ${p.gpsHiba}. ` : ""}Üzemanyagár hiányzó tankolásnál: {p.gazolajAr != null ? `${Math.round(p.gazolajAr)} Ft/l` : "nincs"}{p.gazolajCimke ? ` (${p.gazolajCimke})` : ""}.
      </div>
      <div className="flex flex-wrap gap-2">
        {([["fuvar", "Fuvar"], ["kocsi", "Kocsi"], ["partner", "Partner"]] as const).map(([k, c]) => <Link key={k} href={link({ nezet: k })} className={chip(nezet === k)}>{c}</Link>)}
        {nezet === "fuvar" && ([["", "Mind"], ["ber", "Bér"], ["sajat", "Saját"]] as const).map(([k, c]) => <Link key={c} href={link({ jelleg: k })} className={chip(jelleg === k)}>{c}</Link>)}
      </div>
      {nezet === "kocsi" && <CsoportTabla cim="Kocsi" sorok={p.kocsik} allo />}
      {nezet === "partner" && <CsoportTabla cim="Partner" sorok={p.partnerek} allo={false} />}
      {nezet === "fuvar" && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
              <th className="p-2 text-left">Fuvar</th><th className="p-2 text-right">Km (üres)</th><th className="p-2 text-right">Bevétel</th><th className="p-2 text-right">Üzemanyag</th><th className="p-2 text-right">Útdíj</th><th className="p-2 text-right">Egyéb</th><th className="p-2 text-right">Üres út</th><th className="p-2 text-right">Fedezet</th><th className="p-2 text-right">Sofőr</th><th className="p-2 text-right">Nettó</th><th className="p-2 text-left">Adat</th>
            </tr></thead>
            <tbody>{fuvarok.map((f) => (
              <tr key={f.id} className="border-t tabular-nums">
                <td className="p-2"><Link href={`/fuvarozas2/megbizasok/${f.id}`} className="font-medium hover:underline">{f.partner}{f.hivatkozas ? ` · ${f.hivatkozas}` : ""}</Link><div className="text-xs text-muted-foreground">{napCimke(f.nap)} · {f.kocsi} · {f.jelleg === "ber" ? "Bér" : "Saját"}{f.bevetelEur != null ? ` · ${eur(f.bevetelEur)}` : ""}</div></td>
                <td className="p-2 text-right">{szam(f.km)} ({szam(f.uresKm)})</td>
                <td className="p-2 text-right">{f.kimarad ? "Nincs árfolyam" : f.jelleg === "sajat" ? "—" : szam(f.bevetelFt)}</td>
                <td className="p-2 text-right">{szam(f.uzemanyagFt)}</td><td className="p-2 text-right">{szam(f.utdijFt)}</td><td className="p-2 text-right">{szam(f.egyebFt)}</td><td className="p-2 text-right">{szam(f.uresKoltsegFt)}</td><td className="p-2 text-right">{szam(f.fedezetFt)}</td><td className="p-2 text-right">{szam(f.soforFt)}</td>
                <td className="p-2 text-right">{f.kimarad ? "—" : <Osszeg n={f.nettoFt} />}</td>
                <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FORRAS[f.forras].o}`}>{FORRAS[f.forras].c}</span>{f.hianyok.length > 0 && <div className="mt-1 text-xs text-amber-800">Hiányzik: {f.hianyok.join(", ")}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
