import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Building2, MapPin, ArrowRight, Smartphone, Mail } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBadge } from "@/components/layout/module-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SITES } from "@/lib/nav";
import { MODULES } from "@/lib/modules";
import { requireSession } from "@/lib/auth/dal";
import type { ModuleKey } from "@/lib/auth/permissions";

export default async function Home() {
  const session = await requireSession();

  // Akinek van "attekintes" (vezetői, mobilra tervezett csempés/tabsávos
  // nézet) joga, és éppen mobil eszközről jelentkezett be (proxy.ts a
  // User-Agent alapján állítja be a "wwp_device" sütit — lásd
  // lib/device.ts), azt bejelentkezés után rögtön az Áttekintésre
  // irányítjuk, akkor is, ha egyébként a teljes asztali modulrácshoz is
  // hozzáférése van — mobilon ez az ő kezdőképernyője, nem az Info.
  const isMobileDevice = (await cookies()).get("wwp_device")?.value === "mobile";
  if (isMobileDevice && session.can("attekintes").view) {
    redirect("/attekintes");
  }

  const visibleModules = MODULES.filter(
    (mod) => session.can(mod.key as ModuleKey).view
  );

  // Aki egyelőre csak egy önálló, korlátozott nézethez (mobil összefoglaló,
  // posta vagy saját érkezés) kap jogot (egyik teljes modulhoz sincs
  // hozzáférése), azt bejelentkezés után rögtön oda irányítjuk — neki ez a
  // kezdőlap üres modul-rácsot mutatna.
  if (visibleModules.length === 0) {
    if (session.can("mobil").view) redirect("/mobil");
    if (session.can("posta").view) redirect("/posta");
    if (session.can("erkezes").view) redirect("/erkezes");
    if (session.can("felvasarlas_mobil").view) redirect("/felvasarlas");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Info"
        subtitle="Well-Worn Pallet Kft. — a rendszer áttekintése és gyorslinkek a modulokhoz"
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Cégadatok
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="font-medium">Well-Worn Pallet Kft.</div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Telephelyek: {SITES.join(" · ")}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Modulok
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.key} href={mod.href} className="group block">
                <Card className="h-full transition-colors group-hover:ring-foreground/20">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {mod.label}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      {mod.description}
                    </p>
                    <ModuleStatusBadge status={mod.status} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/mobil"
          className="flex items-center gap-2 self-start rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Mobil összefoglaló nézet (mai felvásárlás, kassza, kocsinkénti megbízások)
        </Link>
        {(session.can("fuvarozas").view || session.can("posta").view) && (
          <Link
            href="/posta"
            className="flex items-center gap-2 self-start rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" />
            Posta nézet (bér fuvarok postázásra várva, csempénként)
          </Link>
        )}
      </div>
    </div>
  );
}
