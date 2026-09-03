"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleSiteView } from "@/components/keszlet/simple-site-view";
import { NyiregyhazaHaviTab } from "@/components/keszlet/nyiregyhaza-havi";
import { NyiregyhazaFoTab } from "@/components/keszlet/nyiregyhaza-fo";

const TABS = ["havi", "Nyíregyháza", "Balkány", "Szakoly", "archivum"] as const;

function currentMonthLabel() {
  const raw = new Date().toLocaleDateString("hu-HU", { month: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function KeszletPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("havi");

  const tabLabel: Record<(typeof TABS)[number], string> = {
    havi: currentMonthLabel(),
    Nyíregyháza: "Nyíregyháza",
    Balkány: "Balkány",
    Szakoly: "Szakoly",
    archivum: "Archívum",
  };

  return (
    <div>
      <PageHeader
        title="Készlet"
        subtitle="Raklap- és eszközkészlet telephelyenként"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {tabLabel[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="havi" className="mt-5">
          <NyiregyhazaHaviTab />
        </TabsContent>
        <TabsContent value="Nyíregyháza" className="mt-5">
          <NyiregyhazaFoTab />
        </TabsContent>
        <TabsContent value="Balkány" className="mt-5">
          <SimpleSiteView site="Balkány" />
        </TabsContent>
        <TabsContent value="Szakoly" className="mt-5">
          <SimpleSiteView site="Szakoly" />
        </TabsContent>
        <TabsContent value="archivum" className="mt-5">
          <p className="text-sm text-muted-foreground">
            Lezárt hónapok típusonkénti összesítése — csak megtekinthető. (Hamarosan.)
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
