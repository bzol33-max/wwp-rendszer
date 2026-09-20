"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Sun, UserRound } from "lucide-react";

const TABS = [
  { href: "/m", label: "Ma", icon: Sun },
  { href: "/m/holnap", label: "Holnap", icon: CalendarDays },
  { href: "/m/profil", label: "Profil", icon: UserRound },
];

export function MTabbar() {
  const p = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-[var(--m-line)] bg-[var(--m-surf)] pb-[env(safe-area-inset-bottom)]">
      {TABS.map((t) => {
        const aktiv = t.href === "/m" ? p === "/m" : p.startsWith(t.href);
        const I = t.icon;
        return (
          <Link key={t.href} href={t.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${aktiv ? "text-[var(--m-mint)]" : "text-[var(--m-muted)]"}`}>
            <I className="size-5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
