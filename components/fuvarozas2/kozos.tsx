import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Allapot } from "@/lib/fuvarozas/allapot";

export const ALLAPOT_CIMKE: Record<Allapot, string> = {
  ellenorzesre_var: "Ellenőrzésre vár",
  tervezett: "Tervezett",
  folyamatban: "Folyamatban",
  teljesitve: "Teljesítve · fotóra vár",
  szamlazhato: "Számlázható",
  szamlazva: "Számlázva",
  email_elment: "E-mail elment",
  postazva: "Postázva",
  lezart: "Lezárt",
};

// A terv jelzőszínei: menta = rendben/pénz, borostyán = figyelem, vörös =
// gond, kék = információ/terv, sötét = lezárt.
const ALLAPOT_SZIN: Record<Allapot, string> = {
  ellenorzesre_var: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  tervezett: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
  folyamatban: "bg-[var(--f2-blue)] text-white",
  teljesitve: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  szamlazhato: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  szamlazva: "bg-[var(--f2-mint)] text-white",
  email_elment: "bg-[var(--f2-mint-l)] text-[var(--f2-mint)]",
  postazva: "bg-[var(--f2-dark)] text-white",
  lezart: "bg-[var(--secondary)] text-[var(--muted-foreground)]",
};

export function AllapotBadge({ allapot, className }: { allapot: Allapot; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", ALLAPOT_SZIN[allapot], className)}>
      {ALLAPOT_CIMKE[allapot]}
    </Badge>
  );
}

export function JellegBadge({ jelleg }: { jelleg: "ber" | "sajat" }) {
  return <Badge variant="secondary">{jelleg === "ber" ? "Bér" : "Saját"}</Badge>;
}

export function formatFt(n: number | null | undefined, penznem = "Ft") {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("hu-HU").format(n)} ${penznem}`;
}

export function formatIdo(t: string | null | undefined) {
  if (!t) return "—";
  let s = t.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatNap(nap: string | null | undefined) {
  if (!nap) return "—";
  const [, m, d] = nap.split("-");
  return `${m}.${d}.`;
}

const FULEK = [
  { href: "/fuvarozas2", label: "Ma" },
  { href: "/fuvarozas2/megbizasok", label: "Megbízások" },
  { href: "/fuvarozas2/levelek", label: "Levelek" },
  { href: "/fuvarozas2/tervezes", label: "Tervezés" },
  { href: "/fuvarozas2/elszamolas", label: "Elszámolás" },
  { href: "/fuvarozas2/partnerek", label: "Partnerek" },
  { href: "/fuvarozas2/kimutatas", label: "Kimutatás" },
];

export function Fuvarozas2Fulek({ aktiv }: { aktiv: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {FULEK.map((f) => (
        <Link
          key={f.href}
          href={f.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            aktiv === f.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {f.label}
        </Link>
      ))}
      <Link href="/fuvarozas" className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
        régi Fuvarozás →
      </Link>
    </nav>
  );
}
