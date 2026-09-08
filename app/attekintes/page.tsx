import Link from "next/link";
import { ChevronRight, LogOut, Package, Truck, Wallet } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { JARMU_SZIN_DOT_CLASS } from "@/lib/fuvarozas/vehicles";
import {
  getFelvasarlasOsszefoglalo,
  getJarmuPoziciok,
  getLejartSzamlaSzam,
} from "@/lib/attekintes/actions";

function formatFt(n: number) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}

export default async function AttekintesPage() {
  const session = await requireSession();
  if (!session.can("attekintes").view) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 bg-muted/40 px-4 text-center">
        <p className="text-sm text-muted-foreground">Nincs jogosultságod ehhez a nézethez.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Vissza a bejelentkezéshez
        </Link>
      </div>
    );
  }

  const [felvasarlas, lejartSzam, poziciok] = await Promise.all([
    getFelvasarlasOsszefoglalo(),
    getLejartSzamlaSzam(),
    getJarmuPoziciok(),
  ]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-muted/40 px-4 py-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          <h1 className="text-base font-semibold text-foreground">Áttekintés</h1>
          <p className="text-xs text-muted-foreground">{session.name}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="flex items-center gap-1 hover:text-foreground">
            <LogOut className="h-3.5 w-3.5" />
            Kijelentkezés
          </button>
        </form>
      </div>

      <Link
        href="/attekintes/felvasarlas"
        className="rounded-xl border bg-card p-4 transition-colors active:bg-muted/60"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-muted-foreground" />
            Felvásárlás
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">EUR világos</div>
            <div className="text-xl font-bold tabular-nums">+{felvasarlas.eurVilagosMa}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">EUR szürke</div>
            <div className="text-xl font-bold tabular-nums">+{felvasarlas.eurSzurkeMa}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">H1 raklap</div>
            <div className="text-xl font-bold tabular-nums">+{felvasarlas.h1Ma}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">Gitterbox</div>
            <div className="text-xl font-bold tabular-nums">+{felvasarlas.gitterboxMa}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Kassza egyenleg
          </div>
          <div
            className={`text-xl font-bold tabular-nums ${
              felvasarlas.kassza < 0 ? "text-destructive" : ""
            }`}
          >
            {formatFt(felvasarlas.kassza)}
          </div>
        </div>
      </Link>

      <Link
        href="/attekintes/szamlak"
        className="rounded-xl border bg-card p-4 transition-colors active:bg-muted/60"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            Számlák
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold tabular-nums ${
              lejartSzam > 0 ? "text-destructive" : ""
            }`}
          >
            {lejartSzam}
          </span>
          <span className="text-sm text-muted-foreground">lejárt számla</span>
        </div>
      </Link>

      <Link
        href="/attekintes/fuvarozas"
        className="rounded-xl border bg-card p-4 transition-colors active:bg-muted/60"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Fuvarozás
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          {poziciok.map((p) => (
            <div
              key={p.jarmu.sofor}
              className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${JARMU_SZIN_DOT_CLASS[p.jarmu.szin]}`} />
                <span className="truncate">{p.jarmu.sofor}</span>
              </div>
              {p.sebesseg !== null ? (
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {Math.round(p.sebesseg)} km/h
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">nincs GPS</span>
              )}
            </div>
          ))}
        </div>
      </Link>
    </div>
  );
}
