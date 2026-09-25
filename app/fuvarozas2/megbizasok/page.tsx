import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getKocsiMost, getMegbizas, getMunkaasztal } from "@/lib/fuvarozas2/megbizasok";
import { getParositatlanFuvarszamlak } from "@/lib/fuvarozas/megbizasok";
import { SZAKASZOK, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MegbizasReszlet } from "@/components/fuvarozas2/megbizas-reszlet";
import { KocsiMostPanel, MunkaLista, Oldalsav, munkaasztalLink, type MunkaasztalSzuro } from "@/components/fuvarozas2/munkaasztal";
import { formatFt } from "@/components/fuvarozas2/kozos";

export const dynamic = "force-dynamic";

// A régi linkek (Ma-képernyő „csoport”, a korábbi „allapot”/„lepes” szűrők)
// leképezése a munkaasztal szakaszaira.
const REGI_SZAKASZ: Record<string, Szakasz> = {
  ellenorzes: "beerkezett", ellenorzesre_var: "beerkezett", beerkezett: "beerkezett",
  folyamatban: "folyamatban", tervezett: "folyamatban", uton: "folyamatban",
  elszamolas: "szamlazasra", teljesitve: "szamlazasra", szamlazhato: "szamlazasra", szamlazando: "szamlazasra",
  szamlazva: "postara", email_elment: "postara", postara: "postara",
  lezart: "archiv", postazva: "archiv", kesz: "archiv",
};

export default async function Page({ searchParams }: {
  searchParams: Promise<{ szakasz?: string; jelleg?: string; kocsi?: string; q?: string; reszlet?: string; km?: string; csoport?: string; allapot?: string; lepes?: string }>;
}) {
  const sp = await searchParams;
  const szakaszParam = sp.szakasz ?? sp.csoport ?? sp.allapot ?? sp.lepes;
  const szakasz = SZAKASZOK.some((s) => s.kulcs === szakaszParam) ? (szakaszParam as Szakasz) : szakaszParam ? REGI_SZAKASZ[szakaszParam] : undefined;
  const jelleg = sp.jelleg === "ber" || sp.jelleg === "sajat" ? sp.jelleg : undefined;
  const reszletId = sp.reszlet && /^\d+$/.test(sp.reszlet) ? sp.reszlet : undefined;
  const szuro: MunkaasztalSzuro = { szakasz, jelleg, kocsi: sp.kocsi, q: sp.q?.trim() || undefined, reszlet: reszletId, kocsiMost: sp.km };

  const session = await requireSession();
  const [asztal, kocsiMost, reszlet, parositatlan] = await Promise.all([
    getMunkaasztal({ szakasz, jelleg, kocsi: sp.kocsi, q: szuro.q }),
    getKocsiMost(sp.km),
    reszletId ? getMegbizas(reszletId) : Promise.resolve(null),
    getParositatlanFuvarszamlak(60).catch(() => []),
  ]);

  const aktiv = SZAKASZOK.find((s) => s.kulcs === (szakasz ?? "folyamatban"))!;
  const kocsiCim = sp.kocsi === "nincs" ? " · kocsi nélkül" : sp.kocsi ? ` · ${sp.kocsi}` : "";
  const listaCim = szuro.q ? `Keresés: „${szuro.q}”` : `${aktiv.cimke}${kocsiCim}`;

  return (
    <div className="flex flex-col gap-4">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/megbizasok" />

      {parositatlan.length > 0 ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[var(--f2-amb)]">
          <span>
            <b className="text-foreground">{parositatlan.length} fuvarszámla nincs fuvarhoz párosítva:</b>{" "}
            {parositatlan.slice(0, 3).map((p) => `${p.szamlaszam} · ${p.vevo_nev} · ${formatFt(p.netto)}`).join(" | ")}
            {parositatlan.length > 3 ? " …" : ""}
          </span>
          <span className="text-xs">A számlaszámot a fuvar részleteinél lehet beírni.</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_380px] lg:items-start">
        <Oldalsav szuro={szuro} szamok={asztal.szamok} />
        <MunkaLista sorok={asztal.sorok} ma={asztal.ma} szuro={szuro} cim={listaCim} />
        <aside className="order-first flex flex-col gap-3 lg:order-none lg:sticky lg:top-4" aria-label={reszlet ? "A kiválasztott megbízás" : "A kocsi most"}>
          {reszlet ? (
            <>
              <Link href={munkaasztalLink(szuro, { reszlet: undefined })} className="text-sm font-semibold text-[var(--f2-blue)] hover:underline">
                ← vissza a kocsihoz
              </Link>
              <MegbizasReszlet
                {...reszlet}
                egyOszlop
                szerkeszthet={session.can("fuvarozas").edit || session.can("elszamolas").edit}
                elszamolasJog={session.can("elszamolas").edit || session.can("fuvarozas").edit}
              />
            </>
          ) : (
            <KocsiMostPanel adat={kocsiMost} szuro={szuro} />
          )}
        </aside>
      </div>
    </div>
  );
}
