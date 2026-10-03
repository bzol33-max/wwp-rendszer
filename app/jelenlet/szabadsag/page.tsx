import { ModuleGate } from "@/components/auth/module-gate";
import { PageHeader } from "@/components/layout/page-header";
import { SzabadsagView } from "@/components/jelenlet/szabadsag-view";
import { getSzabadsagIgenyek, getSzabadsagMerlegek } from "@/lib/jelenlet/actions";

// Az évet keresés-paraméter hordozza (?ev=2027), nem kliens-állapot: így az
// évváltás a szerveren szedi elő a másik év igényeit, és a link is megosztható.
export default async function SzabadsagPage({
  searchParams,
}: {
  searchParams: Promise<{ ev?: string }>;
}) {
  const { ev: evParam } = await searchParams;
  const mostaniEv = new Date().getUTCFullYear();
  const kert = Number(evParam);
  // Csak értelmes évet fogadunk el — elírt paraméterrel az idei év jön.
  const ev = Number.isInteger(kert) && kert >= 2020 && kert <= 2100 ? kert : mostaniEv;

  return (
    <ModuleGate module="jelenlet">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Szabadság"
          subtitle="Kinek mennyi kerete van, ki mikor van távol, és mi vár jóváhagyásra."
        />
        <SzabadsagAdat ev={ev} />
      </div>
    </ModuleGate>
  );
}

async function SzabadsagAdat({ ev }: { ev: number }) {
  const [igenyek, merlegek] = await Promise.all([
    getSzabadsagIgenyek(ev),
    getSzabadsagMerlegek(),
  ]);
  return <SzabadsagView ev={ev} igenyek={igenyek} merlegek={merlegek} />;
}
