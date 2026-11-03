"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LAPOK = [
  { href: "/proto", cimke: "Áttekintés" },
  { href: "/proto/kereso", cimke: "Fuvarok" },
  { href: "/proto/penz", cimke: "Pénz" },
  { href: "/proto/terv", cimke: "Terv" },
];

export function ProtoNav() {
  const ut = usePathname();
  const aktiv = (href: string) => (href === "/proto" ? ut === href : ut.startsWith(href));
  return (
    <>
      <nav className="sticky top-0 z-20 hidden items-center gap-1 border-b bg-card px-6 py-2 md:flex" aria-label="Prototípus">
        <span className="mr-4 text-sm font-semibold text-primary">WWP új rendszer</span>
        {LAPOK.map((l) => (
          <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 text-sm ${aktiv(l.href) ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}>
            {l.cimke}
          </Link>
        ))}
        <Link href="/fuvarozas2" className="ml-auto text-sm text-muted-foreground hover:underline">Vissza a mostani apphoz</Link>
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Prototípus">
        {LAPOK.map((l) => (
          <Link key={l.href} href={l.href} className={`py-3 text-center text-xs ${aktiv(l.href) ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            {l.cimke}
          </Link>
        ))}
      </nav>
    </>
  );
}
