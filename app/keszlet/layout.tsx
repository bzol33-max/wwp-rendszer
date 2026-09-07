import { ModuleGate } from "@/components/auth/module-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="keszlet">{children}</ModuleGate>;
}
