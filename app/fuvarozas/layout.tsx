import { ModuleGate } from "@/components/auth/module-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="fuvarozas">{children}</ModuleGate>;
}
