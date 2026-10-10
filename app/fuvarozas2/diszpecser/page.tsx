import { requireSession } from "@/lib/auth/dal";
import { getDiszpecser } from "@/lib/fuvarozas2/diszpecser";
import { nezetUrlbol, szuroUrlbol } from "@/lib/fuvarozas2/diszpecser-alap";
import { Fuvarozas2Fulek } from "@/components/fuvarozas2/fulek";
import { DiszpecserNezet } from "@/components/fuvarozas2/diszpecser";
import { AutoFrissites } from "@/components/fuvarozas2/auto-frissites";

export const dynamic = "force-dynamic";

// Diszpécser (6. fázis): a fuvarszervező egy képernyője — kocsinkénti
// idővonal a nap menetéből, probléma-sáv, részlet-panel; heti beosztás,
// lista és térkép nézet. Megtekintés: fuvarozás nézési jog; a műveletek
// (feladat lezárása) a fuvarozás szerkesztési jogával, a szerver-akcióban
// ellenőrizve (lib/menet/akciok.ts).

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
  const param = { get: (k: string) => { const v = sp[k as keyof Kereses]; return typeof v === "string" ? v : null; } };
  const frissitve = new Date(adat.most).toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3">
      <Fuvarozas2Fulek aktiv="/fuvarozas2/diszpecser" cim="Diszpécser" />
      <div className="-mt-1 flex justify-end"><AutoFrissites frissitve={frissitve} /></div>
      <DiszpecserNezet key={adat.nap} adat={adat} kezdoSzuro={szuroUrlbol(param)} kezdoNezet={nezetUrlbol(param.get("nezet"))} />
    </div>
  );
}
