import { cn } from "@/lib/utils";
import { MODULE_STATUS_LABEL, type ModuleStatus } from "@/lib/modules";

const STATUS_STYLES: Record<ModuleStatus, string> = {
  elkeszult:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  "fejlesztes-alatt":
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  "tervezes-alatt": "border-border bg-transparent text-muted-foreground",
};

export function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status]
      )}
    >
      {MODULE_STATUS_LABEL[status]}
    </span>
  );
}
