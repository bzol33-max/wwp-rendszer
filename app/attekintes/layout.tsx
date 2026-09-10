import { LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { AttekintesTabBar } from "@/components/attekintes/tab-bar";
import { getAttekintesTheme } from "@/lib/attekintes/theme";
import { getAttekintesProfil } from "@/lib/attekintes/tabs";
import { getHaviFelvasarlasOsszefoglalo } from "@/lib/attekintes/actions";
import { HaviFelvasarlasButton } from "@/components/attekintes/havi-felvasarlas-modal";
import { PullToRefresh } from "@/components/mobil/pull-to-refresh";

export default async function AttekintesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const theme = getAttekintesTheme(session.name);
  const profil = getAttekintesProfil(session.name);

  if (!session.can("attekintes").view) {
    return (
      <div
        style={theme}
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 bg-[var(--at-bg)] px-4 text-center"
      >
        <p className="text-sm text-[var(--at-muted)]">Nincs jogosultságod ehhez a nézethez.</p>
      </div>
    );
  }

  const haviTipusok = await getHaviFelvasarlasOsszefoglalo();

  return (
    <div
      style={theme}
      className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-[var(--at-bg)] text-[var(--at-text)]"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-xs text-[var(--at-muted)]">
        <span>{session.name}</span>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-[var(--at-text)]">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <HaviFelvasarlasButton tipusok={haviTipusok} />

      <PullToRefresh className="flex-1 overflow-y-auto" indicatorClassName="text-[var(--at-muted)]">
        <div className="px-4 pb-20">{children}</div>
      </PullToRefresh>
      <AttekintesTabBar profil={profil} />
    </div>
  );
}
