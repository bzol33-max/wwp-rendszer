import { getJarmuMegbizasok, getJarmuPoziciok } from "@/lib/attekintes/actions";
import { JarmuKartya } from "@/components/attekintes/jarmu-kartya";

export default async function FuvarPage() {
  const [poziciok, csoportok] = await Promise.all([getJarmuPoziciok(), getJarmuMegbizasok()]);
  const poziciokBySofor = Object.fromEntries(poziciok.map((p) => [p.jarmu.sofor, p]));

  return (
    <div className="flex flex-col gap-4 py-4">
      <h1 className="text-base font-semibold">Fuvarozás — kocsinként</h1>

      <div className="flex flex-col gap-3">
        {csoportok.map((cs) => (
          <JarmuKartya
            key={cs.jarmu.sofor}
            jarmu={cs.jarmu}
            pozicio={poziciokBySofor[cs.jarmu.sofor]}
            megbizasok={cs.megbizasok}
          />
        ))}
      </div>
    </div>
  );
}
