import { SzamlakView } from "@/components/szamlak/szamlak-view";
import { ModuleGate } from "@/components/auth/module-gate";

export default function Page() {
  return (
    <ModuleGate module="szamlak">
      <div>
        <SzamlakView />
      </div>
    </ModuleGate>
  );
}
