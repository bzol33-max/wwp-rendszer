import { PageHeader } from "@/components/layout/page-header";
import { getHasznalat14Nap, getKiolvasasHibak30Nap, getRendszerEgeszseg, type EgeszsegAllapot } from "@/lib/fuvarozas2/rendszer";
import { formatIdo} from "@/components/fuvarozas2/kozos";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { cn } from "@/lib/utils";
import { requireSession } from "@/lib/auth/dal";
import { SzallitolevelPotlas } from "@/components/fuvarozas2/szallitolevel-potlas";

export const dynamic = "force-dynamic";

const SZIN: Record<EgeszsegAllapot, string> = {
  rendben: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  figyelmeztetes: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  gond: "bg-[var(--f2-red-l)] text-[var(--f2-red)]",
  nincs_adat: "bg-muted text-muted-foreground",
};
const CIMKE: Record<EgeszsegAllapot, string> = {
  rendben: "rendben", figyelmeztetes: "figyelj", gond: "gond", nincs_adat: "nincs adat",
};

export default async function Page() {
  const [e, hasznalat, kiolvasas, session] = await Promise.all([getRendszerEgeszseg(), getHasznalat14Nap(), getKiolvasasHibak30Nap(), requireSession()]);
  const gond = e.sorok.filter((s) => s.allapot === "gond").length;
  const figy = e.sorok.filter((s) => s.allapot === "figyelmeztetes").length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás · Rendszer"
        subtitle={gond === 0 && figy === 0 ? "Minden figyelő és kapu rendben." : `${gond} gond · ${figy} figyelmeztetés — alább, melyik.`}
      />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/rendszer" />
      {session.can("fuvarozas").edit ? <SzallitolevelPotlas /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {e.sorok.map((s) => (
          <div key={s.kulcs} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.cim}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SZIN[s.allapot])}>{CIMKE[s.allapot]}</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{s.ertek}</div>
            {s.reszlet ? <div className="text-sm text-muted-foreground">{s.reszlet}</div> : null}
            {s.utoljara ? <div className="mt-1 text-xs text-muted-foreground">utolsó: {formatIdo(s.utoljara)}</div> : null}
          </div>
        ))}
      </div>
      {kiolvasas ? (
        // Kiolvasási hibák: importált bérfuvar, amelynek kiolvasott mezőjét
        // utólag kézzel javítani kellett (szabály: rendszer-alap.ts).
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Kiolvasási hibák (30 nap)</span>
            <span className="text-xs text-muted-foreground">kézzel javított kiolvasott mező alapján</span>
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {kiolvasas.hibas} / {kiolvasas.importalt} megbízás
            {kiolvasas.importalt > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({Math.round((kiolvasas.hibas / kiolvasas.importalt) * 100)}%)
              </span>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {kiolvasas.mezonkent.length > 0
              ? kiolvasas.mezonkent.map((m) => `${m.cimke} ${m.db}`).join(" · ")
              : "nem kellett kézzel javítani kiolvasott mezőt"}
            {kiolvasas.torolt > 0 ? ` · törölt import (duplikátum/rossz): ${kiolvasas.torolt}` : ""}
          </div>
          {kiolvasas.partnerenkent.length > 0 ? (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">Partner</th>
                  <th className="py-1 pr-2 text-right font-normal">Hibás / import</th>
                  <th className="py-1 font-normal">Mit kellett javítani</th>
                </tr>
              </thead>
              <tbody>
                {kiolvasas.partnerenkent.map((p) => (
                  <tr key={p.partner} className="border-t border-foreground/5 align-top">
                    <td className="py-1 pr-2">{p.partner}</td>
                    <td className="py-1 pr-2 text-right font-semibold tabular-nums">{p.hibas} / {p.importalt}</td>
                    <td className="py-1 text-muted-foreground">{p.cimkek.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
      {hasznalat ? (
        // Használati napló (csak admin): melyik lapot nyitják meg — ebből
        // döntünk 2 hét után, mit lehet törölni / összevonni.
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Használat (14 nap)</span>
            <span className="text-xs text-muted-foreground">
              {hasznalat.reduce((n, u) => n + u.db, 0)} megnyitás · {hasznalat.length} lap
            </span>
          </div>
          {hasznalat.length === 0 ? (
            <div className="mt-1 text-sm text-muted-foreground">Még nincs adat — a napló a lapok megnyitásával telik.</div>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">Útvonal</th>
                  <th className="py-1 pr-2 text-right font-normal">Db</th>
                  <th className="hidden py-1 pr-2 font-normal md:table-cell">Felhasználónként</th>
                  <th className="py-1 text-right font-normal">Utoljára</th>
                </tr>
              </thead>
              <tbody>
                {hasznalat.map((u) => (
                  <tr key={u.utvonal} className="border-t border-foreground/5 align-top">
                    <td className="py-1 pr-2 font-mono text-xs break-all">
                      {u.utvonal}
                      <div className="font-sans text-muted-foreground md:hidden">
                        {u.felhasznalok.map((f) => `${f.felhasznalo} ${f.db}`).join(" · ")}
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-right font-semibold tabular-nums">{u.db}</td>
                    <td className="hidden py-1 pr-2 text-muted-foreground md:table-cell">
                      {u.felhasznalok.map((f) => (
                        <span key={f.felhasznalo} className="mr-3 whitespace-nowrap" title={`utoljára ${formatIdo(f.utoljara)}`}>
                          {f.felhasznalo} <span className="tabular-nums text-foreground">{f.db}</span>
                        </span>
                      ))}
                    </td>
                    <td className="py-1 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatIdo(u.utoljara)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Frissítve: {formatIdo(e.frissitve)} — az oldal újratöltésével frissül.</p>
    </div>
  );
}
