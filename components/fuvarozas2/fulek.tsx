import Link from "next/link";
import { Settings } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import { FOFULEK, aktivFofulKulcs, type Alful } from "@/lib/fuvarozas2/fulek-szerkezet";

// A Fuvarozás 2 fülsora. Szerver-komponens, mert a jogosultság dönti, mit
// mutat (a `csakFuvarozas` alfülek csak a „fuvarozas" nézési joggal látszanak).
// A fülszerkezet (FOFULEK) és a magyarázata: lib/fuvarozas2/fulek-szerkezet.ts.

const RENDSZER = "/fuvarozas2/rendszer";

export async function Fuvarozas2Fulek({ aktiv, cim, cimNagy = false }: { aktiv: string; cim?: string; cimNagy?: boolean }) {
  const session = await requireSession();
  const fuvarozas = session.can("fuvarozas").view;
  const rendszer = session.can("rendszer").view || fuvarozas;
  const lathato = (a: Alful) => (a.csakFuvarozas ? fuvarozas : true);

  const fulek = FOFULEK.map((f) => ({ ...f, alfulek: f.alfulek.filter(lathato) })).filter((f) => f.alfulek.length > 0);
  const aktivKulcs = aktivFofulKulcs(fulek, aktiv);
  const aktivFofül = fulek.find((f) => f.kulcs === aktivKulcs) ?? null;
  const alfulek = aktivFofül ? aktivFofül.alfulek : [];

  return (
    <div className="flex flex-col gap-1 border-b pb-2">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Fuvarozás">
        {cim ? <h1 className={cn("mr-4 tracking-tight", cimNagy ? "text-2xl font-bold" : "text-lg font-semibold")}>{cim}</h1> : null}
        {fulek.map((f) => {
          const elso = f.alfulek[0];
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
