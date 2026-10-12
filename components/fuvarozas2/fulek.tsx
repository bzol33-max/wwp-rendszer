import Link from "next/link";
import { Settings } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

// A Fuvarozás 2 fülsora. Szerver-komponens, mert a jogosultság dönti, mit
// mutat: az „elszamolas" hatókör (Szabina) a Megbízásokat (Lista, Levelek,
// Partnerek) és a Költségeket látja — GPS-részletet, tervezést, kimutatást és rendszer-
// egészséget nem (S16).
//
// 2026-10-11: 11 fül helyett 4 fő fül + fogaskerék (claude/… „4 fül” terv):
// Ma (élő) · Tervezés · Megbízások · Eredmény · ⚙ Rendszer. A régi oldalak
// VÁLTOZATLAN címen, a főfül alatti alfülként érhetők el — így minden régi
// link és a Timocom „→ WWP” gomb (/fuvarozas2/timocom#d=…) tovább működik,
// és a jogosultság alfülenként ugyanaz, mint eddig.

type Alful = { href: string; label: string; csakFuvarozas?: boolean; rejtett?: boolean };
type Fofül = { kulcs: string; label: string; alfulek: Alful[] };

const FOFULEK: Fofül[] = [
  // 2026-10-12 (a tulajdonos: „régi és új lapok közt kell keresgetni”): minden
  // funkció pontosan EGY helyen. A régi címek átirányítással élnek tovább
  // (next.config.ts redirects); a rejtett sorok csak azt döntik el, melyik
  // főfül világít, ha az átirányítást valaha visszavesszük.
  {
    kulcs: "ma",
    label: "Ma",
    alfulek: [
      { href: "/fuvarozas2", label: "Most" },
      // Diszpécser: kocsinkénti idővonal, probléma-sáv, lista, térkép — és a nap menetterve (sorrend).
      { href: "/fuvarozas2/diszpecser", label: "Diszpécser", csakFuvarozas: true },
      { href: "/fuvarozas2/gps", label: "GPS", csakFuvarozas: true },
    ],
  },
  {
    kulcs: "tervezes",
    label: "Tervezés",
    alfulek: [
      { href: "/fuvarozas2/tervezes", label: "A hét", csakFuvarozas: true },
      // Ajánlat: Timocom → WWP (a böngésző „→ WWP” gombja ide küld) + kézi kalkulátor.
      // A cím szándékosan /timocom marad.
      { href: "/fuvarozas2/timocom", label: "Ajánlat", csakFuvarozas: true },
      // A külön Kalkulátor-lap → /fuvarozas2/timocom átirányítás (next.config.ts).
      { href: "/fuvarozas2/kalkulator", label: "Kalkulátor", csakFuvarozas: true, rejtett: true },
    ],
  },
  {
    kulcs: "megbizasok",
    label: "Megbízások",
    alfulek: [
      { href: "/fuvarozas2/megbizasok", label: "Lista" },
      { href: "/fuvarozas2/levelek", label: "Levelek" },
      { href: "/fuvarozas2/partnerek", label: "Partnerek" },
      // Az Elszámolás → a Megbízások pénz-nézete (next.config.ts átirányítás).
      { href: "/fuvarozas2/elszamolas", label: "Elszámolás", rejtett: true },
    ],
  },
  {
    kulcs: "eredmeny",
    label: "Eredmény",
    alfulek: [
      // Az új Eredmény-áttekintés (2026-10-11): három kérdés, vízesés, havi fedezet, megbízók.
      { href: "/fuvarozas2/eredmeny", label: "Áttekintés", csakFuvarozas: true },
      { href: "/fuvarozas2/kimutatas", label: "Kimutatás", csakFuvarozas: true },
      // Költségek (5. fázis): az Elszámolás hatóköre is látja (HU-GO import, tankolások).
      { href: "/fuvarozas2/koltsegek", label: "Költségek" },
    ],
  },
];

const RENDSZER = "/fuvarozas2/rendszer";

export async function Fuvarozas2Fulek({ aktiv, cim }: { aktiv: string; cim?: string }) {
  const session = await requireSession();
  const fuvarozas = session.can("fuvarozas").view;
  const rendszer = session.can("rendszer").view || fuvarozas;
  const lathato = (a: Alful) => (a.csakFuvarozas ? fuvarozas : true);

  const fulek = FOFULEK.map((f) => ({ ...f, alfulek: f.alfulek.filter(lathato) })).filter((f) => f.alfulek.length > 0);
  const aktivFofül = fulek.find((f) => f.alfulek.some((a) => a.href === aktiv)) ?? null;
  const alfulek = aktivFofül ? aktivFofül.alfulek.filter((a) => !a.rejtett) : [];

  return (
    <div className="flex flex-col gap-1 border-b pb-2">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Fuvarozás">
        {cim ? <h1 className="mr-4 text-lg font-semibold tracking-tight">{cim}</h1> : null}
        {fulek.map((f) => {
          const elso = f.alfulek.find((a) => !a.rejtett) ?? f.alfulek[0];
          const aktivE = aktivFofül?.kulcs === f.kulcs;
          return (
            <Link
              key={f.kulcs}
              href={elso.href}
              aria-current={aktivE ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                aktivE ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          );
        })}
        {rendszer ? (
          <Link
            href={RENDSZER}
            aria-label="Rendszer és beállítások"
            title="Rendszer és beállítások"
            aria-current={aktiv === RENDSZER ? "page" : undefined}
            className={cn(
              "ml-auto inline-flex size-9 items-center justify-center rounded-md transition-colors",
              aktiv === RENDSZER ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Settings className="size-4" aria-hidden />
          </Link>
        ) : null}
      </nav>
      {alfulek.length > 1 ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label={`${aktivFofül?.label} részei`}>
          {alfulek.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-current={aktiv === a.href ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                aktiv === a.href ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {a.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
