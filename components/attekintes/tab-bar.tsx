"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Mail, Package, Truck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttekintesProfil } from "@/lib/attekintes/tabs";

const TABS_BY_PROFIL: Record<
  AttekintesProfil,
  { href: string; label: string; icon: typeof Building2 }[]
> = {
  zoltan: [
    { href: "/attekintes", label: "Nyíregyháza", icon: Building2 },
    { href: "/attekintes/szamlak", label: "Számlák", icon: Wallet },
    { href: "/attekintes/fuvar", label: "Fuvar", icon: Truck },
    { href: "/attekintes/keszlet", label: "Készlet", icon: Package },
  ],
  szabina: [
    { href: "/attekintes", label: "Nyíregyháza", icon: Building2 },
    { href: "/attekintes/posta", label: "Posta", icon: Mail },
    { href: "/attekintes/fuvar", label: "Fuvar", icon: Truck },
  ],
};

export function AttekintesTabBar({ profil }: { profil: AttekintesProfil }) {
  const pathname = usePathname();
  const tabs = TABS_BY_PROFIL[profil];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md border-t border-[var(--at-border)] bg-[var(--at-card)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
              active ? "font-medium text-[var(--at-accent)]" : "text-[var(--at-muted)]"
            )}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
