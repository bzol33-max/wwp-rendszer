"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NyiregyhazaHaviTab } from "@/components/keszlet/nyiregyhaza-havi";
import { TelephelyekView } from "@/components/keszlet/telephelyek-view";

const TABS = ["havi", "Nyíregyháza", "Balkány", "Szakoly", "osszkeszlet", "archivum"] as const;
type Tab = (typeof TABS)[number];

function currentMonthLabel() {
  const raw = new Date().toLocaleDateString("hu-HU", { month: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isTab(v: string | null): v is Tab {
  return !!v && (TABS as readonly string[]).includes(v);
}

// A kiválasztott fület a URL-ben (?tab=...) tartjuk, hogy a böngésző
// frissítésekor (F5) az oldal ne ugorjon vissza az alapértelmezett fülre.
function KeszletTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : "havi");

  const tabLabel: Record<Tab, string> = {
    havi: currentMonthLabel(),
    Nyíregyháza: "Nyíregyháza",
    Balkány: "Balkány",
    Szakoly: "Szakoly",
    osszkeszlet: "Összkészlet",
    archivum: "Archívum",
  };

  function handleTabChange(v: string) {
    if (!isTab(v)) return;
    setTab(v);
    router.replace(`/keszlet?tab=${encodeURIComponent(v)}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
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
        <TelephelyekView site="Nyíregyháza" />
      </TabsContent>
      <TabsContent value="Balkány" className="mt-5">
        <TelephelyekView site="Balkány" />
      </TabsContent>
      <TabsContent value="Szakoly" className="mt-5">
        <TelephelyekView site="Szakoly" />
      </TabsContent>
      <TabsContent value="osszkeszlet" className="mt-5">
        <TelephelyekView site="Összkészlet" />
      </TabsContent>
      <TabsContent value="archivum" className="mt-5">
        <p className="text-sm text-muted-foreground">
          Lezárt hónapok típusonkénti összesítése — csak megtekinthető. (Hamarosan.)
        </p>
      </TabsContent>
    </Tabs>
  );
}

export default function KeszletPage() {
  return (
    <div>
      <PageHeader
        title="Készlet"
        subtitle="Raklap- és eszközkészlet telephelyenként"
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Betöltés…</p>}>
        <KeszletTabs />
      </Suspense>
    </div>
  );
}
