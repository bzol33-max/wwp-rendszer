"use client";

import { EmployeeCard } from "@/components/dolgozok/employee-card";
import { PageHeader } from "@/components/layout/page-header";
import { wageMode, HU_MONTHS, type ArchivedSnapshot } from "@/lib/dolgozok/shared";

function noop() {}

export function ArchiveMonthView({ snapshot }: { snapshot: ArchivedSnapshot }) {
  const { year, month, employees, weekly, napiHavi } = snapshot;
  const withMode = employees.filter((e) => wageMode(e) !== "none");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Alkalmazottak — Archívum"
        subtitle={`${HU_MONTHS[month - 1]} ${year} — lezárt hónap, csak megtekinthető`}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {withMode.map((e) => (
          <EmployeeCard
            key={e.id}
            employee={e}
            heti={weekly.filter((r) => r.employee_id === e.id)}
            napiHavi={napiHavi.find((r) => r.employee_id === e.id)}
            canEdit={false}
            readonly
            onReload={noop}
          />
        ))}
      </div>
    </div>
  );
}
