"use client";

import dynamic from "next/dynamic";
import type { TerkepAdat } from "@/lib/proto/dashboard";

const Belso = dynamic(() => import("@/components/proto/dash-terkep-belso").then((m) => m.DashTerkepBelso), {
  ssr: false,
  loading: () => <div style={{ height: "100%", minHeight: 170 }} />,
});

export function DashTerkep({ adat }: { adat: TerkepAdat }) {
  return <Belso adat={adat} />;
}
