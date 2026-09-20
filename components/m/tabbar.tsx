"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Receipt, Sun, UserRound } from "lucide-react";

const IKON = { nap: Sun, naptar: CalendarDays, papir: FileText, szamla: Receipt, profil: UserRound } as const;
export type MTab = { href: string; label: string; ikon: keyof typeof IKON };

/** A sofőr és az iroda más füleket lát — a szerepet az app/m/layout.tsx dönti el. */
export const SOFOR_TABOK: MTab[] = [
  { href: "/m", label: "Ma", ikon: "nap" },
  { href: "/m/holnap", label: "Holnap", ikon: "naptar" },
  { href: "/m/profil", label: "Profil", ikon: "profil" },
];
export const IRODA_TABOK: MTab[] = [
  { href: "/m/papir", label: "Papír", ikon: "papir" },
  { href: "/m/szamla", label: "Számla és posta", ikon: "szamla" },
  { href: "/m/profil", label: "Profil", ikon: "profil" },
];

export function MTabbar({ tabok }: { tabok: MTab[] }) {
  const p = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-[var(--m-line)] bg-[var(--m-surf)] pb-[env(safe-area-inset-bottom)]">
      {tabok.map((t) => {
        const aktiv = t.href === "/m" ? p === "/m" : p.startsWith(t.href);
        const I = IKON[t.ikon];
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
