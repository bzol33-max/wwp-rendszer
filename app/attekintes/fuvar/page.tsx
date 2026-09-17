import { getFuvarFulAdatok, getJarmuPoziciok } from "@/lib/attekintes/actions";
import { JarmuKartya, MegbizasReszlet } from "@/components/attekintes/jarmu-kartya";

export default async function FuvarPage() {
  const [poziciok, adatok] = await Promise.all([getJarmuPoziciok(), getFuvarFulAdatok()]);
  const poziciokBySofor = Object.fromEntries(poziciok.map((p) => [p.jarmu.sofor, p]));

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Fuvarozás — kocsinként</h1>

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

      <div className="flex flex-col gap-3">
        {adatok.jarmuvek.map((cs) => (
          <JarmuKartya key={cs.jarmu.sofor} csoport={cs} pozicio={poziciokBySofor[cs.jarmu.sofor]} />
        ))}
      </div>
    </div>
  );
}
