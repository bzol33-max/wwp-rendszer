"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreHorizontal, Settings, UsersRound } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import type { ModuleKey } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { useCurrentUserName } from "@/lib/current-user";
import { logout } from "@/lib/auth/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MOBILE_PRIMARY_TAB_COUNT = 4;

export function AppShell({
  children,
  isAdmin,
  visibleModuleKeys,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  visibleModuleKeys: ModuleKey[];
}) {
  const pathname = usePathname();
  const userName = useCurrentUserName();
  const [moreOpen, setMoreOpen] = useState(false);

  // A bejelentkezési oldalnak és az önálló, korlátozott mobil nézeteknek
  // (mobil összefoglaló, posta, saját érkezés, felvásárlás mobil rögzítés,
  // áttekintés — utóbbinak az al-oldalai, pl. /attekintes/szamlak, is
  // idetartoznak) nincs (asztali méretre tervezett) oldalsávja — ezek saját,
  // könnyű fejlécet rajzolnak.
  if (
    pathname === "/login" ||
    pathname === "/mobil" ||
    pathname === "/posta" ||
    pathname === "/erkezes" ||
    pathname === "/felvasarlas" ||
    pathname.startsWith("/attekintes")
  ) {
    return <>{children}</>;
  }

  const navItems = NAV_ITEMS.filter((item) => visibleModuleKeys.includes(item.key));
  const primaryTabs = navItems.slice(0, MOBILE_PRIMARY_TAB_COUNT);
  const overflowNavItems = navItems.slice(MOBILE_PRIMARY_TAB_COUNT);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  function closeMore() {
    setMoreOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="text-sm font-semibold text-white">
            Well-Worn Pallet
          </div>
          <div className="text-xs text-sidebar-foreground/60">
            Vállalatirányítás
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 py-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
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
          {isAdmin && (
            <Link
              href="/beallitasok/felhasznalok"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                pathname.startsWith("/beallitasok/felhasznalok")
                  ? "bg-sidebar-accent text-white font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              <UsersRound className="h-4 w-4" />
              Felhasználók
            </Link>
          )}
          <Link
            href="/beallitasok/tipusok"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/beallitasok/tipusok")
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
        <div className="mx-auto max-w-[1800px] px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-7">
          {children}
        </div>
      </main>

      {/* Mobil alsó navigáció — a bal oldali sáv 768px alatt elrejtve, mert
          keskeny (pl. 390px-es) képernyőn a fix 224px-es sáv a viewport
          több mint felét elfoglalná. A megjelenő modulokból max. 4 kerül
          közvetlen fülre, a többi (és a Beállítások/kijelentkezés, ami itt
          nincs máshol elérhető) a "Több" fülre kerül. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primaryTabs.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                active
                  ? "text-white font-medium"
                  : "text-sidebar-foreground/60"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
            moreOpen ? "text-white font-medium" : "text-sidebar-foreground/60"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          Több
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Több</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {overflowNavItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMore}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            {overflowNavItems.length > 0 && (
              <div className="my-1 border-t" />
            )}
            {isAdmin && (
              <Link
                href="/beallitasok/felhasznalok"
                onClick={closeMore}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  pathname.startsWith("/beallitasok/felhasznalok")
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-muted"
                )}
              >
                <UsersRound className="h-4 w-4" />
                Felhasználók
              </Link>
            )}
            <Link
              href="/beallitasok/tipusok"
              onClick={closeMore}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                pathname.startsWith("/beallitasok/tipusok")
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-muted"
              )}
            >
              <Settings className="h-4 w-4" />
              Típusok és árak
            </Link>
            {userName && (
              <div className="mt-1 flex items-center justify-between gap-2 border-t px-3 pt-3">
                <span className="truncate text-xs text-muted-foreground">
                  {userName}
                </span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Kijelentkezés
                  </button>
                </form>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
