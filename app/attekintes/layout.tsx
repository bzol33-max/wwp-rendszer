import { LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { AttekintesTabBar } from "@/components/attekintes/tab-bar";
import { ATTEKINTES_THEME_STYLE } from "@/lib/attekintes/theme";
import { getHaviFelvasarlasOsszefoglalo } from "@/lib/attekintes/actions";

export default async function AttekintesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.can("attekintes").view) {
    return (
      <div
        style={ATTEKINTES_THEME_STYLE}
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 bg-[var(--at-bg)] px-4 text-center"
      >
        <p className="text-sm text-[var(--at-muted)]">Nincs jogosultságod ehhez a nézethez.</p>
      </div>
    );
  }

  const haviTipusok = await getHaviFelvasarlasOsszefoglalo();

  return (
    <div
      style={ATTEKINTES_THEME_STYLE}
      className="mx-auto flex min-h-screen max-w-md flex-col bg-[var(--at-bg)] text-[var(--at-text)]"
    >
      <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--at-muted)]">
        <span>{session.name}</span>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-[var(--at-text)]">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      {haviTipusok.length > 0 && (
        <div className="px-4 pb-2">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--at-muted)]">
            Havi felvásárlás
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {haviTipusok.map((t) => (
              <div
                key={t.tipus}
                className="shrink-0 rounded-md bg-[var(--at-tile)] px-2 py-1"
              >
                <div className="text-[9px] text-[var(--at-muted)]">{t.tipus}</div>
                <div className="text-sm font-bold tabular-nums text-[var(--at-positive)]">+{t.qty}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-20">{children}</div>
      <AttekintesTabBar />
    </div>
  );
}
