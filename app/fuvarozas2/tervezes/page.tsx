import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getTervezo } from "@/lib/fuvarozas2/tervezo";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { BejovoLista, DontesOszlop, HetOszlop } from "@/components/fuvarozas2/tervezo";
import { DontesSav } from "@/components/fuvarozas2/tervezo-dontes";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { hetLink, TervezesHetNezet } from "@/components/fuvarozas2/tervezes-het";
import { AsztaliAtiranyitas } from "@/components/fuvarozas2/asztali-atiranyitas";

export const dynamic = "force-dynamic";

// Tervezés (2026-09-30, Budaházi Zoltán: az 1-es terv): balra a döntésre váró
// bérmegbízások, középen a kiválasztott kalkulációja és ár-előzménye, jobbra
// a kocsi hete a fuvarral együtt, alul a döntés.
// 2026-10-12 (navigáció: minden funkció egy helyen): sorrend: a hét (rések +
// ajánlatok, kocsira váró fuvarok) → bejövő megbízások döntése.
// 2026-10-29 (redesign 5, U2c): a Ma és a Hét egy lap (/fuvarozas2). Ez az oldal
// asztali nézetben már csak a Bejövő megbízások döntése; a „Most dönts” panel
// Határidős tételei ide nyílnak (?m=<id>). Telefonon (768 px alatt) a régi Hét
// nézet is itt marad — a mobil Ma lap „A hét” linkje ide visz.

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string; kocsi?: string; res?: string; het?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const szerkeszthet = session.can("fuvarozas").edit;
  // A régi (mobil) Hét nézet adatát csak akkor számoljuk, ha nem egy konkrét megbízás döntésére jöttünk (?m=).
  const hetAdat = sp.m ? null : await getTervezesHet(sp.res, sp.het);
  const t = await getTervezo({ m: sp.m && /^\d+$/.test(sp.m) ? sp.m : undefined, kocsi: sp.kocsi });
  const k = t.kivalasztott;
  // Az asztali nézetben a het / res paraméter az új lapra irányít.
  const asztaliCel = sp.het || sp.res ? hetLink(sp.het && /^\d{4}-\d{2}-\d{2}$/.test(sp.het) ? sp.het : null, sp.res, "/fuvarozas2") : null;
  return (
    <div className="flex flex-col gap-4">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/tervezes" cim="Bejövő megbízások" />
      {asztaliCel ? <AsztaliAtiranyitas cel={asztaliCel} /> : null}
      <Link href="/fuvarozas2" className="w-fit text-sm font-semibold text-primary hover:underline">‹ vissza a Ma + héthez</Link>

      {/* A régi Hét nézet — csak telefonon; asztalon az új Ma + hét lap váltotta. */}
      {hetAdat ? (
        <div className="md:hidden">
          <TervezesHetNezet adat={hetAdat} szerkeszthet={szerkeszthet} />
        </div>
      ) : null}

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
