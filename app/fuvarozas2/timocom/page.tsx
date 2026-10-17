import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { KozosKalkulator } from "@/components/fuvarozas2/kozos-kalkulator";
import { TimocomAjanlatKartya, TimocomBefogado, TimocomLista } from "@/components/fuvarozas2/timocom";
import { getKalkulatorJarmuvek } from "@/lib/fuvarozas2/kalkulator";
import { getTimocomAjanlat, getTimocomAjanlatok } from "@/lib/fuvarozas2/timocom";
import { kalkulatorMegallo } from "@/lib/fuvarozas2/timocom-ajanlat";
import { getKeresesJavaslatok } from "@/lib/fuvarozas2/kereses-javaslat";
import { KeresesiJavaslatok, KivalasztottIrany } from "@/components/fuvarozas2/kereses-javaslat";

export const dynamic = "force-dynamic";

// Timocom ajánlat → WWP (fuvarszervező pult, B út). A „→ WWP" könyvjelző-gomb
// ide nyit #d=… adattal; a befogadó elmenti, és ?id=… címre vált.
// 2026-10-12: a fülsorban „Ajánlat”. Kiválasztott ajánlat nélkül a kézi
// kalkulátor látszik (a régi /fuvarozas2/kalkulator ide irányít át, a
// ?honnan=…&hova=… az első két megálló — pl. a Tervezés „Kalkulátor ezzel a réssel”).
// 2026-10-17 (Q2, docs/ajanlat-q2-terv.md): felül a felszabaduló kocsik 3-3 iránya;
// a „keres” gomb ?kocsi=…&irany=… címre visz, és kitölti a kalkulátort.
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; honnan?: string; hova?: string; kocsi?: string; irany?: string }> }) {
  const sp = await searchParams;
  const [aktiv, lista, jarmuvek, javaslat] = await Promise.all([
    sp.id ? getTimocomAjanlat(sp.id) : Promise.resolve(null),
    getTimocomAjanlatok(30),
    getKalkulatorJarmuvek(),
    getKeresesJavaslatok(),
  ]);
  const kocsi = sp.kocsi ?? null, irany = sp.irany ?? null;
  const valasztott = javaslat?.kocsik.find((k) => k.kod === kocsi);
  const valIrany = valasztott?.iranyok.find((i) => i.kulcs === irany);
  const honnan = valIrany && valasztott?.szabad ? valasztott.szabad.hely.varos : sp.honnan ?? "";
  const hova = valIrany ? valIrany.cel.varos : sp.hova ?? "";
  const ajanlatCim = new Map(lista.map((t) => {
    const hs = t.ajanlat.helyek;
    const f = hs.find((h) => h.tipus === "fel") ?? hs[0];
    const l = [...hs].reverse().find((h) => h.tipus === "le") ?? hs[hs.length - 1];
    return [t.id, {
      cim: `${t.ajanlat.megbizo ?? "?"}: ${f?.varos ?? "?"} → ${l?.varos ?? "?"}`,
      ar: t.ajanlat.ar ? `${t.ajanlat.ar.osszeg.toLocaleString("hu-HU")} ${t.ajanlat.ar.penznem ?? ""}`.trim() : null,
    }] as const;
  }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Ajánlat" subtitle="Merre keress fuvart a kiürülő kocsiknak (saját múlt, Timocom, hazafelé), és mennyit kérj érte: útvonal, HU-GO útdíj, önköltség, ár." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/timocom" />
      {/* key: új ajánlatnál újraindul, így a behozó rész összecsukva nyílik. */}
      <TimocomBefogado key={aktiv?.id ?? "uj"} vanAktiv={!!aktiv} />
      <KeresesiJavaslatok adat={javaslat} kocsi={kocsi} irany={irany} />
      {aktiv ? (
        <>
          <TimocomAjanlatKartya sor={aktiv} />
          <KozosKalkulator key={aktiv.id} jarmuvek={jarmuvek} kezdoMegallok={aktiv.ajanlat.helyek.map(kalkulatorMegallo)} />
        </>
      ) : (
        <>
          {sp.id ? <p className="text-sm text-muted-foreground">Ez az ajánlat nem található.</p> : null}
          <KivalasztottIrany adat={javaslat} kocsi={kocsi} irany={irany} ajanlatCim={ajanlatCim} />
          <KozosKalkulator key={`kezi-${honnan}-${hova}`} jarmuvek={jarmuvek} kezdoMegallok={[honnan, hova]} />
        </>
      )}
      <TimocomLista sorok={lista} aktivId={aktiv?.id ?? null} />
    </div>
  );
}
