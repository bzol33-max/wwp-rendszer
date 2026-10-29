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

// Asztali oldalsáv (redesign 0, 2026-10-29): 88 px keskeny sáv, menüpontonként
// ikon felül / felirat alatta. A színek szándékosan beégetettek: az Apple-séma
// oldalsáv-értékei nem esnek egybe a shadcn --sidebar-* tokenekkel, azokat
// pedig a mobil alsó tab-sáv is használja, amit ez a modul nem érint.
const SIDEBAR_ITEM =
  "flex flex-col items-center justify-center gap-1 rounded-[12px] px-1 py-2 text-center text-[12px] leading-[1.15] break-words transition-colors";
const SIDEBAR_ITEM_ACTIVE =
  "bg-(image:--grad-primary) text-white font-medium shadow-[var(--glow-primary),var(--hi)]";
const SIDEBAR_ITEM_IDLE =
  "text-[#48484A] hover:bg-[rgba(0,0,0,0.04)] [&_svg]:text-[#0A84FF]";
const SIDEBAR_LINE = "border-[rgba(0,0,0,0.08)]";

export function AppShell({
  children,
  isAdmin,
  visibleModuleKeys,
  hiddenHrefs = [],
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  visibleModuleKeys: ModuleKey[];
  /** Feature flaggel elrejtett menüpontok (lib/fuvarozas2/flag.ts). */
  hiddenHrefs?: string[];
}) {
  const pathname = usePathname();
  const userName = useCurrentUserName();
  const [moreOpen, setMoreOpen] = useState(false);

  // A bejelentkezési oldalnak és az önálló, korlátozott mobil nézeteknek
  // (posta, saját érkezés, felvásárlás mobil rögzítés,
  // áttekintés — utóbbinak az al-oldalai, pl. /attekintes/szamlak, is
  // idetartoznak) nincs (asztali méretre tervezett) oldalsávja — ezek saját,
  // könnyű fejlécet rajzolnak.
  if (
    pathname === "/login" ||
    pathname === "/erkezes" ||
    pathname === "/m" ||
    pathname.startsWith("/m/") ||
    pathname === "/m" ||
    pathname === "/felvasarlas" ||
    pathname.startsWith("/attekintes")
  ) {
    return <>{children}</>;
  }

  const navItems = NAV_ITEMS.filter(
    (item) =>
      !hiddenHrefs.includes(item.href) &&
      (visibleModuleKeys.includes(item.key) || (item.altKeys ?? []).some((k) => visibleModuleKeys.includes(k)))
  );
  const primaryTabs = navItems.slice(0, MOBILE_PRIMARY_TAB_COUNT);
  const overflowNavItems = navItems.slice(MOBILE_PRIMARY_TAB_COUNT);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  function closeMore() {
    setMoreOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden w-[88px] shrink-0 flex-col border-r bg-white/75 shadow-[4px_0_24px_-16px_rgba(16,24,40,.25)] backdrop-blur-[20px] md:flex",
          SIDEBAR_LINE
        )}
      >
        <div className="flex justify-center py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[linear-gradient(180deg,#3A3A3C,#1D1D1F)] text-[18px] leading-none font-semibold text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,.5)]">
            W
            <span className="sr-only">
              Well-Worn Pallet — Vállalatirányítás
            </span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2 pb-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  SIDEBAR_ITEM,
                  active ? SIDEBAR_ITEM_ACTIVE : SIDEBAR_ITEM_IDLE
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "mt-auto flex flex-col gap-1 border-t px-2 py-2",
            SIDEBAR_LINE
          )}
        >
          {isAdmin && (
            <Link
              href="/beallitasok/felhasznalok"
              className={cn(
                SIDEBAR_ITEM,
                pathname.startsWith("/beallitasok/felhasznalok")
                  ? SIDEBAR_ITEM_ACTIVE
                  : SIDEBAR_ITEM_IDLE
              )}
            >
              <UsersRound className="h-[22px] w-[22px]" />
              Felhasználók
            </Link>
          )}
          <Link
            href="/beallitasok/tipusok"
            className={cn(
              SIDEBAR_ITEM,
              pathname.startsWith("/beallitasok/tipusok")
                ? SIDEBAR_ITEM_ACTIVE
                : SIDEBAR_ITEM_IDLE
            )}
          >
            <Settings className="h-[22px] w-[22px]" />
            Típusok és árak
          </Link>
          {/* A „Szakoly · Balkány · Nyíregyháza” sor 88 px-en 3 sorba törik,
              a szeparátorok a sorok végén lógnak. Ezért soronként egy
              telephely, a leghosszabb rövidítve; a teljes felsorolás a
              title-ben marad. A telephelyek maguk (lib/nav.ts SITES) nem
              változnak, ez csak felirat. */}
          <div
            title="Szakoly · Balkány · Nyíregyháza"
            className="px-1 pt-1 text-center text-[12px] leading-[1.3] text-[#6E6E73]"
          >
            <div>Szakoly</div>
            <div>Balkány</div>
            <div>Nyíregy.</div>
          </div>
          {userName && (
            <div
              className={cn(
                "flex flex-col items-center gap-1 border-t pt-2",
                SIDEBAR_LINE
              )}
            >
              <span
                title={userName}
                className="w-full truncate text-center text-[12px] text-[#6E6E73]"
              >
                {userName}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  title="Kijelentkezés"
                  className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[#48484A] transition-colors hover:bg-[rgba(0,0,0,0.04)]"
                >
                  <LogOut className="h-[18px] w-[18px]" />
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
          keskeny (pl. 390px-es) képernyőn az oldalsáv (korábban 224, a
          redesign 0 óta 88 px) elvenné a viewport szélességét. A megjelenő
          modulokból max. 4 kerül
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
