"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useCurrentUserName } from "@/lib/current-user";
import { logout } from "@/lib/auth/actions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const userName = useCurrentUserName();

  // A bejelentkezési oldalnak nincs oldalsáv/navigáció — önálló képernyő.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="text-sm font-semibold text-white">
            Well-Worn Pallet
          </div>
          <div className="text-xs text-sidebar-foreground/60">
            Vállalatirányítás
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-white font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-sidebar-border px-2 py-3">
          <Link
            href="/beallitasok/tipusok"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/beallitasok")
                ? "bg-sidebar-accent text-white font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white"
            )}
          >
            <Settings className="h-4 w-4" />
            Típusok és árak
          </Link>
          <div className="px-3 pb-1 text-xs text-sidebar-foreground/40">
            Szakoly · Balkány · Nyíregyháza
          </div>
          {userName && (
            <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-3 pt-2">
              <span className="truncate text-xs text-sidebar-foreground/70">
                {userName}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  title="Kijelentkezés"
                  className="flex items-center justify-center rounded p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/60 hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        {/* A tartalom szélessége a kijelzőhöz igazodik (nagy felbontáson akár
            teljes szélességben), hogy a sok oszlopos táblázatok (pl.
            Fuvarozás — Számla/Posta) ne igényeljenek belső görgetést —
            csak egy nagyon nagy max-szélesség van, hogy ultraszéles
            monitoron ne fusson szélről szélre a tartalom. */}
        <div className="mx-auto max-w-[1800px] px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
