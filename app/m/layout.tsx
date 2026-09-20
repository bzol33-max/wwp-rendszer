import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { MTabbar } from "@/components/m/tabbar";

// Sofőr mobil nézet — Ma · Holnap · Profil (döntés: nincs Jelenlét/Feladatok).
// Jog: fuvarozas_sajat (sofőr, csak a saját kocsi — a szűrés a szerveren,
// lib/fuvarozas/sofor.ts) vagy fuvarozas (diszpécser próbához).
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const ok = (session.can("fuvarozas_sajat").view || session.can("fuvarozas").view) && !!session.employeeId;
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
      <MTabbar />
    </div>
  );
}
