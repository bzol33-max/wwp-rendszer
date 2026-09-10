import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getSzamlaPostaFuvarok } from "@/lib/fuvarozas/megbizasok";
import { RefreshButton } from "@/components/mobil/refresh-button";
import { PullToRefresh } from "@/components/mobil/pull-to-refresh";
import { MOBIL_THEME } from "@/lib/mobil-theme";
import { PostaLista } from "@/components/posta/posta-lista";
import { logout } from "@/lib/auth/actions";

export default async function PostaPage() {
  const session = await requireSession();
  // A "posta" jog önmagában is feljogosít a Bér fuvarok Számla/Posta
  // listájának megtekintésére és a "Postázva" jelölésre — ez egy
  // szándékosan önálló, korlátozott nézet, független attól, hogy a
  // felhasználó a teljes Fuvarozás modulhoz hozzáfér-e (ld. lib/auth/
  // permissions.ts OPT_IN_MODULES).
  const showPosta = session.can("fuvarozas").view || session.can("posta").view;

  const rows = showPosta ? await getSzamlaPostaFuvarok() : [];

  return (
    <div
      style={MOBIL_THEME}
      className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-[var(--mob-bg)] text-[var(--mob-text)]"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 text-xs text-[var(--mob-muted)]">
        <Link href="/" className="flex items-center gap-1 hover:text-[var(--mob-text)]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Rendszer
        </Link>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-[var(--mob-text)]">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <PullToRefresh className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">Posta</h1>
              <p className="text-xs text-[var(--mob-muted)]">Bér fuvarok — postázásra várnak</p>
            </div>
            <RefreshButton />
          </div>

          {!showPosta ? (
            <p className="text-sm text-[var(--mob-muted)]">
              Nincs jogosultságod ehhez a nézethez.
            </p>
          ) : (
            <PostaLista initialRows={rows} />
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}
