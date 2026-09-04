"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GpsStatus } from "@/components/fuvarozas/gps-status";
import { TollCalculator } from "@/components/fuvarozas/toll-calculator";

const TABS = ["kalkulator", "gps"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  kalkulator: "Kalkulátor",
  gps: "GPS",
};

function isTab(v: string | null): v is Tab {
  return !!v && (TABS as readonly string[]).includes(v);
}

// A kiválasztott fület a URL-ben (?tab=...) tartjuk, hogy a böngésző
// frissítésekor (F5) az oldal ne ugorjon vissza az alapértelmezett fülre.
function FuvarozasTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : "kalkulator");

  function handleTabChange(v: string) {
    if (!isTab(v)) return;
    setTab(v);
    router.replace(`/fuvarozas?tab=${encodeURIComponent(v)}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTrigger key={t} value={t}>
            {TAB_LABEL[t]}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="kalkulator" className="mt-5">
        <TollCalculator />
      </TabsContent>
      <TabsContent value="gps" className="mt-5">
        <GpsStatus />
      </TabsContent>
    </Tabs>
  );
}

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Fuvarozás"
        subtitle="Útdíj- és km-kalkulátor, valamint a két DAF valós idejű pozíciója (Ecofleet). A fuvarkezelés a következő lépés."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Betöltés…</p>}>
        <FuvarozasTabs />
      </Suspense>
    </div>
  );
}
