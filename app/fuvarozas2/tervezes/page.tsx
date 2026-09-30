import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { requireSession } from "@/lib/auth/dal";
import { getTervezo } from "@/lib/fuvarozas2/tervezo";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { BejovoLista, DontesOszlop, HetOszlop } from "@/components/fuvarozas2/tervezo";
import { DontesSav } from "@/components/fuvarozas2/tervezo-dontes";
import { RegiTervHet } from "@/components/fuvarozas2/regi-terv-het";
import { varosNev } from "@/lib/fuvarozas/varos";

export const dynamic = "force-dynamic";

// Tervezés (2026-09-30, Budaházi Zoltán: az 1-es terv): balra a döntésre váró
// bérmegbízások, középen a kiválasztott kalkulációja és ár-előzménye, jobbra
// a kocsi hete a fuvarral együtt, alul a döntés. A korábbi, minden kocsit
// mutató heti tábla az alján, utólag betöltve.

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string; kocsi?: string; het?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const szerkeszthet = session.can("fuvarozas").edit;
  const t = await getTervezo({ m: sp.m && /^\d+$/.test(sp.m) ? sp.m : undefined, kocsi: sp.kocsi });
  const k = t.kivalasztott;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Fuvarozás · Tervezés" subtitle="Bejövő megbízás → megéri-e magában, a korábbi árakhoz és a kocsi hetéhez képest → döntés." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/tervezes" />
      {t.hatterben > 0 ? <p className="-mt-2 text-xs text-muted-foreground">{t.hatterben} megbízás kalkulációja készül a háttérben — frissítéskor megjelenik.</p> : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <BejovoLista sorok={t.bejovo} valasztott={k?.sor.id ?? null} />
        {k ? (
          <>
            <DontesOszlop k={k} param={t.becslesParam} />
            <HetOszlop k={k} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-foreground/15 bg-card p-6 text-sm text-muted-foreground xl:col-span-2">
            Nincs döntésre váró bérmegbízás. Lent a hét minden kocsija.
          </div>
        )}
      </div>

      {k && szerkeszthet ? (
        <DontesSav
          key={`${k.sor.id}-${k.valasztott?.kod ?? ""}`}
          id={k.sor.id}
          allapot={k.sor.allapot}
          kocsiKod={k.valasztott && !k.valasztott.utkozik ? k.valasztott.kod : null}
          kocsiNev={k.valasztott?.sofor ?? null}
          felrakasNap={k.sor.felrakasNap}
          celarFt={k.celarFt}
          ajanlatAlap={{ ut: `${varosNev(k.sor.felrako ?? "") || "?"} → ${varosNev(k.sor.lerako ?? "") || "?"}`, hivatkozas: k.sor.hivatkozas }}
        />
      ) : null}

      <details id="minden-kocsi" className="rounded-2xl border border-foreground/10 bg-card p-4" open={!!sp.het}>
        <summary className="cursor-pointer text-sm font-semibold">A hét minden kocsija — üres napok, kocsi nélküli fuvarok, GPS-km</summary>
        <div className="mt-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Betöltés…</p>}>
            <RegiTervHet het={sp.het} />
          </Suspense>
        </div>
      </details>
    </div>
  );
}
