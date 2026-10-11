import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import type { Res } from "@/lib/fuvarozas2/tervezes-het-alap";

// Tervezés · A hét (az új terv 2. oldala): kocsinként a hét, a rések
// kiemelve, mellette a bejött ajánlatok, alatta a kijelölt rés teendői.

const NAPNEV = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];
const napCimke = (iso: string) => `${NAPNEV[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(5, 7)}.${iso.slice(8, 10)}.`;
const rovidNap = (iso: string) => NAPNEV[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const ft = (x: number) => `${Math.round(x).toLocaleString("hu-HU")} Ft`;
const ezer = (x: number) => `${Math.round(x / 1000).toLocaleString("hu-HU")} e`;
const ido = (perc: number) => `${Math.floor(perc / 60)} ó ${String(perc % 60).padStart(2, "0")} p`;
const resLink = (r: Res) => `/fuvarozas2/tervezes?res=${encodeURIComponent(r.kulcs)}#res`;

function ResChip({ r, aktiv }: { r: Res; aktiv: boolean }) {
  return (
    <Link href={resLink(r)} scroll={false}
      className={cn("block rounded-lg border border-dashed px-2 py-1 text-xs", aktiv ? "border-[var(--f2-amb)] bg-[var(--f2-amb-l)] ring-2 ring-[var(--f2-amb)]/40" : "border-[var(--f2-amb)]/60 bg-[var(--f2-amb-l)]/60 hover:bg-[var(--f2-amb-l)]")}>
      <div className="truncate text-[#5a3806]">{r.honnan} → {r.haza ? "haza" : r.hova}</div>
      <div className="font-semibold text-[var(--f2-amb)]">{r.km} km üres</div>
    </Link>
  );
}

export function TervezesHetNezet({ adat }: { adat: TervezesHet }) {
  const k = adat.kijelolt;
  const ehhez = adat.ajanlatok.filter((a) => a.ehhez).sort((a, b) => a.ehhez!.tobbletFt - b.ehhez!.tobbletFt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="text-sm text-muted-foreground">a hét · hova kell fuvar · mit vállaljunk el</p>
        <span className={cn("ml-auto rounded-full px-3 py-1 text-sm font-medium", adat.resek.length ? "bg-[var(--f2-amb-l)] text-[#5a3806]" : "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]")}>
          {adat.resek.length ? `${adat.resek.length} rés · ${adat.uresKmOssz.toLocaleString("hu-HU")} km üres` : "nincs 100 km-nél hosszabb üres út"}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-24 px-4 py-2 font-medium" />
                {adat.napok.map((n) => <th key={n} className={cn("px-2 py-2 font-medium", n === adat.ma && "text-foreground")}>{napCimke(n)}{n === adat.ma ? " · ma" : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {adat.kocsik.map((kocsi) => (
                <tr key={kocsi.kod} className="border-t border-foreground/5 align-top">
                  <td className="px-4 py-3"><div className="font-semibold">{kocsi.sofor}</div><div className="text-xs text-muted-foreground">{kocsi.kod}</div></td>
                  {kocsi.cellak.map((c) => (
                    <td key={c.nap} className={cn("px-1.5 py-2", c.nap === adat.ma && "bg-muted/40")}>
                      <div className="flex flex-col gap-1">
                        {c.resek.filter((r) => !r.haza).map((r) => <ResChip key={r.kulcs} r={r} aktiv={k?.kulcs === r.kulcs} />)}
                        {c.fuvarok.map((f) => (
                          <Link key={f.id} href={`/fuvarozas2/megbizasok?reszlet=${f.id}`}
                            className={cn("block rounded-lg px-2 py-1 text-xs", f.sajat ? "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]" : "bg-[var(--f2-mint-l)] text-[#0f5240]")}>
                            <div className="truncate font-semibold">{f.cim}</div>
                            <div className="truncate">{f.felVaros} → {f.leVaros}</div>
                          </Link>
                        ))}
                        {c.resek.filter((r) => r.haza).map((r) => <ResChip key={r.kulcs} r={r} aktiv={k?.kulcs === r.kulcs} />)}
                        {c.szabad ? <div className="rounded-lg px-2 py-1 text-xs text-muted-foreground/70">szabad</div> : null}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Rés: 100 km-nél hosszabb üres út két fuvar között vagy hazafelé (légvonal × 1,3). Kattints rá: lent látod, mi illik bele és kit érdemes hívni.</p>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
            <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
              <h2 className="font-semibold">Bejövő ajánlatok</h2>
              <span className="rounded-full bg-muted px-2 text-xs">{adat.ajanlatok.length}</span>
            </div>
            {adat.ajanlatok.length ? (
              <ul className="divide-y">
                {adat.ajanlatok.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <Link href={`/fuvarozas2/timocom?id=${a.id}`} className="block hover:underline">
                      <div className="flex items-baseline gap-2 text-sm"><b className="truncate">{a.megbizo ?? "Timocom-ajánlat"}</b><span className="text-xs text-muted-foreground">Timocom</span></div>
                      <div className="text-sm">{a.felVaros} → {a.leVaros}{a.felNap ? ` · ${a.felNap.slice(5).replace("-", ".")}.` : ""}{a.arSzoveg ? ` · ${a.arSzoveg}` : ""}</div>
                    </Link>
                    <div className={cn("text-xs", a.illik ? (a.illik.draga ? "text-[var(--f2-amb)]" : "text-[var(--f2-mint)]") : "text-muted-foreground")}>
                      {a.illik
                        ? <>illik: <Link className="underline" href={resLink(a.illik.res)} scroll={false}>{a.illik.res.sofor} {rovidNap(a.illik.res.nap)} rés</Link> · +{ft(a.illik.tobbletFt)}{a.illik.draga ? " · drága" : ""}</>
                        : a.nincsHely ? "a helyet nem sikerült térképre tenni" : "egyik résbe sem illik"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 pb-3 text-sm text-muted-foreground">Nincs nyitott ajánlat.</p>}
          </section>
          <Link href="/fuvarozas2/timocom" className="rounded-2xl border border-dashed px-4 py-3 text-sm hover:bg-muted/50">
            <b>Ajánlat beillesztése</b>
            <div className="text-xs text-muted-foreground">Timocom szöveg vagy „→ WWP” gomb</div>
          </Link>
        </aside>
      </div>

      {k ? (
        <section id="res" className="scroll-mt-4 rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
            <h2 className="text-lg font-semibold">{k.sofor} · {rovidNap(k.nap)} · {k.honnan} → {k.haza ? "haza" : k.hova}</h2>
            <span className="text-sm text-[var(--f2-amb)]">{k.km} km üres ≈ {ft(k.ft)}</span>
          </div>
          <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-x-auto">
              {ehhez.length ? (
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="py-1.5 font-medium">Ajánlat</th><th className="px-2 py-1.5 text-right font-medium">+km</th><th className="px-2 py-1.5 text-right font-medium">+idő</th><th className="px-2 py-1.5 text-right font-medium">Többlet</th><th className="px-2 py-1.5 text-right font-medium">Mennyit kérj</th><th /></tr>
                  </thead>
                  <tbody>
                    {ehhez.map((a) => (
                      <tr key={a.id} className="border-t border-foreground/5">
                        <td className="py-2"><b>{a.megbizo ?? "Timocom"}</b> <span className="text-muted-foreground">· {a.felVaros} → {a.leVaros}</span>{a.ehhez!.draga ? <span className="ml-2 rounded-full bg-[var(--f2-amb-l)] px-2 text-[11px] text-[#5a3806]">drága</span> : null}</td>
                        <td className="px-2 py-2 text-right tabular-nums">+{a.ehhez!.plusKm}</td>
                        <td className="px-2 py-2 text-right tabular-nums">+{ido(a.ehhez!.plusPerc)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">+{ft(a.ehhez!.tobbletFt)}</td>
                        <td className="px-2 py-2 text-right tabular-nums"><b>{ezer(a.ehhez!.kerjFt)}</b> <span className="text-xs text-muted-foreground">· min. {ezer(a.ehhez!.minFt)}</span></td>
                        <td className="py-2 pl-2 text-right"><Link href={`/fuvarozas2/timocom?id=${a.id}`} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted">Megnyitom</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted-foreground">Ebbe a résbe most nincs illő ajánlat. Keress a Timocomon {k.honnan} környékéről {k.haza ? "hazafelé" : `${k.hova} felé`}, vagy hívd a jobb oldali megbízókat.</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                +km: a kerülő a rés útjához képest (légvonal × 1,3). Többlet: +km × {adat.kmKoltseg} Ft/km (üzemanyag + útdíj) + az idő a napi fix arányában.
                Mennyit kérj: legalább a többlet + 8% (min.), illetve a hasonló korábbi fuvarjaink Ft/km-e, ha volt ilyen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/fuvarozas2/kalkulator?honnan=${encodeURIComponent(k.honnan)}&hova=${encodeURIComponent(k.hova)}`} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Kalkulátor ezzel a réssel →</Link>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Kiket hívj · saját múltból</h3>
              <p className="mb-2 text-xs text-muted-foreground">felrakó legfeljebb 50 km-re innen: {k.honnan} · legalább 2 korábbi fuvar</p>
              {adat.hivandok.length ? (
                <ul className="flex flex-col gap-2">
                  {adat.hivandok.map((h) => (
                    <li key={h.partner} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <div className="flex items-baseline gap-2"><b className="truncate">{h.partner}</b><span className="ml-auto text-xs tabular-nums text-muted-foreground">{h.utolsoDijFt ? ezer(h.utolsoDijFt) : "—"} · {h.db}×</span></div>
                      <div className="text-xs text-muted-foreground">{h.utolsoUt} · {h.utolsoNap.slice(5).replace("-", ".")}.</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Innen még nem volt visszatérő megbízónk.</p>}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
