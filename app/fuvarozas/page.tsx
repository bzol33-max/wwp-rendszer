import { PageHeader } from "@/components/layout/page-header";
import { GpsStatus } from "@/components/fuvarozas/gps-status";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Fuvarozás"
        subtitle="A két DAF valós idejű pozíciója (Ecofleet). A fuvarkezelés a következő lépés."
      />
      <GpsStatus />
    </div>
  );
}
