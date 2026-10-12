import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { getSoforNap } from "@/lib/fuvarozas/sofor";
import { logout } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireSession();
  // Irodai fióknál nincs kocsi — a sofőr-lekérdezést meg sem hívjuk.
  const sofor = session.can("fuvarozas_sajat").view && !!session.employeeId;
  const nap = sofor && session.employeeId ? await getSoforNap(session.employeeId) : null;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Profil</h1>
      <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm">
        <div className="text-lg font-semibold">{session.name}</div>
        <div className="text-[var(--m-muted)]">{nap?.jarmuLabel ?? (sofor ? "nincs hozzárendelt kocsi" : "iroda")}</div>
      </div>
      <div className="rounded-xl bg-[var(--m-surf)] p-4 text-sm text-[var(--m-muted)]">
        {sofor ? (
          <>
            <p>Lerakás után fotózd le a papírt — ebből számlázunk. Az eredetit hozd haza, Szabina adja fel postán.</p>
            <p className="mt-2">Térerő nélkül a gombok újrapróbálják magukat, amíg el nem mennek.</p>
          </>
        ) : (
          <>
            <p>Posta fül: a kiszámlázott fuvarok, amelyek papírját postára kell adni. Ha megjött az eredeti papír (CMR / fuvarlevél), jelöld: „Papír megjött ✓” — tévedésből visszavonható.</p>
            <p className="mt-2">A „Feladva ✓” azt jelenti, hogy a papírt postára adtad — ezzel a fuvar kész. Ha a papír még nincs nyugtázva, a rendszer rákérdez, de nem tilt.</p>
            <p className="mt-2">Számlázni az asztali Elszámolásban lehet; a számlaszám a Számlázz.hu-ból magától is párosul.</p>
          </>
        )}
      </div>
      {sofor ? (
        <a href="/erkezes" className="rounded-xl bg-[var(--m-surf)] p-4 text-sm underline">Előlegek, jelenlét — a régi dolgozói nézet →</a>
      ) : (
        <Link href="/fuvarozas2/megbizasok" className="rounded-xl bg-[var(--m-surf)] p-4 text-sm underline">Teljes Elszámolás nézet (Megbízások · pénz) →</Link>
      )}
      <form action={logout}>
        <button type="submit" className="w-full rounded-xl border border-[var(--m-line)] py-3 text-sm font-semibold">Kijelentkezés</button>
      </form>
    </div>
  );
}
