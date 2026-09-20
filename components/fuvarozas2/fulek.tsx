import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

// A Fuvarozás 2 fülsora. Szerver-komponens, mert a jogosultság dönti, mit
// mutat: az „elszamolas" hatókör (Szabina) csak az Elszámolást, a
// Megbízásokat, a Leveleket és a Partnereket látja — GPS-részletet,
// tervezést, kimutatást és rendszer-egészséget nem (S16).
const FULEK: { href: string; label: string; csakFuvarozas?: boolean; csakRendszer?: boolean }[] = [
  { href: "/fuvarozas2", label: "Ma" },
  { href: "/fuvarozas2/megbizasok", label: "Megbízások" },
  { href: "/fuvarozas2/levelek", label: "Levelek" },
  { href: "/fuvarozas2/tervezes", label: "Tervezés", csakFuvarozas: true },
  { href: "/fuvarozas2/gps", label: "Élő GPS", csakFuvarozas: true },
  { href: "/fuvarozas2/kalkulator", label: "Kalkulátor", csakFuvarozas: true },
  { href: "/fuvarozas2/elszamolas", label: "Elszámolás" },
  { href: "/fuvarozas2/partnerek", label: "Partnerek" },
  { href: "/fuvarozas2/kimutatas", label: "Kimutatás", csakFuvarozas: true },
  { href: "/fuvarozas2/rendszer", label: "Rendszer", csakRendszer: true },
];

export async function Fuvarozas2Fulek({ aktiv }: { aktiv: string }) {
  const session = await requireSession();
  const fuvarozas = session.can("fuvarozas").view;
  const rendszer = session.can("rendszer").view;
  const lathato = FULEK.filter((f) => (f.csakFuvarozas ? fuvarozas : true) && (f.csakRendszer ? rendszer || fuvarozas : true));
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {lathato.map((f) => (
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
      {fuvarozas ? (
        <Link href="/fuvarozas" className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
          régi Fuvarozás →
        </Link>
      ) : null}
    </nav>
  );
}
