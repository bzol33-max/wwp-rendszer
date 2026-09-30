import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import { regiFuvarozasAktiv } from "@/lib/fuvarozas2/flag";

// A Fuvarozás 2 fülsora. Szerver-komponens, mert a jogosultság dönti, mit
// mutat: az „elszamolas" hatókör (Szabina) a Megbízásokat és a Leveleket
// látja — GPS-részletet, tervezést, kimutatást és rendszer-egészséget nem
// (S16). Az Elszámolás és a Partnerek fül 2026-09-25-én beolvadt a
// Megbízások munkaasztalba (az oldalaik elérhetők maradnak linkről).
const FULEK: { href: string; label: string; csakFuvarozas?: boolean; csakRendszer?: boolean }[] = [
  { href: "/fuvarozas2", label: "Ma" },
  { href: "/fuvarozas2/megbizasok", label: "Megbízások" },
  { href: "/fuvarozas2/kalkulator", label: "Kalkulátor", csakFuvarozas: true },
  { href: "/fuvarozas2/levelek", label: "Levelek" },
  { href: "/fuvarozas2/tervezes", label: "Tervezés", csakFuvarozas: true },
  { href: "/fuvarozas2/gps", label: "Élő GPS", csakFuvarozas: true },
  { href: "/fuvarozas2/kimutatas", label: "Kimutatás", csakFuvarozas: true },
  { href: "/fuvarozas2/rendszer", label: "Rendszer", csakRendszer: true },
];

export async function Fuvarozas2Fulek({ aktiv, cim }: { aktiv: string; cim?: string }) {
  const session = await requireSession();
  const fuvarozas = session.can("fuvarozas").view;
  const rendszer = session.can("rendszer").view;
  const lathato = FULEK.filter((f) => (f.csakFuvarozas ? fuvarozas : true) && (f.csakRendszer ? rendszer || fuvarozas : true));
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b pb-2">
      {cim ? <h1 className="mr-4 text-lg font-semibold tracking-tight">{cim}</h1> : null}
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
      {/* A régi Fuvarozás a kapcsolóig (FUVAROZAS_REGI=off) érhető el — utána nincs mire linkelni. */}
      {fuvarozas && regiFuvarozasAktiv() ? (
        <Link href="/fuvarozas" className="ml-auto rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
          régi Fuvarozás →
        </Link>
      ) : null}
    </nav>
  );
}
