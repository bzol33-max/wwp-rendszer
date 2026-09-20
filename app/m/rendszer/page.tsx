import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { getRendszerEgeszseg, type EgeszsegAllapot } from "@/lib/fuvarozas2/rendszer";
import { logout } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

// Vezetői mobil — „Rendszer" fül: megy-e minden magától, és a fiók.
// A sorok ugyanabból a getRendszerEgeszseg()-ből jönnek, mint az asztali
// /fuvarozas2/rendszer — a hiba ott derüljön ki, ahol a telefon van.
// A cégirat/műszaki figyelmeztetések (terv) még nincsenek adatforrással —
// amint a Járművek modul lejárat-táblája megvan, ide kerülnek.
const SZIN: Record<EgeszsegAllapot, string> = {
  rendben: "bg-[var(--m-mint-d)] text-[var(--m-mint)]",
  figyelmeztetes: "bg-[var(--m-amb-d)] text-[var(--m-amb)]",
  gond: "bg-[var(--m-red-d)] text-[var(--m-red)]",
  nincs_adat: "bg-[var(--m-surf2)] text-[var(--m-muted)]",
};
const JEL: Record<EgeszsegAllapot, string> = { rendben: "✓", figyelmeztetes: "!", gond: "✕", nincs_adat: "–" };

export default async function Page() {
  await requireViewPermission("fuvarozas");
  const session = await requireSession();
  const { sorok } = await getRendszerEgeszseg();
  const gond = sorok.filter((s) => s.allapot === "gond").length;
  const fig = sorok.filter((s) => s.allapot === "figyelmeztetes").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Rendszer</h1>
        <div className="text-sm text-[var(--m-muted)]">
          {gond === 0 && fig === 0 ? "minden rendben" : `${gond} gond · ${fig} figyelmeztetés`}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {sorok.map((s) => (
          <div key={s.kulcs} className="flex flex-col gap-1 rounded-2xl bg-[var(--m-surf)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{s.cim}</div>
                <div className="text-xs text-[var(--m-muted)]">{s.ertek}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${SZIN[s.allapot]}`}>{JEL[s.allapot]}</span>
            </div>
            {s.reszlet ? <div className="text-xs text-[var(--m-muted)]">{s.reszlet}</div> : null}
          </div>
        ))}
      </div>

      <Link href="/fuvarozas2/rendszer" className="rounded-xl bg-[var(--m-surf)] p-3 text-sm underline">Teljes Rendszer-nézet →</Link>

      <div className="flex flex-col gap-2 rounded-2xl bg-[var(--m-surf)] p-3">
        <div className="text-xs font-semibold uppercase text-[var(--m-muted)]">Fiók</div>
        <div className="text-lg font-semibold">{session.name}</div>
        <div className="text-xs text-[var(--m-muted)]">{session.username}</div>
        <Link href="/fuvarozas2" className="text-sm underline">Fuvarozás 2 asztali nézet →</Link>
        <form action={logout}>
          <button type="submit" className="mt-1 w-full rounded-xl border border-[var(--m-line)] py-3 text-sm font-semibold">Kijelentkezés</button>
        </form>
      </div>
    </div>
  );
}
