"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ErkezesWidget } from "@/components/jelenlet/erkezes-widget";
import { FeladatokCsempe } from "@/components/jelenlet/feladatok-csempe";

export function JelenletView() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Jelenléti/üzenőfal" subtitle="Napi érkezés és feladatok" />
      <div className="flex w-full max-w-sm flex-col gap-4">
        <ErkezesWidget />
        <FeladatokCsempe />
      </div>
    </div>
  );
}
