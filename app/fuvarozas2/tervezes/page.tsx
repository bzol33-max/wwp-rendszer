import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getTervHet } from "@/lib/fuvarozas2/tervezes";
import { AllapotBadge, formatFt, formatNap} from "@/components/fuvarozas2/kozos";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NAPNEV = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];

function hetEltolva(iso: string, hetek: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hetek * 7);
  return d.toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ het?: string }> }) {
  const sp = await searchParams;
  const h = await getTervHet(sp.het);
  const napSor = (nap: string) => `${NAPNEV[new Date(`${nap}T12:00:00Z`).getUTCDay()]} ${formatNap(nap)}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás 2 · Tervezés"
        subtitle="A hét kocsinként. A piros mezők üresek — oda kell fuvar; a panel megmondja, honnan keress."
        actions={
          <div className="flex items-center gap-1 text-sm">
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href={`/fuvarozas2/tervezes?het=${hetEltolva(h.hetKezdet, -1)}`}>← előző</Link>
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href="/fuvarozas2/tervezes">ez a hét</Link>
            <Link className="rounded-md px-2 py-1 hover:bg-muted" href={`/fuvarozas2/tervezes?het=${hetEltolva(h.hetKezdet, 1)}`}>következő →</Link>
          </div>
        }
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/tervezes" />

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-foreground/10">Foglalt nap: <b>{h.osszesites.foglalt}</b></span>
        <span className="rounded-lg bg-[var(--f2-red-l)] px-3 py-1.5 text-[var(--f2-red)]">Üres munkanap: <b>{h.osszesites.ures}</b></span>
        <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-foreground/10">Bér {h.osszesites.berDb} · saját {h.osszesites.sajatDb}</span>
        <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-foreground/10">Heti bevétel (Ft-os): <b>{formatFt(h.osszesites.bevetel)}</b></span>
        {h.osszesites.km != null ? (
          <span className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-foreground/10">
            Rakott / üres km: <b>{h.osszesites.rakottKm} / {h.osszesites.uresKm}</b>
            {h.osszesites.km > 0 ? <span className="text-muted-foreground"> ({Math.round(((h.osszesites.uresKm ?? 0) / h.osszesites.km) * 100)} % üres)</span> : null}
          </span>
        ) : null}
        {h.osszesites.potencialFt != null && h.uresSlotok.length > 0 ? (
          <span className="rounded-lg bg-[var(--f2-mint-l)] px-3 py-1.5 text-[var(--f2-mint)]">
            Ha a {h.uresSlotok.length} üres slot megtelik: <b>+{formatFt(h.osszesites.potencialFt)}</b>
          </span>
        ) : null}
        {h.soforKeret.map((s) => (
          <span key={s.sofor} className={`rounded-lg px-3 py-1.5 ring-1 ring-foreground/10 ${s.ora > s.keret * 0.8 ? "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]" : "bg-card"}`}>
            {s.sofor}: <b>{s.ora}/{s.keret} ó</b>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-xs text-muted-foreground">
              <th className="w-40 px-3 py-2 text-left font-medium">Kocsi</th>
              {h.napok.map((n) => (
                <th key={n} className={cn("px-2 py-2 text-left font-medium", [0, 6].includes(new Date(`${n}T12:00:00Z`).getUTCDay()) && "bg-muted/40")}>{napSor(n)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.sorok.map((s) => (
              <tr key={s.kod} className="border-b border-foreground/5 align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{s.kod}</div>
                  <div className="text-xs text-muted-foreground">{s.sofor ?? "—"}</div>
                </td>
                {s.cellak.map((c) => (
                  <td key={c.nap} className={cn("px-1.5 py-1.5", [0, 6].includes(new Date(`${c.nap}T12:00:00Z`).getUTCDay()) && "bg-muted/30")}>
                    {c.megbizasok.map((m) => (
                      <Link key={m.id} href={`/fuvarozas2/megbizasok/${m.id}`} className="mb-1 block rounded-lg bg-[var(--f2-mint-l)] px-2 py-1.5 hover:ring-1 hover:ring-[var(--f2-mint)]">
                        <div className="truncate text-xs font-semibold">{m.partner ?? "(nincs megbízó)"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{m.felrako ?? "—"} → {m.lerako ?? "—"}</div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <AllapotBadge allapot={m.allapot} className="scale-90 origin-left" />
                          {m.jelleg === "ber" && m.fuvardij ? <span className="text-[11px] tabular-nums text-muted-foreground">{formatFt(m.fuvardij, m.penznem)}</span> : null}
                        </div>
                      </Link>
                    ))}
                    {c.ures ? (
                      <div className="rounded-lg border border-dashed border-[var(--f2-red)] bg-[var(--f2-red-l)] px-2 py-1.5 text-[var(--f2-red)]">
                        <div className="text-xs font-bold">ÜRES · fuvar kell</div>
                        <div className="truncate text-[11px]">itt áll: {c.ures.holVaros}</div>
                        {c.ures.hazautKm != null ? <div className="text-[11px]">{c.ures.hazautKm <= 5 ? "telephelyen" : `haza ~${c.ures.hazautKm} km`}</div> : null}
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Hová kell fuvar a héten</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {h.uresSlotok.length === 0 ? <p className="text-muted-foreground">Nincs üres munkanap — tele a hét.</p> : null}
            {h.uresSlotok.map((u) => (
              <div key={`${u.jarmuKod}-${u.nap}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="font-medium">{napSor(u.nap)}</span>
                <span>{u.jarmuKod}</span>
                <span className="text-muted-foreground">innen: {u.holVaros}{u.hazautKm != null ? (u.hazautKm <= 5 ? " · telephelyen áll" : ` · haza ~${u.hazautKm} km üresen`) : ""}</span>
                <span className="ml-auto flex gap-1">
                  <a className="rounded-md bg-card px-2 py-1 text-xs ring-1 ring-foreground/10 hover:ring-foreground/30"
                     href="https://my.timocom.com/freight-exchange" target="_blank" rel="noreferrer">Timocom keresés ↗</a>
                  <Link className="rounded-md bg-card px-2 py-1 text-xs ring-1 ring-foreground/10 hover:ring-foreground/30"
                        href={u.kalkulatorUrl}>Kalkulátorba →</Link>
                </span>
                <div className="w-full text-xs text-muted-foreground">Keresés: {u.keresoSzoveg}</div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">A km légvonalból becsült (×1,3) — pontos km és útdíj a Kalkulátorból (HU-GO).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Kocsi nélkül</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {h.kocsiNelkul.length === 0 ? <p className="text-muted-foreground">Minden e heti megbízáshoz van kocsi.</p> : null}
            {h.kocsiNelkul.map((m) => (
              <Link key={m.id} href={`/fuvarozas2/megbizasok/${m.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--f2-amb-l)] px-3 py-2 text-[var(--f2-amb)]">
                <span className="font-medium">{formatNap(m.felrakasNap)}</span>
                <span>{m.partner ?? "(nincs megbízó)"}</span>
                <span className="truncate">{m.felrako ?? "—"} → {m.lerako ?? "—"}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
