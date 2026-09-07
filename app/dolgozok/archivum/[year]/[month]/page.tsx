import { ArchiveMonthView } from "@/components/dolgozok/archive-month-view";
import { getArchivedMonth } from "@/lib/dolgozok/actions";

export default async function ArchivedMonthPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const { year, month } = await params;
  const snapshot = await getArchivedMonth(Number(year), Number(month));
  return <ArchiveMonthView snapshot={snapshot} />;
}
