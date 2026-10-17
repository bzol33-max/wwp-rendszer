import { requireSession } from "@/lib/auth/dal";
import { getTervezo } from "@/lib/fuvarozas2/tervezo";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { BejovoLista, DontesOszlop, HetOszlop } from "@/components/fuvarozas2/tervezo";
import { DontesSav } from "@/components/fuvarozas2/tervezo-dontes";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { TervezesHetNezet } from "@/components/fuvarozas2/tervezes-het";

export const dynamic = "force-dynamic";

// Tervezés (2026-09-30, Budaházi Zoltán: az 1-es terv): balra a döntésre váró
// bérmegbízások, középen a kiválasztott kalkulációja és ár-előzménye, jobbra
// a kocsi hete a fuvarral együtt, alul a döntés.
// 2026-10-12 (navigáció: minden funkció egy helyen): sorrend: a hét (rések +
// ajánlatok, kocsira váró fuvarok) → bejövő megbízások döntése.

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string; kocsi?: string; res?: string; het?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const szerkeszthet = session.can("fuvarozas").edit;
  const hetAdat = await getTervezesHet(sp.res, sp.het);
  const t = await getTervezo({ m: sp.m && /^\d+$/.test(sp.m) ? sp.m : undefined, kocsi: sp.kocsi });
  const k = t.kivalasztott;
  return (
    <div className="flex flex-col gap-4">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/tervezes" cim="Hét" />
      {/* Az új terv 2. oldala (2026-10-11): a hét a résekkel, ajánlatok, kiket hívj. */}
      <TervezesHetNezet adat={hetAdat} szerkeszthet={szerkeszthet} />

      <div className="mt-2 border-t pt-4">
        <h2 className="text-lg font-semibold">Bejövő megbízások — döntés</h2>
        <p className="text-sm text-muted-foreground">Megéri-e magában, a korábbi árakhoz és a kocsi hetéhez képest.</p>
      </div>
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
            Nincs döntésre váró bérmegbízás.
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

    </div>
  );
}
