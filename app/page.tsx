import Link from "next/link";
import { Building2, MapPin, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ModuleStatusBadge } from "@/components/layout/module-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SITES } from "@/lib/nav";
import { MODULES } from "@/lib/modules";

export default function Home() {
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
          {MODULES.map((mod) => {
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
    </div>
  );
}
