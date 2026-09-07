import { ModuleGate } from "@/components/auth/module-gate";
import { JelenletView } from "@/components/jelenlet/jelenlet-view";

export default function Page() {
  return (
    <ModuleGate module="jelenlet">
      <JelenletView />
    </ModuleGate>
  );
}
