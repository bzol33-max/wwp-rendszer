import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getKimutatas, type KimutatasIdoszak } from "@/lib/fuvarozas2/kimutatas";
import { formatFt, formatNap} from "@/components/fuvarozas2/kozos";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ForrasJel, TetelErtek } from "@/components/fuvarozas2/forras-jel";
import { KimutatasMegbizasok } from "@/components/fuvarozas2/kimutatas-megbizasok";
import type { Forras } from "@/lib/fuvarozas2/koltseg-szamitas";
import { arfolyamTipusCimke } from "@/lib/fuvarozas/arfolyam-alap";

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

function Mezo({ cim, ertek, alcim, szin, jel }: { cim: string; ertek: string; alcim?: string; szin?: string; jel?: Forras }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{cim} <ForrasJel forras={jel} /></div>
      <div className={cn("whitespace-nowrap text-xl font-semibold tabular-nums", szin)}>{ertek}</div>
      {alcim ? <div className="text-xs text-muted-foreground">{alcim}</div> : null}
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ idoszak?: string; nap?: string; jelleg?: string }> }) {
  const sp = await searchParams;
  const idoszak = (["nap", "het", "ho"] as const).includes(sp.idoszak as KimutatasIdoszak) ? (sp.idoszak as KimutatasIdoszak) : "het";
  const k = await getKimutatas(idoszak, sp.nap);
  const jelleg = sp.jelleg === "sajat" || sp.jelleg === "ber" ? sp.jelleg : undefined;
  const link = (i: KimutatasIdoszak, n?: string) => `/fuvarozas2/kimutatas?idoszak=${i}${n ? `&nap=${n}` : ""}${jelleg ? `&jelleg=${jelleg}` : ""}`;
  const maxKm = Math.max(1, ...k.napok.map((n) => n.km));
  const arfolyamCimke = k.arfolyamok.length === 0
    ? null
    : k.arfolyamok.length === 1
      ? (() => {
          const a = k.arfolyamok[0];
          const megj = arfolyamTipusCimke(a.tipus, a.pontos);
          return `MNB ${a.ft.toLocaleString("hu-HU")} Ft/EUR (${a.nap}${megj ? `, ${megj}` : ""})`;
        })()
      : `MNB ${Math.min(...k.arfolyamok.map((a) => a.ft)).toLocaleString("hu-HU")}–${Math.max(...k.arfolyamok.map((a) => a.ft)).toLocaleString("hu-HU")} Ft/EUR (a teljesítés napja szerint${k.arfolyamok.some((a) => !a.pontos) ? "; ahol aznapi nincs, az előző közzétett nap" : ""})`;
  const fk = k.ossz.fejlecKm;
  const kmAlcim = [
    fk.becsultKocsi > 0
      ? fk.tenyKm > 0
        ? `GPS ${fk.tenyKm.toLocaleString("hu-HU")} + becslés ${fk.becsultKm.toLocaleString("hu-HU")} (${fk.becsultKocsi} kocsi GPS-tény nélkül)`
        : "nincs GPS-tény — a fuvarlánc becslése"
      : null,
    `rakott ${(k.ossz.berKm + k.ossz.sajatKm).toLocaleString("hu-HU")} · üres ${k.ossz.uresKm.toLocaleString("hu-HU")} (becslés)`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás · Kimutatás"
        subtitle="Mennyi km ment, mennyi pénzt hozott, mibe került — tény és becslés külön jelölve."
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
        <span className="ml-auto text-xs text-muted-foreground">
          Források: GPS {k.gpsHiba ? "✗" : "✓"} · HU-GO {k.vanUtdijImport ? "✓ import" : "nincs import"} · tankolás {k.tankolasDb > 0 ? `✓ ${k.tankolasDb}` : "nincs"} · gázolajár {k.gazolajAr ? `✓ ${k.gazolajCimke}` : "✗"}
        </span>
      </div>

      {k.atvaltatlanKezi.db > 0 ? (
        <div className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">
          {k.atvaltatlanKezi.db} kézi költségsor átváltás nélkül kimaradt a költségből
          {k.atvaltatlanKezi.eur > 0 ? ` (${k.atvaltatlanKezi.eur.toLocaleString("hu-HU")} EUR, nincs árfolyam)` : ""}
          {k.atvaltatlanKezi.masPenznemDb > 0 ? ` (${k.atvaltatlanKezi.masPenznemDb} ismeretlen pénznemű)` : ""}.
        </div>
      ) : null}

      {k.gpsHiba ? (
        <div className="rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-sm text-[var(--f2-amb)]">
          A km/liter most nem érhető el (Ecofleet): {k.gpsHiba} — a megbízás- és bevétel-adatok ettől függetlenül pontosak, a költségek becslésből jönnek.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mezo cim="Megtett km" jel={fk.forras} ertek={`${fk.ertek.toLocaleString("hu-HU")} km`} alcim={kmAlcim} />
        <Mezo cim="Bevétel (bérfuvar)" jel="teny" ertek={formatFt(k.ossz.bevetelFt)}
          alcim={[
            arfolyamCimke,
            k.ossz.atvaltatlanEur > 0 ? `+ ${k.ossz.atvaltatlanEur.toLocaleString("hu-HU")} EUR (nincs árfolyam, nincs átváltva)` : null,
          ].filter(Boolean).join(" · ") || undefined}
          szin="text-[var(--f2-mint)]" />
        <Mezo cim="Bér Ft/km" jel="becsles" ertek={k.ossz.berFtKm ? `${k.ossz.berFtKm.toLocaleString("hu-HU")} Ft/km` : "—"} alcim="bér bevétel ÷ bér rakott km" />
        <Mezo cim="Összes költség" jel={k.ossz.osszKoltsegForras} ertek={formatFt(k.ossz.osszKoltsegFt)}
          alcim={`üzemanyag + útdíj + napi fix${k.ossz.keziEgyebFt ? ` + kézi egyéb ${formatFt(k.ossz.keziEgyebFt)}` : ""}, minden kocsira`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mezo cim="Üzemanyag" jel={k.ossz.uzemanyagForras} ertek={formatFt(k.ossz.uzemanyagFt)}
          alcim={`${k.ossz.liter.toLocaleString("hu-HU")} l (GPS) × aznapi tankolás Ft/l, ahol van; különben ${k.gazolajAr ? `${k.gazolajAr} Ft/l (${k.gazolajCimke})` : "nincs ár"}`} />
        <Mezo cim="Útdíj (HU-GO)" jel={k.ossz.utdijForras} ertek={formatFt(k.ossz.utdijFt)}
          alcim={k.vanUtdijImport
            ? `importált HU-GO tranzakciók (a megbízásokra felosztva is tény)${k.ossz.utdijForras === "teny" ? "" : "; ahol nincs, tárolt kalkuláció"}`
            : "nincs HU-GO import — tárolt kalkulációból (Költségek fül → import)"} />
        <Mezo cim="Sofőr + kocsi napi fix" jel="becsles" ertek={formatFt(k.ossz.napiKoltsegFt)} alcim={`${k.ossz.aktivNap} aktív nap × ${k.napiKoltsegBeallitas.toLocaleString("hu-HU")} Ft`} />
        <Mezo cim="Kocsi nélküli megbízás" ertek={String(k.kocsiNelkul)} alcim={k.kocsiNelkul > 0 ? "ezek km-je és költsége sehol nem szerepel" : undefined} szin={k.kocsiNelkul > 0 ? "text-[var(--f2-red)]" : undefined} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mezo cim="Bérfuvarok eredménye" jel="becsles" ertek={formatFt(k.ossz.berEredmenyFt)} alcim="bér bevétel − a bérfuvarokra jutó költség"
          szin={k.ossz.berEredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]"} />
        <Mezo cim="Nem hozzárendelt költség" jel="becsles" ertek={formatFt(k.ossz.nemHozzarendeltFt)} alcim="üres utak, állás — összes költség − megbízásokra osztott" />
        <Mezo cim="Eredmény (bérfuvarok, saját fuvar költsége nélkül)" jel="becsles" ertek={formatFt(k.ossz.eredmenyFt)}
          alcim="bérfuvar-eredmény − nem hozzárendelt költség; a saját fuvarok belső költségét nem vonja le — az a mellette lévő kártyán, külön"
          szin={k.ossz.eredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]"} />
        <Mezo cim="Saját fuvar belső költsége" jel="becsles" ertek={formatFt(k.ossz.sajatBelsoKoltsegFt)}
          alcim={`külön, nem része az eredménynek · elkerült (tájékoztató): ${formatFt(k.ossz.elkerultKoltsegFt)}`} szin="text-[var(--f2-blue)]" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Kocsinként</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[78rem] text-sm [&_td]:whitespace-nowrap">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">Kocsi</th>
                <th className="px-3 py-2 text-right font-medium">Km</th>
                <th className="px-3 py-2 text-right font-medium">Bér / saját / üres km</th>
                <th className="px-3 py-2 text-right font-medium">Fuvar</th>
                <th className="px-3 py-2 text-right font-medium">Bevétel</th>
                <th className="px-3 py-2 text-right font-medium">Üzemanyag</th>
                <th className="px-3 py-2 text-right font-medium">Útdíj</th>
                <th className="px-3 py-2 text-right font-medium">Napi fix</th>
                <th className="px-3 py-2 text-right font-medium">Kézi egyéb</th>
                <th className="px-3 py-2 text-right font-medium">Bér eredmény</th>
                <th className="px-3 py-2 text-right font-medium">Nem hozzárendelt</th>
                <th className="px-3 py-2 text-right font-medium" title="Bérfuvar-eredmény − nem hozzárendelt költség; a saját fuvar belső költsége külön oszlop">Eredmény (bér, saját nélkül)</th>
                <th className="px-3 py-2 text-right font-medium">Saját belső költség</th>
              </tr>
            </thead>
            <tbody>
              {k.jarmuvek.map((j) => (
                <tr key={j.kod} className="border-t border-foreground/5 align-top">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2"><div className="font-medium">{j.kod}</div><div className="text-xs text-muted-foreground">{j.sofor ?? "—"}{j.vanGps ? "" : " · nincs GPS"}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {j.vanGps && j.km > 0
                      ? <>{j.km.toLocaleString("hu-HU")} <ForrasJel forras="teny" /></>
                      : j.berKm + j.sajatKm + j.uresKm > 0
                        ? <>{(j.berKm + j.sajatKm + j.uresKm).toLocaleString("hu-HU")} <ForrasJel forras="becsles" /></>
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{j.berKm.toLocaleString("hu-HU")} / {j.sajatKm.toLocaleString("hu-HU")} / {j.uresKm.toLocaleString("hu-HU")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.berDb} / {j.sajatDb}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatFt(j.bevetelFt)}{j.atvaltatlanEur > 0 ? <div className="text-[10px] text-[var(--f2-amb)]">+ {j.atvaltatlanEur} EUR átváltás nélkül</div> : null}{j.ftKm ? <div className="text-[10px] text-muted-foreground">{j.ftKm} Ft/km</div> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={j.uzemanyag} /></td>
                  <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={j.utdij} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground"><TetelErtek tetel={j.napiFix} /><div className="text-[10px]">{j.aktivNap} nap</div></td>
                  <td className="px-3 py-2 text-right tabular-nums"><TetelErtek tetel={j.keziEgyeb} /></td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", j.berEredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]")}>{formatFt(j.berEredmenyFt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatFt(j.nemHozzarendeltFt)}</td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", j.eredmenyFt < 0 ? "text-[var(--f2-red)]" : "text-[var(--f2-mint)]")}>
                    {formatFt(j.eredmenyFt)} <ForrasJel forras="becsles" />
                    {j.eredmenyFtKm != null ? <div className="text-[10px] font-normal text-muted-foreground">{j.eredmenyFtKm} Ft/km</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="text-[var(--f2-blue)]">{formatFt(j.sajatBelsoKoltsegFt)}</span>
                    {j.elkerultKoltsegFt > 0 ? <div className="text-[10px] text-muted-foreground" title="Tájékoztató: saját rakott km × km-díj — nem része az eredménynek.">elkerült: {formatFt(j.elkerultKoltsegFt)}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Megbízásonként</CardTitle></CardHeader>
        <CardContent className="p-0">
          <KimutatasMegbizasok key={jelleg ?? "mind"} megbizasok={k.megbizasok} kezdoJelleg={jelleg} sajatKmDij={k.sajatKmDijBeallitas} />
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
        <ForrasJel forras="teny" /> mért vagy számlázott adat (Ecofleet km/liter, HU-GO tranzakció, tankolási bizonylat, fuvardíj) ·{" "}
        <ForrasJel forras="becsles" /> számított érték. A megbízás tény-km-e az első és az utolsó megálló ténye (GPS vagy
        sofőr-jelzés) közti GPS-km; liter: a kocsi napi literének km-arányos része; ár: az aznapi tankolás Ft/l-e, különben
        NAV − kedvezmény. Ahol nincs tény, a rakott km (HU-GO / légvonal × 1,3) × alap fogyasztás × ár.
        A megbízáshoz kézzel rögzített költség (útdíj, várakozási pótdíj, kiállási díj…) tény: az azonos típusú számított
        tételt felülírja, a többi hozzáadódik. A HU-GO-tranzakciók megbízásokra felosztott része is tény („felosztva”).
        A napi fix ({k.napiKoltsegBeallitas.toLocaleString("hu-HU")} Ft/nap) a nap fuvarjai közt oszlik meg; ami nem jut
        megbízásra (üres utak, állás), az a „nem hozzárendelt” költség. A saját fuvar belső költség — az „elkerült költség”
        (saját rakott km × {k.sajatKmDijBeallitas} Ft/km) csak tájékoztató, egyik eredménybe sem számít bele.
        {arfolyamCimke ? ` EUR-átváltás: ${arfolyamCimke}.` : " Az EUR-os díj a teljesítés napjának MNB-árfolyamán váltódik át."}
      </p>
    </div>
  );
}
