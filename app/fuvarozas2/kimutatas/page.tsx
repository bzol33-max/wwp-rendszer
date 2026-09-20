import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getKimutatas, type KimutatasIdoszak } from "@/lib/fuvarozas2/kimutatas";
import { Fuvarozas2Fulek, formatFt, formatNap } from "@/components/fuvarozas2/kozos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const IDOSZAKOK: { k: KimutatasIdoszak; c: string }[] = [
  { k: "nap", c: "Nap" },
  { k: "het", c: "Hét" },
  { k: "ho", c: "Hónap" },
];

function eltol(idoszak: KimutatasIdoszak, nap: string, delta: number) {
  const d = new Date(`${nap}T12:00:00Z`);
  if (idoszak === "nap") d.setUTCDate(d.getUTCDate() + delta);
  else if (idoszak === "het") d.setUTCDate(d.getUTCDate() + delta * 7);
  else d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function Mezo({ cim, ertek, alcim, szin }: { cim: string; ertek: string; alcim?: string; szin?: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-xs text-muted-foreground">{cim}</div>
      <div className={cn("text-xl font-semibold tabular-nums", szin)}>{ertek}</div>
      {alcim ? <div className="text-xs text-muted-foreground">{alcim}</div> : null}
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ idoszak?: string; nap?: string }> }) {
  const sp = await searchParams;
  const idoszak = (["nap", "het", "ho"] as const).includes(sp.idoszak as KimutatasIdoszak) ? (sp.idoszak as KimutatasIdoszak) : "het";
  const k = await getKimutatas(idoszak, sp.nap);
  const link = (i: KimutatasIdoszak, n?: string) => `/fuvarozas2/kimutatas?idoszak=${i}${n ? `&nap=${n}` : ""}`;
  const maxKm = Math.max(1, ...k.napok.map((n) => n.km));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás 2 · Kimutatás"
        subtitle="Mennyi km ment, mennyi pénzt hozott, és mennyit spóroltunk a saját fuvarokkal."
        actions={
          <div className="flex items-center gap-1 text-sm">
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href={link(idoszak, eltol(idoszak, k.kezdet, -1))}>←</Link>
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href={link(idoszak)}>ma</Link>
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href={link(idoszak, eltol(idoszak, k.kezdet, 1))}>→</Link>
          </div>
        }
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/kimutatas" />

      <div className="flex flex-wrap items-center gap-1">
        {IDOSZAKOK.map((i) => (
          <Link key={i.k} href={link(i.k, sp.nap)}
            className={cn("rounded-md px-3 py-1 text-sm", idoszak === i.k ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>{i.c}</Link>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{k.kezdet === k.veg ? formatNap(k.kezdet) : `${formatNap(k.kezdet)} – ${formatNap(k.veg)}`}</span>
      </div>

      {k.gpsHiba ? (
        <div className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">
          A km/liter most nem érhető el (Ecofleet): {k.gpsHiba} — a megbízás- és bevétel-adatok ettől függetlenül pontosak.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mezo cim="Megtett km" ertek={`${k.ossz.km.toLocaleString("hu-HU")} km`} alcim={`rakott ${(k.ossz.berKm + k.ossz.sajatKm).toLocaleString("hu-HU")} · üres ${k.ossz.uresKm.toLocaleString("hu-HU")}`} />
        <Mezo cim="Bevétel (bér fuvar)" ertek={formatFt(k.ossz.bevetelFt)} alcim={k.ossz.bevetelEur > 0 ? `+ ${k.ossz.bevetelEur.toLocaleString("hu-HU")} EUR (nincs átváltva)` : undefined} szin="text-[var(--f2-mint)]" />
        <Mezo cim="Bér Ft/km" ertek={k.ossz.berFtKm ? `${k.ossz.berFtKm.toLocaleString("hu-HU")} Ft/km` : "—"} alcim="bér bevétel ÷ bér km" />
        <Mezo cim="Saját fuvar megtakarítás" ertek={formatFt(k.ossz.megtakaritasFt)} alcim="saját km × bér Ft/km — becslés" szin="text-[var(--f2-blue)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mezo cim="Üzemanyag" ertek={formatFt(k.ossz.uzemanyagFt)} alcim={k.gazolajAr ? `${k.ossz.liter.toLocaleString("hu-HU")} l × ${k.gazolajAr} Ft (${k.gazolajCimke})` : "nincs ár"} />
        <Mezo cim="Útdíj (HU-GO)" ertek={k.ossz.utdijFt != null ? formatFt(k.ossz.utdijFt) : "nincs importálva"} alcim={k.ossz.utdijFt != null ? undefined : "a HU-GO lista importja után"} />
        <Mezo cim="Eredmény" ertek={k.ossz.eredmenyFt != null ? formatFt(k.ossz.eredmenyFt) : "—"} alcim="bevétel + megtakarítás − üzemanyag − útdíj" />
        <Mezo cim="Kocsi nélküli megbízás" ertek={String(k.kocsiNelkul)} alcim={k.kocsiNelkul > 0 ? "ezek km-je sehol nem szerepel" : undefined} szin={k.kocsiNelkul > 0 ? "text-[var(--f2-red)]" : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Kocsinként</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Kocsi</th>
                <th className="px-3 py-2 text-right font-medium">Km</th>
                <th className="px-3 py-2 text-right font-medium">Bér km</th>
                <th className="px-3 py-2 text-right font-medium">Saját km</th>
                <th className="px-3 py-2 text-right font-medium">Üres km</th>
                <th className="px-3 py-2 text-right font-medium">Fuvar</th>
                <th className="px-3 py-2 text-right font-medium">Bevétel</th>
                <th className="px-3 py-2 text-right font-medium">Ft/km</th>
                <th className="px-3 py-2 text-right font-medium">Megtakarítás</th>
                <th className="px-3 py-2 text-right font-medium">Üzemanyag</th>
              </tr>
            </thead>
            <tbody>
              {k.jarmuvek.map((j) => (
                <tr key={j.kod} className="border-t border-foreground/5">
                  <td className="px-3 py-2"><div className="font-medium">{j.kod}</div><div className="text-xs text-muted-foreground">{j.sofor ?? "—"}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.km.toLocaleString("hu-HU")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.berKm.toLocaleString("hu-HU")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.sajatKm.toLocaleString("hu-HU")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{j.uresKm.toLocaleString("hu-HU")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.berDb} / {j.sajatDb}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatFt(j.bevetelFt)}{j.bevetelEur > 0 ? ` + ${j.bevetelEur} EUR` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.ftKm ? `${j.ftKm.toLocaleString("hu-HU")}` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatFt(j.megtakaritasFt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatFt(j.uzemanyagFt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {k.ossz.km > 0 ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Napi km</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-1.5 overflow-x-auto">
            {k.napok.map((n) => (
              <div key={n.nap} className="flex min-w-10 flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full flex-col justify-end gap-0.5">
                  {n.uresKm > 0 ? <div className="w-full rounded-t bg-muted-foreground/30" style={{ height: `${(n.uresKm / maxKm) * 100}%` }} /> : null}
                  {n.sajatKm > 0 ? <div className="w-full bg-[var(--f2-blue)]" style={{ height: `${(n.sajatKm / maxKm) * 100}%` }} /> : null}
                  {n.berKm > 0 ? <div className="w-full bg-[var(--f2-mint)]" style={{ height: `${(n.berKm / maxKm) * 100}%` }} /> : null}
                </div>
                <div className="text-[10px] tabular-nums text-muted-foreground">{formatNap(n.nap)}</div>
                <div className="text-[10px] tabular-nums">{Math.round(n.km)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        A km és a liter az Ecofleet útvonal-jelentéséből jön (tény). A rakott/üres bontás napi szintű: egy nap km-je ahhoz a
        jelleghez tartozik, amilyen megbízás aznap futott (ha bér és saját is, felezve). A megállónkénti pontos bontás akkor jön,
        amikor a megállók GPS-adatai minden soron megvannak. Az EUR-os díjak nincsenek átváltva.
      </p>
    </div>
  );
}
