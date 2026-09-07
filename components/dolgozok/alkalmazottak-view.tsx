"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeCard } from "@/components/dolgozok/employee-card";
import { ElolegPanel } from "@/components/dolgozok/eloleg-panel";
import { EmployeesManager } from "@/components/dolgozok/employees-manager";
import { useCanEdit } from "@/components/auth/edit-permission-context";
import { HU_MONTHS, wageMode, type Snapshot } from "@/lib/dolgozok/shared";
import { getAlkalmazottakSnapshot } from "@/lib/dolgozok/actions";

// Ez a két név mindig kiemelt, teljes szélességű csempét kap a rács alatt —
// ugyanaz a kártyatartalom, csak vizuálisan elkülönítve.
const FEATURED_NAMES = ["Oszlánszki Tamás", "Budaházi Zoltán"];

export function AlkalmazottakView() {
  const canEdit = useCanEdit();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [showManager, setShowManager] = useState(false);

  const load = useCallback(async () => {
    const snap = await getAlkalmazottakSnapshot();
    setSnapshot(snap);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading || !snapshot) {
    return <p className="text-sm text-muted-foreground">Betöltés…</p>;
  }

  const { pointer, employees, weekly, napiHavi, advances } = snapshot;
  const withMode = employees.filter((e) => wageMode(e) !== "none");
  const featured = withMode.filter((e) => FEATURED_NAMES.includes(e.name));
  const grid = withMode.filter((e) => !FEATURED_NAMES.includes(e.name));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Alkalmazottak"
        subtitle={`${HU_MONTHS[pointer.month - 1]} ${pointer.year}`}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowManager((v) => !v)}>
                {showManager ? "Bezár" : "Dolgozók kezelése"}
              </Button>
            )}
            <Link href="/dolgozok/archivum" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Archívum
            </Link>
          </>
        }
      />

      {showManager && (
        <EmployeesManager employees={employees} onChanged={load} />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grid.map((e) => (
              <EmployeeCard
                key={e.id}
                employee={e}
                heti={weekly.filter((r) => r.employee_id === e.id)}
                napiHavi={napiHavi.find((r) => r.employee_id === e.id)}
                canEdit={canEdit}
                onReload={load}
              />
            ))}
          </div>
          {featured.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
              heti={weekly.filter((r) => r.employee_id === e.id)}
              napiHavi={napiHavi.find((r) => r.employee_id === e.id)}
              canEdit={canEdit}
              featured
              onReload={load}
            />
          ))}
        </div>
        <ElolegPanel employees={withMode} advances={advances} canEdit={canEdit} onReload={load} />
      </div>
    </div>
  );
}
