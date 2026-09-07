import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getArchiveList } from "@/lib/dolgozok/actions";

export default async function ArchivumPage() {
  const months = await getArchiveList();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Alkalmazottak — Archívum" subtitle="Lezárt hónapok listája, csak megtekinthető." />
      <Card>
        <CardContent className="p-0">
          {months.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Még nincs lezárt hónap.</p>
          ) : (
            <ul className="divide-y">
              {months.map((m) => (
                <li key={`${m.year}-${m.month}`}>
                  <Link
                    href={`/dolgozok/archivum/${m.year}/${m.month}`}
                    className="block px-4 py-3 text-sm hover:bg-muted"
                  >
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
