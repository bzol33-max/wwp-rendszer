import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { getKocsiSavok, type KocsiSavElotoltes } from "@/lib/fuvarozas2/kocsi-sav";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { getTervezo, type BejovoSor } from "@/lib/fuvarozas2/tervezo";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { MaVaszonNezet } from "@/components/fuvarozas2/ma-vaszon";
import { DontesreVarSor, VisszfuvarRiasztasok } from "@/components/fuvarozas2/kocsi-savok";
import { FejlecJobb, HetFigyelmeztetesek, Helykitoltok, IrodaSor, MaHetKocsi } from "@/components/fuvarozas2/ma-het";
import { MaHetPanel } from "@/components/fuvarozas2/ma-het-panel";
import { AjanlatokTab, dontLista, MostDonts, ResTab } from "@/components/fuvarozas2/ma-het-dont";

export const dynamic = "force-dynamic";

// A Fuvarozás kezdőlapja: Ma + hét egy lapon (2026-10-29, redesign 5, U2c terv;
// a felhasználó jóváhagyta 2026-10-26). 768 px-től kocsi-oszlopok a mai blokkal
// és a napokkal + jobbra a „Most dönts / Ajánlatok / Rés” panel; 768 px alatt a
// korábbi mobil Ma nézet marad (fölötte a régi Hét nézet linkjével).
// Fuvarozás-jog nélkül (elszámolás hatókör) csak a mai részek látszanak: a heti
// napok, rések, ajánlatok és döntés-gombok nem.
// Korábbi története: 2026-10-12 „csak a Részletek kell”; 2026-10-17 (B változat,
// docs/fuvarozas-2-kor-terv.md) kocsi-sávok, majd „csak az új maradjon”
// (docs/ma-n1-terv.md); 2026-10-21 metróvonal (V11).
export default async function Page({ searchParams }: { searchParams: Promise<{ het?: string; res?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const fuvarozas = session.can("fuvarozas").view;
  const szerk = session.can("fuvarozas").edit;
  const hetParam = sp.het && /^\d{4}-\d{2}-\d{2}$/.test(sp.het) ? sp.het : undefined;

  // A hét (napok, rések, ajánlatok) és a bejövő megbízások csak a Fuvarozás-jogúnak; hiba → a lap a mai részekkel megy tovább.
  const hetP = fuvarozas ? getTervezesHet(sp.res, hetParam).catch(() => null) : Promise.resolve(null);
  const tervezoP = fuvarozas ? getTervezo({}).catch(() => null) : Promise.resolve(null);
  const [adat, het, tervezo] = await Promise.all([getMaVaszon(), hetP, tervezoP]);
  const bejovo: BejovoSor[] = tervezo?.bejovo ?? [];

  // A mobil nézet kocsi-sávjai ugyanezt a hetet és bejövő-számot használják — nem számolunk kétszer.
  const elotoltes: KocsiSavElotoltes = Promise.resolve([het, fuvarozas ? bejovo.length : -1, null] as Awaited<KocsiSavElotoltes>);
  const { savok, dontesreVar, riasztasok } = await getKocsiSavok(adat, elotoltes);
  const savSzerint = new Map(savok.map((s) => [s.kod, s]));

  const aktiv = adat.kocsik.filter((k) => !k.helykitolto);
  const helyek = adat.kocsik.filter((k) => k.helykitolto);
  const dontDb = dontLista(adat, het, bejovo).db;
  const ajanlatDb = het?.ajanlatok.filter((a) => a.allapot !== "ajanlva" && !a.regi).length ?? 0;
  const hetSorok = new Map((het?.osszegzes?.kocsik ?? []).map((x) => [x.kod, x.het]));

  return (
    <div className="flex flex-col gap-3">
      {/* Telefon (768 px alatt): a korábbi Ma nézet, változatlanul */}
      <div className="flex flex-col gap-3 md:hidden">
        <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Kocsik" />
        {fuvarozas ? (
          <Link href="/fuvarozas2/tervezes" className="rounded-2xl border border-foreground/10 bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted/50">
            A hét: rések, ajánlatok, bejövő megbízások ›
          </Link>
        ) : null}
        <DontesreVarSor bejovo={dontesreVar.bejovo} kocsiraVar={dontesreVar.kocsiraVar} />
        <VisszfuvarRiasztasok riasztasok={riasztasok} ma={adat.ma} />
        <MaVaszonNezet adat={adat} savok={savok} />
      </div>

      {/* Asztal (768 px-től): Ma + hét egy lapon */}
      <div className="hidden flex-col gap-3 md:flex">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <Fuvarozas2Fulek aktiv="/fuvarozas2" cim="Ma + hét" cimNagy />
          </div>
          <div className="pt-1.5"><FejlecJobb adat={adat} het={het} szerkeszthet={szerk} /></div>
        </div>
        <IrodaSor adat={adat} />
        {fuvarozas && !het ? (
          <p className="rounded-xl bg-[var(--f2-amb-l)] px-4 py-2 text-sm text-[var(--f2-amb)]">A hét adatai most nem töltődtek be — frissítsd az oldalt; addig csak a mai rész látszik.</p>
        ) : null}
        {het ? <HetFigyelmeztetesek het={het} /> : null}

        <div className="grid gap-5 xl:h-[calc(100dvh-230px)] xl:min-h-[620px] xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="grid min-h-0 gap-5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
            {aktiv.map((k, i) => (
              <MaHetKocsi
                key={k.kod ?? `k-${i}`}
                k={k}
                adat={adat}
                het={het}
                sav={k.kod ? savSzerint.get(k.kod) ?? null : null}
                hetSor={hetSorok.get(k.kod ?? "")}
                szerk={szerk}
              />
            ))}
          </div>
          <MaHetPanel
            key={sp.res ?? ""}
            kezdo={sp.res && het ? "res" : "dont"}
            teljes={!!het}
            dontDb={dontDb}
            ajanlatDb={ajanlatDb}
            resDb={het?.resek.length ?? 0}
            dont={<MostDonts adat={adat} het={het} bejovo={bejovo} szerk={szerk} fuvarozas={fuvarozas} />}
            ajanlat={het ? <AjanlatokTab het={het} /> : null}
            res={het ? <ResTab het={het} szerk={szerk} /> : null}
          />
        </div>
        <Helykitoltok kocsik={helyek} />
      </div>
    </div>
  );
}
