import Link from "next/link";
import { Suspense } from "react";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { getMaVaszon, type MaKocsi } from "@/lib/fuvarozas2/ma-vaszon";
import { getProtoPenz, hetfo } from "@/lib/proto/adat";
import { ft } from "@/components/proto/format";

function KocsiSor({ k }: { k: MaKocsi }) {
  const megallok = k.sorok.flatMap((s) => (s.tipus === "megallo" ? [s] : []));
  const kesik = megallok.some((m) => m.kiemelt === "kesik");
  const szin = k.allapot?.szin;
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{k.kod ?? k.cimke}{k.sofor ? ` · ${k.sofor}` : ""}</div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kesik || szin === "red" ? "bg-red-100 text-red-800" : szin === "amber" ? "bg-amber-100 text-amber-900" : "bg-primary/10 text-primary"}`}>
          {k.helykitolto ?? k.allapot?.szoveg ?? "Nincs adat"}{k.sebesseg ? ` · ${Math.round(k.sebesseg)} km/h` : ""}
        </span>
      </div>
      {k.allapot?.hely && <div className="text-sm text-muted-foreground">Most: {k.allapot.hely}</div>}
      {megallok.length > 0 ? (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {megallok.map((m, i) => (
            <li key={`${m.fuvarId}-${i}`} className={`min-w-36 shrink-0 rounded-lg border p-2 text-xs ${m.allapot === "most" ? "border-primary bg-primary/5" : m.allapot === "kesz" ? "opacity-60" : ""}`}>
              <div className="font-semibold">{m.felLe === "felrako" ? "Fel" : "Le"}: {m.varos}</div>
              <div className="text-muted-foreground">{m.teny ?? m.terv ?? "Nincs időpont"}</div>
              {m.elteres && <div className={m.kiemelt === "kesik" ? "font-medium text-red-700" : "text-muted-foreground"}>{m.elteres}</div>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-sm text-muted-foreground">Ma nincs fuvar a kocsin.</div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {k.etaSor && <span>{k.etaSor}</span>}
        {k.hetiSor && <span>{k.hetiSor}</span>}
        {k.napiKm != null && <span>Ma {k.napiKm} km</span>}
        {k.holnap.length > 0 && <span>Következő munkanap: {k.holnap.length} fuvar</span>}
        {k.papir.map((p) => <Link key={p.href + p.szoveg} href={p.href} className="font-medium text-amber-800 underline">{p.szoveg}</Link>)}
      </div>
    </div>
  );
}

async function HetiSzamok() {
  const ma = budapestNapISO();
  const p = await getProtoPenz(hetfo(ma), ma);
  const uresArany = p.ossz.km + p.ossz.uresKm > 0 ? (p.ossz.uresKm / (p.ossz.km + p.ossz.uresKm)) * 100 : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[
        { c: "Heti bevétel", e: ft(p.ossz.bevetelFt), a: `${p.ossz.db} fuvar` },
        { c: "Heti fedezet", e: ft(p.ossz.fedezetFt), a: `${p.ossz.becslesDb} fuvar becsült` },
        { c: "Heti nettó fuvarokon", e: ft(p.ossz.nettoFt), a: p.ossz.hianyosDb ? `${p.ossz.hianyosDb} fuvarnál hiányzik költség` : "Minden tétel megvan" },
        { c: "Heti üres km", e: `${uresArany.toFixed(1).replace(".", ",")}%`, a: `${p.ossz.uresKm} km, becslés` },
      ].map((x) => (
        <Link key={x.c} href="/proto/penz?idoszak=het" className="grid gap-0.5 rounded-xl border bg-card p-3 hover:border-primary">
          <span className="text-xs text-muted-foreground">{x.c}</span>
          <span className="text-lg font-semibold tabular-nums">{x.e}</span>
          <span className="text-xs text-muted-foreground">{x.a}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function ProtoMa() {
  const v = await getMaVaszon();
  const teendok = [
    ...v.elteresek.map((e) => ({ kulcs: e.kulcs, szint: e.szin === "red" ? "Most" : "Ma", cim: e.cim, also: e.sorok[0] ?? e.badge, href: e.href })),
    ...v.kocsiNelkul.map((f) => ({ kulcs: `kn-${f.id}`, szint: "Ma", cim: `Nincs kocsija: ${f.partner}`, also: f.utvonal, href: `/fuvarozas2/megbizasok/${f.id}` })),
    ...v.teendok.map((t) => ({ kulcs: `t-${t.cimke}`, szint: "Hét", cim: `${t.cimke}: ${t.ertek}`, also: t.also ?? "", href: t.href })),
  ];
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Ma</h1>
        <span className="text-xs text-muted-foreground">Frissítve: {v.frissitve}</span>
      </div>
      <Suspense fallback={<div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Heti számok számolása…</div>}>
        <HetiSzamok />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          {v.kocsik.map((k) => <KocsiSor key={k.kod ?? k.cimke} k={k} />)}
        </div>
        <aside className="grid content-start gap-2 rounded-xl border bg-card p-3">
          <h2 className="font-semibold">Teendő · {teendok.length}</h2>
          {teendok.length === 0 && <p className="text-sm text-muted-foreground">Most nincs teendő.</p>}
          {teendok.map((t) => {
            const belso = (
              <>
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.szint === "Most" ? "bg-red-100 text-red-800" : t.szint === "Ma" ? "bg-amber-100 text-amber-900" : "bg-primary/10 text-primary"}`}>{t.szint}</span>
                <span className="min-w-0"><span className="block text-sm font-medium">{t.cim}</span><span className="block text-xs text-muted-foreground">{t.also}</span></span>
              </>
            );
            return t.href
              ? <Link key={t.kulcs} href={t.href} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-muted">{belso}</Link>
              : <div key={t.kulcs} className="flex items-start gap-2 p-1.5">{belso}</div>;
          })}
        </aside>
      </div>
    </>
  );
}
