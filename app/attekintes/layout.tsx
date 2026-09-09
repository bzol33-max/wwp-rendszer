import { LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { AttekintesTabBar } from "@/components/attekintes/tab-bar";

export default async function AttekintesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.can("attekintes").view) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 bg-muted/40 px-4 text-center">
        <p className="text-sm text-muted-foreground">Nincs jogosultságod ehhez a nézethez.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-muted/40">
      <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
        <span>{session.name}</span>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-20">{children}</div>
      <AttekintesTabBar />
    </div>
  );
}
