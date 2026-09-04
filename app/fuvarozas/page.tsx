import { PageHeader } from "@/components/layout/page-header";
import { GpsStatus } from "@/components/fuvarozas/gps-status";
import { TollCalculator } from "@/components/fuvarozas/toll-calculator";

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás"
        subtitle="A két DAF valós idejű pozíciója (Ecofleet) és útdíjkalkulátor. A fuvarkezelés a következő lépés."
      />
      <GpsStatus />
      <TollCalculator />
    </div>
  );
}
