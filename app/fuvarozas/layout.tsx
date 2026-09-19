import { redirect } from "next/navigation";
import { ModuleGate } from "@/components/auth/module-gate";
import { regiFuvarozasAktiv } from "@/lib/fuvarozas2/flag";

export default function Layout({ children }: { children: React.ReactNode }) {
  // Cutover: FUVAROZAS_REGI=off → a régi modul helyett az új (lib/fuvarozas2/flag.ts).
  if (!regiFuvarozasAktiv()) redirect("/fuvarozas2");
  return <ModuleGate module="fuvarozas">{children}</ModuleGate>;
}
