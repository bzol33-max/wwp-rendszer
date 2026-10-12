import { PageHeader } from "@/components/layout/page-header";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { KozosKalkulator } from "@/components/fuvarozas2/kozos-kalkulator";
import { TimocomAjanlatKartya, TimocomBefogado, TimocomLista } from "@/components/fuvarozas2/timocom";
import { getKalkulatorJarmuvek } from "@/lib/fuvarozas2/kalkulator";
import { getTimocomAjanlat, getTimocomAjanlatok } from "@/lib/fuvarozas2/timocom";
import { kalkulatorMegallo } from "@/lib/fuvarozas2/timocom-ajanlat";

export const dynamic = "force-dynamic";

// Timocom ajánlat → WWP (fuvarszervező pult, B út). A „→ WWP" könyvjelző-gomb
// ide nyit #d=… adattal; a befogadó elmenti, és ?id=… címre vált.
// 2026-10-12: a fülsorban „Ajánlat”. Kiválasztott ajánlat nélkül a kézi
// kalkulátor látszik (a régi /fuvarozas2/kalkulator ide irányít át, a
// ?honnan=…&hova=… az első két megálló — pl. a Tervezés „Kalkulátor ezzel a réssel”).
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; honnan?: string; hova?: string }> }) {
  const sp = await searchParams;
  const [aktiv, lista, jarmuvek] = await Promise.all([
    sp.id ? getTimocomAjanlat(sp.id) : Promise.resolve(null),
    getTimocomAjanlatok(30),
    getKalkulatorJarmuvek(),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Ajánlat" subtitle="A Timocomban megnyitott ajánlat egy gombnyomással ide jön: kiolvasva, figyelmeztetésekkel, kalkulációval. Ajánlat nélkül: kézi kalkuláció (útvonal, HU-GO útdíj, önköltség, ár)." />
      <Fuvarozas2Fulek aktiv="/fuvarozas2/timocom" />
      {/* key: új ajánlatnál újraindul, így a behozó rész összecsukva nyílik. */}
      <TimocomBefogado key={aktiv?.id ?? "uj"} vanAktiv={!!aktiv} />
      {aktiv ? (
        <>
          <TimocomAjanlatKartya sor={aktiv} />
          <KozosKalkulator key={aktiv.id} jarmuvek={jarmuvek} kezdoMegallok={aktiv.ajanlat.helyek.map(kalkulatorMegallo)} />
        </>
      ) : (
        <>
          {sp.id ? <p className="text-sm text-muted-foreground">Ez az ajánlat nem található.</p> : null}
          <KozosKalkulator key={`kezi-${sp.honnan ?? ""}-${sp.hova ?? ""}`} jarmuvek={jarmuvek} kezdoMegallok={[sp.honnan ?? "", sp.hova ?? ""]} />
        </>
      )}
      <TimocomLista sorok={lista} aktivId={aktiv?.id ?? null} />
    </div>
  );
}
