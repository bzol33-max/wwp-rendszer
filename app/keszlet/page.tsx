"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleSiteView } from "@/components/keszlet/simple-site-view";
import { NyiregyhazaHaviTab } from "@/components/keszlet/nyiregyhaza-havi";
import { NyiregyhazaFoTab } from "@/components/keszlet/nyiregyhaza-fo";

const SITES = ["Szakoly", "Balkány", "Nyíregyháza"] as const;

export default function KeszletPage() {
  const [site, setSite] = useState<(typeof SITES)[number]>("Szakoly");

  return (
    <div>
      <PageHeader
        title="Készlet"
        subtitle="Raklap- és eszközkészlet telephelyenként"
      />

      <Tabs value={site} onValueChange={(v) => setSite(v as (typeof SITES)[number])}>
        <TabsList>
          {SITES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Szakoly" className="mt-5">
          <SimpleSiteView site="Szakoly" />
        </TabsContent>
        <TabsContent value="Balkány" className="mt-5">
          <SimpleSiteView site="Balkány" />
        </TabsContent>
        <TabsContent value="Nyíregyháza" className="mt-5">
          <Tabs defaultValue="havi">
            <TabsList>
              <TabsTrigger value="havi">Havi fül</TabsTrigger>
              <TabsTrigger value="fo">Nyíregyháza fül</TabsTrigger>
              <TabsTrigger value="archivum">Archívum</TabsTrigger>
            </TabsList>
            <TabsContent value="havi" className="mt-5">
              <NyiregyhazaHaviTab />
            </TabsContent>
            <TabsContent value="fo" className="mt-5">
              <NyiregyhazaFoTab />
            </TabsContent>
            <TabsContent value="archivum" className="mt-5">
              <p className="text-sm text-muted-foreground">
                Lezárt hónapok típusonkénti összesítése — csak megtekinthető. (Hamarosan.)
              </p>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
