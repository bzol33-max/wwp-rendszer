import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { MTabbar, SOFOR_TABOK, IRODA_TABOK } from "@/components/m/tabbar";

// Mobil nézet két szerepre, ugyanazzal a kerettel (terv: „Mobil" vászon):
//   • sofőr (fuvarozas_sajat + alkalmazott): Ma · Holnap · Profil
//   • iroda (elszamolas, Szabina): Papír · Számla és posta · Profil
// A teljes Fuvarozás-jog (vezeto, admin) mindkettőt elérheti; alapból a
// sofőr-nézetet kapja, mert az a terepen használt.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const sofor = session.can("fuvarozas_sajat").view && !!session.employeeId;
  const iroda = session.can("elszamolas").view;
  const teljes = session.can("fuvarozas").view;
  const ok = sofor || iroda || teljes;
  const tabok = sofor || (teljes && !iroda) ? SOFOR_TABOK : IRODA_TABOK;
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
      <MTabbar tabok={tabok} />
    </div>
  );
}
