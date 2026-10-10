import { PageHeader } from "@/components/layout/page-header";
import { ModuleGate } from "@/components/auth/module-gate";
import { JarmuvekNezet } from "@/components/jarmuvek/jarmuvek-nezet";
import { getJarmuvekOldal } from "@/lib/jarmuvek/actions";
import { requireSession } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export default async function Page() {
  // A ModuleGate a jog hiányában csak üzenetet mutat — az adatot is csak
  // akkor kérjük le, ha a felhasználó látja a modult (az akció maga is ellenőriz).
  const session = await requireSession();
  const adat = session.can("jarmuvek").view ? await getJarmuvekOldal() : null;
  return (
    <ModuleGate module="jarmuvek">
      <div>
        <PageHeader
          title="Járművek"
          subtitle="Kamionok, pótkocsik, sofőrök és a lejáró okmányok — innen kerül fel egy új jármű is."
        />
        {adat && <JarmuvekNezet adat={adat} />}
      </div>
    </ModuleGate>
  );
}
