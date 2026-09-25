import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEPESEK, lepesAllapotbol, type Allapot, type Lepes } from "@/lib/fuvarozas/allapot";

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

const LEPES_SZIN: Record<Lepes, string> = {
  beerkezett: "bg-[var(--f2-blue-l)] text-[var(--f2-blue)]",
  uton: "bg-[var(--f2-blue)] text-white",
  szamlazando: "bg-[var(--f2-amb-l)] text-[var(--f2-amb)]",
  postara: "bg-[var(--f2-mint)] text-white",
  kesz: "bg-[var(--secondary)] text-[var(--muted-foreground)]",
};

/** Az öt lépés egyike (LEPESEK) — a lista ezt mutatja a kilenc belső állapot helyett. */
export function LepesBadge({ allapot, className }: { allapot: Allapot; className?: string }) {
  const l = lepesAllapotbol(allapot);
  return (
    <Badge variant="outline" className={cn("border-transparent", LEPES_SZIN[l], className)} title={ALLAPOT_CIMKE[allapot]}>
      {LEPESEK.find((x) => x.kulcs === l)!.cimke}
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
