import { getFuvarFulAdatok } from "@/lib/attekintes/actions";
import { getIdovonalak } from "@/lib/fuvarozas/actions";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { MegbizasReszlet } from "@/components/attekintes/jarmu-kartya";
import { FuvarTablazatMobil } from "@/components/attekintes/fuvar-tablazat-mobil";

export default async function FuvarPage() {
  // Az idővonal a GPS lap gyorsítótárából jön (getIdovonalak, 1 perc a mai
  // napra) — a getFuvarFulAdatok ugyanezt kéri, tehát nem fut kétszer.
  const [idovonal, adatok] = await Promise.all([getIdovonalak(budapestNapISO()), getFuvarFulAdatok()]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Fuvarozás — kocsinként</h1>

      {adatok.duvenbeck.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="text-sm font-bold">Duvenbeck-megbízás jött · {adatok.duvenbeck.length}</div>
          <p className="mt-0.5 text-xs text-amber-800">
            A sofőr telefonja nem mutatja a BMW-kapu időpontját (ZF), a dokkot és a tárolók számát — ezek csak a
            FRALI-iraton vannak, külön kell szólni a sofőrnek.
          </p>
          <div className="mt-2 flex flex-col gap-0.5 text-xs">
            {adatok.duvenbeck.map((d) => (
              <span key={d.id}>
                #{d.id} · {d.datum} · {d.utvonal}
              </span>
            ))}
          </div>
        </div>
      )}

      {adatok.kocsiNelkul.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="text-sm font-bold">Kocsi nélkül · {adatok.kocsiNelkul.length}</div>
          <p className="mt-0.5 text-xs text-amber-800">
            Folyamatban lévő megbízás, amihez még nincs kocsi rendelve — a Megbízások oldalon kell kijelölni.
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            {adatok.kocsiNelkul.map((m) => (
              <MegbizasReszlet key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}

      <FuvarTablazatMobil jarmuvek={idovonal.jarmuvek} csoportok={adatok.jarmuvek} most={adatok.betoltve} />
    </div>
  );
}
