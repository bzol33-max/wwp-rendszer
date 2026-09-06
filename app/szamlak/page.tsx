import { PageHeader } from "@/components/layout/page-header";
import { SzamlakView } from "@/components/szamlak/szamlak-view";

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Számlák"
        subtitle="Kintlévőség-követő — a Számlázz.hu-ban kiállított számlákat tükrözi vissza."
      />
      <SzamlakView />
    </div>
  );
}
