import { requireSession } from "@/lib/auth/dal";
import { getDiszpecser } from "@/lib/fuvarozas2/diszpecser";
import { nezetUrlbol, szuroUrlbol } from "@/lib/fuvarozas2/diszpecser-alap";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { DiszpecserNezet } from "@/components/fuvarozas2/diszpecser";
import { AutoFrissites } from "@/components/fuvarozas2/auto-frissites";
import { MenettervPanel } from "@/components/fuvarozas2/menetterv";
import { getMenettervNap } from "@/lib/menet/akciok";

export const dynamic = "force-dynamic";

// Diszpécser (6. fázis): a fuvarszervező egy képernyője — kocsinkénti
// idővonal a nap menetéből, probléma-sáv, részlet-panel; heti beosztás,
// lista és térkép nézet. Megtekintés: fuvarozás nézési jog; a műveletek
// (feladat lezárása) a fuvarozás szerkesztési jogával, a szerver-akcióban
// ellenőrizve (lib/menet/akciok.ts).
// 2026-10-12: a Menetterv (a nap feladat-sorrendje, átrendezés, jóváhagyás,
// optimalizáló) a Tervezésből ide került, a Diszpécser napválasztójának
// napjára (#menetterv horgony); szerkesztés: fuvarozás szerkesztési jog.

const napEltolva = (nap: string, n: number) => {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Kereses = { nap?: string; nezet?: string; jarmu?: string; sofor?: string; partner?: string; telephely?: string; statusz?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Kereses> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (!session.can("fuvarozas").view) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">Nincs jogosultságod ehhez a nézethez.</p>
      </div>
    );
  }
  const adat = await getDiszpecser(sp.nap ?? null);
  const menetterv = await getMenettervNap(adat.nap);
  const menetNapCimke = `${adat.nap === adat.ma ? "ma, " : adat.nap === napEltolva(adat.ma, 1) ? "holnap, " : ""}${new Date(`${adat.nap}T12:00:00Z`).toLocaleDateString("hu-HU", { timeZone: "UTC", weekday: "long", month: "2-digit", day: "2-digit" })}`;
  const param = { get: (k: string) => { const v = sp[k as keyof Kereses]; return typeof v === "string" ? v : null; } };
  const frissitve = new Date(adat.most).toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/diszpecser" cim="Diszpécser" />
      <div className="-mt-1 flex justify-end"><AutoFrissites frissitve={frissitve} /></div>
      <DiszpecserNezet key={adat.nap} adat={adat} kezdoSzuro={szuroUrlbol(param)} kezdoNezet={nezetUrlbol(param.get("nezet"))} />
      <MenettervPanel nap={adat.nap} napCimke={menetNapCimke} kocsik={menetterv.kocsik} hiba={menetterv.hiba} szerkeszthet={session.can("fuvarozas").edit} />
    </div>
  );
}
