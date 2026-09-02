import type { LucideIcon } from "lucide-react";
import {
  Truck,
  Package,
  Receipt,
  Users,
  Car,
  LayoutDashboard,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Info", icon: LayoutDashboard },
  { href: "/fuvarozas", label: "Fuvarozás", icon: Truck },
  { href: "/keszlet", label: "Készlet", icon: Package },
  { href: "/szamlak", label: "Számlák", icon: Receipt },
  { href: "/dolgozok", label: "Dolgozók", icon: Users },
  { href: "/jarmuvek", label: "Járművek", icon: Car },
];

export const SITES = ["Szakoly", "Balkány", "Nyíregyháza"] as const;
export type Site = (typeof SITES)[number];
