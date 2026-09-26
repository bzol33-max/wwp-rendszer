import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { MTabbar, SOFOR_TABOK, IRODA_TABOK, VEZETO_TABOK } from "@/components/m/tabbar";
import { budapestHetNapja } from "@/lib/fuvarozas/idozona";

// Mobil nézet három szerepre, ugyanazzal a kerettel (terv: „Mobil" vászon):
//   • sofőr (fuvarozas_sajat + alkalmazott): Ma · Holnap · Profil
//   • vezető (teljes Fuvarozás-jog): Ma · Fuvar · Cég · Rendszer
//   • iroda (elszamolas, Szabina): Papír · Számla és posta · Profil
// A sorrend fontos: aki sofőr, annak a terepen használt nézet jár akkor is,
// ha egyébként több joga van; a vezetői nézet a teljes Fuvarozás-joghoz
// tartozik (vezeto, admin), az irodai a csak-elszámolás joghoz.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const sofor = session.can("fuvarozas_sajat").view && !!session.employeeId;
  const iroda = session.can("elszamolas").view;
  const teljes = session.can("fuvarozas").view;
  const ok = sofor || iroda || teljes;
  const tabok = sofor ? SOFOR_TABOK : teljes ? VEZETO_TABOK : IRODA_TABOK;
  // Pénteken és szombaton a „Holnap” fül a hétfőt mutatja (app/m/holnap).
  const hetvege = [5, 6].includes(budapestHetNapja(new Date()));
  return (
    <div className="sofor-m mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div className="flex-1 px-4 pb-24 pt-4">
        {ok ? children : (
          <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm">
            <p className="font-semibold">Nincs jogosultságod ehhez a nézethez.</p>
            <p className="mt-1 text-[var(--m-muted)]">A sofőr-nézethez a fiókhoz alkalmazott (kocsi) kell rendelve legyen — szólj Zoltánnak.</p>
            <Link href="/erkezes" className="mt-3 inline-block underline">a régi dolgozói nézet →</Link>
          </div>
        )}
      </div>
      <MTabbar tabok={tabok} holnapFelirat={hetvege ? "Hétfő" : undefined} />
    </div>
  );
}
